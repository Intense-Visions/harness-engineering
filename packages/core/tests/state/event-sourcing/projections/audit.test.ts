import { describe, it, expect } from 'vitest';
import { projectAudit } from '../../../../src/state/event-sourcing/projections/audit';
import type { Event } from '../../../../src/state/event-sourcing/events';

const env = (seq: number) => ({
  seq,
  writerId: 'w-1',
  timestamp: `2026-06-27T00:00:0${seq}.000Z`,
  scope: { stream: undefined, session: undefined },
});

const userInput = (seq: number, text: string, interactionId?: string): Event =>
  ({
    ...env(seq),
    type: 'user_input_captured',
    payload: interactionId ? { text, interactionId } : { text },
  }) as Event;

const approvalRequested = (seq: number, interactionId: string, prompt: string): Event =>
  ({
    ...env(seq),
    type: 'approval_requested',
    payload: { interactionId, kind: 'confirmation', prompt },
  }) as Event;

const approvalResolved = (seq: number, interactionId: string, response: string): Event =>
  ({
    ...env(seq),
    type: 'approval_resolved',
    payload: { interactionId, response },
  }) as Event;

const decision = (seq: number): Event =>
  ({ ...env(seq), type: 'decision_recorded', payload: { id: `d${seq}`, text: 'x' } }) as Event;

const laneTransition = (seq: number): Event =>
  ({
    ...env(seq),
    type: 'lane_transitioned',
    payload: { taskId: 't1', from: 'planned', to: 'claimed' },
  }) as Event;

describe('projectAudit', () => {
  it('returns { entries: [] } for an empty log', () => {
    expect(projectAudit([])).toEqual({ entries: [] });
  });

  it('returns { entries: [] } for a log with no audit events', () => {
    expect(projectAudit([decision(1), laneTransition(2)])).toEqual({ entries: [] });
  });

  it('projects audit events sorted by (seq asc, writerId asc), carrying verbatim text', () => {
    // Provided out-of-order; projection must sort.
    const events = [
      approvalResolved(3, 'i1', 'yes'),
      approvalRequested(2, 'i1', 'continue?'),
      userInput(1, 'hello', 'i1'),
    ];
    const audit = projectAudit(events);
    expect(audit.entries).toEqual([
      {
        seq: 1,
        timestamp: '2026-06-27T00:00:01.000Z',
        kind: 'user_input_captured',
        interactionId: 'i1',
        text: 'hello',
      },
      {
        seq: 2,
        timestamp: '2026-06-27T00:00:02.000Z',
        kind: 'approval_requested',
        interactionId: 'i1',
        text: 'continue?',
      },
      {
        seq: 3,
        timestamp: '2026-06-27T00:00:03.000Z',
        kind: 'approval_resolved',
        interactionId: 'i1',
        text: 'yes',
      },
    ]);
  });

  it('omits interactionId on user_input_captured when absent', () => {
    const audit = projectAudit([userInput(1, 'hi')]);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toEqual({
      seq: 1,
      timestamp: '2026-06-27T00:00:01.000Z',
      kind: 'user_input_captured',
      text: 'hi',
    });
    expect('interactionId' in audit.entries[0]).toBe(false);
  });

  it('ignores non-audit events interleaved with audit events', () => {
    const events = [
      decision(1),
      userInput(2, 'hi', 'i1'),
      laneTransition(3),
      approvalRequested(4, 'i1', 'go?'),
    ];
    const audit = projectAudit(events);
    expect(audit.entries.map((e) => e.kind)).toEqual(['user_input_captured', 'approval_requested']);
  });

  it('is order-independent: shuffling the input yields an identical projection', () => {
    const events = [
      userInput(1, 'a', 'i1'),
      approvalRequested(2, 'i1', 'b'),
      approvalResolved(3, 'i1', 'c'),
      userInput(4, 'd', 'i2'),
    ];
    const shuffled = [events[2], events[0], events[3], events[1]];
    expect(projectAudit(shuffled)).toEqual(projectAudit(events));
  });
});
