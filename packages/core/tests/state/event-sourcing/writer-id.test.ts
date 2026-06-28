import { describe, it, expect, afterEach } from 'vitest';
import { getWriterId, __resetWriterIdForTests } from '../../../src/state/event-sourcing/writer-id';

afterEach(() => {
  delete process.env.HARNESS_EVENT_WRITER_ID;
  __resetWriterIdForTests();
});

describe('getWriterId (INV-1)', () => {
  it('is stable across calls within a process', () => {
    expect(getWriterId()).toBe(getWriterId());
  });
  it('returns a non-empty string', () => {
    expect(getWriterId().length).toBeGreaterThan(0);
  });
  it('honors HARNESS_EVENT_WRITER_ID override (first resolution)', () => {
    process.env.HARNESS_EVENT_WRITER_ID = 'fixed-writer-7';
    expect(getWriterId()).toBe('fixed-writer-7');
  });
});
