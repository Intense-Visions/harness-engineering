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
    const e = { ...envelope, type: 'position_set', payload: { id: 'd1', text: 'x' } };
    expect(EventSchema.safeParse(e).success).toBe(false);
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
