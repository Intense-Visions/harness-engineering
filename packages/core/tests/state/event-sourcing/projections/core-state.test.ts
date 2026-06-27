import { describe, it, expect } from 'vitest';
import {
  projectCoreState,
  toHarnessState,
} from '../../../../src/state/event-sourcing/projections/core-state';
import type { Event } from '../../../../src/state/event-sourcing/events';
import { HarnessStateSchema } from '../../../../src/state/types';

/** Build a well-formed in-memory Event with envelope defaults. */
function ev(
  type: Event['type'],
  payload: unknown,
  over: Partial<{ seq: number; writerId: string; timestamp: string }> = {}
): Event {
  return {
    seq: over.seq ?? 1,
    writerId: over.writerId ?? 'w',
    timestamp: over.timestamp ?? '2026-06-27T10:00:00.000Z',
    scope: { stream: undefined, session: undefined },
    type,
    payload,
  } as Event;
}

describe('projectCoreState — happy path', () => {
  it('folds every core-state variant into the legacy-shaped projection', () => {
    const events: Event[] = [
      ev('position_set', { phase: 'execute', task: 'Task 3' }, { seq: 1 }),
      ev('decision_recorded', { id: 'd1', text: 'use zod', context: 'schema' }, { seq: 2 }),
      ev('decision_recorded', { id: 'd2', text: 'atomic writes' }, { seq: 3 }),
      ev('blocker_opened', { id: 'b1', description: 'missing endpoint' }, { seq: 4 }),
      ev('blocker_resolved', { id: 'b1' }, { seq: 5 }),
      ev('progress_set', { task: 'Task 1', status: 'complete' }, { seq: 6 }),
      ev('progress_set', { task: 'Task 2', status: 'in_progress' }, { seq: 7 }),
      ev(
        'session_summarized',
        { summary: 'did stuff', lastSkill: 'exec', pendingTasks: ['Task 4'] },
        { seq: 8 }
      ),
    ];
    const core = projectCoreState(events);
    expect(core.position).toEqual({ phase: 'execute', task: 'Task 3' });
    expect(core.decisions).toHaveLength(2);
    expect(core.decisions.map((d) => d.decision)).toEqual(['use zod', 'atomic writes']);
    expect(core.decisions[0]).toMatchObject({ decision: 'use zod', context: 'schema' });
    expect(core.decisions[1]).toMatchObject({ decision: 'atomic writes', context: '' });
    expect(core.blockers).toHaveLength(1);
    expect(core.blockers[0]).toEqual({
      id: 'b1',
      description: 'missing endpoint',
      status: 'resolved',
    });
    expect(core.progress).toEqual({ 'Task 1': 'complete', 'Task 2': 'in_progress' });
    expect(core.lastSession).toMatchObject({
      summary: 'did stuff',
      lastSkill: 'exec',
      pendingTasks: ['Task 4'],
    });
  });

  it('returns an empty baseline for no events', () => {
    expect(projectCoreState([])).toEqual({
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
    });
  });
});

describe('projectCoreState — genesis seed (state_imported.legacyState)', () => {
  it('seeds the baseline from a full legacy HarnessState and overlays later events', () => {
    const legacyState = {
      schemaVersion: 1,
      position: { phase: 'plan', task: 'Task 0' },
      decisions: [{ date: '2026-06-01', decision: 'seed decision', context: 'origin' }],
      blockers: [{ id: 'seed-b', description: 'seed blocker', status: 'open' }],
      progress: { 'Task 0': 'complete' },
      lastSession: { date: '2026-06-01', summary: 'imported' },
    };
    const events: Event[] = [
      ev('state_imported', { legacyState }, { seq: 1 }),
      ev('position_set', { phase: 'execute', task: 'Task 9' }, { seq: 2 }),
    ];
    const core = projectCoreState(events);
    // Later position_set overlays the seeded position.
    expect(core.position).toEqual({ phase: 'execute', task: 'Task 9' });
    // Seeded decisions/blockers/progress survive (union, no loss).
    expect(core.decisions).toEqual([
      { date: '2026-06-01', decision: 'seed decision', context: 'origin' },
    ]);
    expect(core.blockers).toEqual([{ id: 'seed-b', description: 'seed blocker', status: 'open' }]);
    expect(core.progress).toEqual({ 'Task 0': 'complete' });
    expect(core.lastSession).toEqual({ date: '2026-06-01', summary: 'imported' });
  });

  it('ignores an invalid legacyState rather than throwing', () => {
    const events: Event[] = [
      ev('state_imported', { legacyState: { nonsense: true } }, { seq: 1 }),
      ev('position_set', { phase: 'execute' }, { seq: 2 }),
    ];
    const core = projectCoreState(events);
    expect(core.position).toEqual({ phase: 'execute' });
    expect(core.decisions).toEqual([]);
  });
});

describe('projectCoreState — field-merge: union (no append lost)', () => {
  it('unions decisions from concurrent writers (interleaved seqs)', () => {
    const events: Event[] = [
      ev('decision_recorded', { id: 'a1', text: 'from a' }, { seq: 1, writerId: 'a' }),
      ev('decision_recorded', { id: 'b1', text: 'from b' }, { seq: 2, writerId: 'b' }),
      ev('decision_recorded', { id: 'a2', text: 'from a2' }, { seq: 3, writerId: 'a' }),
    ];
    const core = projectCoreState(events);
    expect(core.decisions.map((d) => d.decision).sort()).toEqual(['from a', 'from a2', 'from b']);
  });

  it('unions blockers from concurrent writers', () => {
    const events: Event[] = [
      ev('blocker_opened', { id: 'a-b', description: 'a blocker' }, { seq: 1, writerId: 'a' }),
      ev('blocker_opened', { id: 'b-b', description: 'b blocker' }, { seq: 2, writerId: 'b' }),
    ];
    const core = projectCoreState(events);
    expect(core.blockers.map((b) => b.id).sort()).toEqual(['a-b', 'b-b']);
  });
});

describe('projectCoreState — field-merge: scalar last-event-wins on (seq, writerId)', () => {
  it('resolves equal-seq position by higher writerId', () => {
    const events: Event[] = [
      ev('position_set', { phase: 'from-a' }, { seq: 1, writerId: 'a' }),
      ev('position_set', { phase: 'from-b' }, { seq: 1, writerId: 'b' }),
    ];
    expect(projectCoreState(events).position).toEqual({ phase: 'from-b' });
  });

  it('resolves same-task progress by higher seq', () => {
    const events: Event[] = [
      ev('progress_set', { task: 'T', status: 'in_progress' }, { seq: 2 }),
      ev('progress_set', { task: 'T', status: 'complete' }, { seq: 3 }),
    ];
    expect(projectCoreState(events).progress).toEqual({ T: 'complete' });
  });

  it('blocker_opened(seq1) then blocker_resolved(seq2) → resolved', () => {
    const events: Event[] = [
      ev('blocker_opened', { id: 'x', description: 'd' }, { seq: 1 }),
      ev('blocker_resolved', { id: 'x' }, { seq: 2 }),
    ];
    expect(projectCoreState(events).blockers[0].status).toBe('resolved');
  });

  it('blocker_resolved(seq1) then blocker_opened(seq2) → open (reversed)', () => {
    const events: Event[] = [
      ev('blocker_resolved', { id: 'x' }, { seq: 1 }),
      ev('blocker_opened', { id: 'x', description: 'd' }, { seq: 2 }),
    ];
    const b = projectCoreState(events).blockers[0];
    expect(b.status).toBe('open');
    expect(b.description).toBe('d');
  });
});

describe('projectCoreState — purity / order independence', () => {
  it('produces identical output for any input ordering', () => {
    const events: Event[] = [
      ev('position_set', { phase: 'execute', task: 'Task 3' }, { seq: 1 }),
      ev('decision_recorded', { id: 'd1', text: 'one' }, { seq: 2 }),
      ev('decision_recorded', { id: 'd2', text: 'two' }, { seq: 3 }),
      ev('progress_set', { task: 'T', status: 'complete' }, { seq: 4 }),
    ];
    const ordered = projectCoreState(events);
    const shuffled = projectCoreState([events[2], events[0], events[3], events[1]]);
    expect(shuffled).toEqual(ordered);
    // Input array not mutated.
    expect(events[0].seq).toBe(1);
  });
});

describe('toHarnessState — legacy bridge', () => {
  it('produces a value HarnessStateSchema.parse accepts and round-trips fields', () => {
    const events: Event[] = [
      ev('position_set', { phase: 'execute', task: 'Task 3' }, { seq: 1 }),
      ev('decision_recorded', { id: 'd1', text: 'use zod', context: 'schema' }, { seq: 2 }),
      ev('blocker_opened', { id: 'b1', description: 'desc' }, { seq: 3 }),
      ev('progress_set', { task: 'T', status: 'in_progress' }, { seq: 4 }),
      ev('session_summarized', { summary: 's' }, { seq: 5 }),
    ];
    const hs = toHarnessState(projectCoreState(events));
    expect(() => HarnessStateSchema.parse(hs)).not.toThrow();
    expect(hs.schemaVersion).toBe(1);
    expect(hs.position).toEqual({ phase: 'execute', task: 'Task 3' });
    expect(hs.decisions[0]).toMatchObject({ decision: 'use zod', context: 'schema' });
    expect(hs.blockers[0]).toMatchObject({ id: 'b1', status: 'open' });
    expect(hs.progress).toEqual({ T: 'in_progress' });
    expect(hs.lastSession).toMatchObject({ summary: 's' });
  });

  it('omits lastSession when absent', () => {
    const hs = toHarnessState(projectCoreState([]));
    expect(hs.lastSession).toBeUndefined();
    expect(() => HarnessStateSchema.parse(hs)).not.toThrow();
  });
});
