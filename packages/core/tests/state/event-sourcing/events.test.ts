import { describe, it, expect } from 'vitest';
import {
  EventSchema,
  StoredEventSchema,
  ScopeSchema,
  type Event,
} from '../../../src/state/event-sourcing/events';

const envelope = {
  seq: 1,
  writerId: 'w-1',
  timestamp: '2026-06-26T10:00:00.000Z',
  scope: { stream: undefined, session: undefined },
};

describe('EventSchema', () => {
  it('validates a decision_recorded event', () => {
    const e = { ...envelope, type: 'decision_recorded', payload: { id: 'd1', text: 'use X' } };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('validates a position_set event', () => {
    const e = { ...envelope, type: 'position_set', payload: { position: 'EXECUTE' } };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('validates a state_imported genesis event', () => {
    const e = { ...envelope, type: 'state_imported', payload: { legacyState: { a: 1 } } };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('rejects an unknown event type', () => {
    const e = { ...envelope, type: 'nope', payload: {} };
    expect(EventSchema.safeParse(e).success).toBe(false);
  });
  it('rejects a payload mismatched to its type', () => {
    // decision_recorded requires id+text; a position-shaped payload is missing both.
    // (position_set itself is now an all-optional superset per DP1, so it can no longer
    // serve as the "mismatch" case — see the phase-2 variants block for its back-compat.)
    const e = { ...envelope, type: 'decision_recorded', payload: { position: 'EXECUTE' } };
    expect(EventSchema.safeParse(e).success).toBe(false);
  });
});

describe('phase-2 core-state variants', () => {
  it('accepts position_set with the superset { phase, task } payload', () => {
    const e = { ...envelope, type: 'position_set', payload: { phase: 'p1', task: 't1' } };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('still accepts the legacy position_set { position } payload (DP1 back-compat)', () => {
    const e = { ...envelope, type: 'position_set', payload: { position: 'P1' } };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('accepts decision_recorded with optional context', () => {
    const e = {
      ...envelope,
      type: 'decision_recorded',
      payload: { id: 'd1', text: 'x', context: 'c' },
    };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('still accepts decision_recorded without context (legacy)', () => {
    const e = { ...envelope, type: 'decision_recorded', payload: { id: 'd1', text: 'x' } };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('accepts blocker_opened with a description', () => {
    const e = { ...envelope, type: 'blocker_opened', payload: { id: 'b1', description: 'desc' } };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('rejects blocker_opened missing a description', () => {
    const e = { ...envelope, type: 'blocker_opened', payload: { id: 'b1' } };
    expect(EventSchema.safeParse(e).success).toBe(false);
  });
  it('accepts blocker_resolved with just an id', () => {
    const e = { ...envelope, type: 'blocker_resolved', payload: { id: 'b1' } };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('accepts progress_set with a valid status', () => {
    const e = { ...envelope, type: 'progress_set', payload: { task: 't1', status: 'in_progress' } };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('rejects progress_set with a bogus status', () => {
    const e = { ...envelope, type: 'progress_set', payload: { task: 't1', status: 'bogus' } };
    expect(EventSchema.safeParse(e).success).toBe(false);
  });
  it('accepts session_summarized with full fields', () => {
    const e = {
      ...envelope,
      type: 'session_summarized',
      payload: { summary: 's', lastSkill: 'k', pendingTasks: ['a'] },
    };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });
  it('accepts session_summarized with only a summary', () => {
    const e = { ...envelope, type: 'session_summarized', payload: { summary: 's' } };
    expect(EventSchema.safeParse(e).success).toBe(true);
  });

  // StoredEventSchema must also recognize the new types on-disk.
  it('StoredEventSchema accepts the new stored types', () => {
    for (const type of [
      'blocker_opened',
      'blocker_resolved',
      'progress_set',
      'session_summarized',
    ]) {
      const e = { ...envelope, type, payload: {} };
      expect(StoredEventSchema.safeParse(e).success).toBe(true);
    }
  });
});

describe('StoredEventSchema (on-disk, may carry a blob ref)', () => {
  it('accepts a payload replaced by a blob marker', () => {
    const e = { ...envelope, type: 'state_imported', payload: { $blob: 'abc123' } };
    expect(StoredEventSchema.safeParse(e).success).toBe(true);
  });
});

describe('ScopeSchema', () => {
  it('accepts an empty (global) scope', () => {
    expect(ScopeSchema.safeParse({}).success).toBe(true);
  });
});

// Type-level assertion keeps the `Event` import load-bearing.
const _typeCheck: Event['type'] = 'position_set';
void _typeCheck;
