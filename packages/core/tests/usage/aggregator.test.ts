import { describe, it, expect } from 'vitest';
import { aggregateBySession, aggregateByDay } from '../../src/usage/aggregator';
import type { UsageRecord } from '@harness-engineering/types';

function makeRecord(
  overrides: Partial<UsageRecord> & { sessionId: string; timestamp: string }
): UsageRecord {
  return {
    tokens: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    ...overrides,
  };
}

describe('aggregateBySession', () => {
  it('should group multiple turns into a single session', () => {
    const records: UsageRecord[] = [
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T10:00:00Z', costMicroUSD: 1000 }),
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T10:05:00Z', costMicroUSD: 2000 }),
    ];

    const result = aggregateBySession(records);

    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('s1');
    expect(result[0].tokens.inputTokens).toBe(200);
    expect(result[0].tokens.outputTokens).toBe(100);
    expect(result[0].tokens.totalTokens).toBe(300);
    expect(result[0].costMicroUSD).toBe(3000);
    expect(result[0].firstTimestamp).toBe('2026-03-30T10:00:00Z');
    expect(result[0].lastTimestamp).toBe('2026-03-30T10:05:00Z');
    expect(result[0].source).toBe('harness');
  });

  it('should separate records from different sessions', () => {
    const records: UsageRecord[] = [
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T10:00:00Z' }),
      makeRecord({ sessionId: 's2', timestamp: '2026-03-30T11:00:00Z' }),
    ];

    const result = aggregateBySession(records);
    expect(result).toHaveLength(2);
  });

  it('should sum cache token fields when present', () => {
    const records: UsageRecord[] = [
      makeRecord({
        sessionId: 's1',
        timestamp: '2026-03-30T10:00:00Z',
        cacheCreationTokens: 100,
        cacheReadTokens: 50,
      }),
      makeRecord({
        sessionId: 's1',
        timestamp: '2026-03-30T10:05:00Z',
        cacheCreationTokens: 200,
        cacheReadTokens: 100,
      }),
    ];

    const result = aggregateBySession(records);
    expect(result[0].cacheCreationTokens).toBe(300);
    expect(result[0].cacheReadTokens).toBe(150);
  });

  it('should handle legacy records without cache fields', () => {
    const records: UsageRecord[] = [
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T10:00:00Z' }),
    ];

    const result = aggregateBySession(records);
    expect(result[0].cacheCreationTokens).toBeUndefined();
    expect(result[0].cacheReadTokens).toBeUndefined();
  });

  it('should return null cost when any turn has null cost', () => {
    const records: UsageRecord[] = [
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T10:00:00Z', costMicroUSD: 1000 }),
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T10:05:00Z' }), // no costMicroUSD
    ];

    const result = aggregateBySession(records);
    expect(result[0].costMicroUSD).toBeNull();
  });

  it('should pick model from first record that has one', () => {
    const records: UsageRecord[] = [
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T10:00:00Z' }),
      makeRecord({
        sessionId: 's1',
        timestamp: '2026-03-30T10:05:00Z',
        model: 'claude-sonnet-4-20250514',
      }),
    ];

    const result = aggregateBySession(records);
    expect(result[0].model).toBe('claude-sonnet-4-20250514');
  });

  it('should merge harness and CC records — harness authoritative for tokens, CC for model', () => {
    const harnessRecord = makeRecord({
      sessionId: 's1',
      timestamp: '2026-03-30T10:00:00Z',
      tokens: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      costMicroUSD: 5000,
    });
    // Simulate a CC record: has model but different token counts
    const ccRecord = makeRecord({
      sessionId: 's1',
      timestamp: '2026-03-30T10:00:00Z',
      tokens: { inputTokens: 190, outputTokens: 95, totalTokens: 285 }, // CC counts differ
      model: 'claude-sonnet-4-20250514',
    });

    // Mark source on records for merge logic
    (harnessRecord as UsageRecord & { _source?: string })._source = 'harness';
    (ccRecord as UsageRecord & { _source?: string })._source = 'claude-code';

    const result = aggregateBySession([harnessRecord, ccRecord]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('merged');
    // Harness tokens are authoritative
    expect(result[0].tokens.inputTokens).toBe(200);
    expect(result[0].tokens.outputTokens).toBe(100);
    // CC model supplements
    expect(result[0].model).toBe('claude-sonnet-4-20250514');
  });

  it('should return empty array for empty input', () => {
    expect(aggregateBySession([])).toEqual([]);
  });

  it('should sort results by firstTimestamp descending (most recent first)', () => {
    const records: UsageRecord[] = [
      makeRecord({ sessionId: 's-old', timestamp: '2026-03-28T10:00:00Z' }),
      makeRecord({ sessionId: 's-new', timestamp: '2026-03-30T10:00:00Z' }),
    ];

    const result = aggregateBySession(records);
    expect(result[0].sessionId).toBe('s-new');
    expect(result[1].sessionId).toBe('s-old');
  });
});

describe('aggregateByDay', () => {
  it('should group records by calendar date', () => {
    const records: UsageRecord[] = [
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T10:00:00Z', costMicroUSD: 1000 }),
      makeRecord({ sessionId: 's2', timestamp: '2026-03-30T14:00:00Z', costMicroUSD: 2000 }),
      makeRecord({ sessionId: 's3', timestamp: '2026-03-31T09:00:00Z', costMicroUSD: 500 }),
    ];

    const result = aggregateByDay(records);

    expect(result).toHaveLength(2);
    // Most recent first
    expect(result[0].date).toBe('2026-03-31');
    expect(result[0].sessionCount).toBe(1);
    expect(result[0].costMicroUSD).toBe(500);

    expect(result[1].date).toBe('2026-03-30');
    expect(result[1].sessionCount).toBe(2);
    expect(result[1].tokens.inputTokens).toBe(200);
    expect(result[1].costMicroUSD).toBe(3000);
  });

  it('should collect distinct models per day', () => {
    const records: UsageRecord[] = [
      makeRecord({
        sessionId: 's1',
        timestamp: '2026-03-30T10:00:00Z',
        model: 'claude-sonnet-4-20250514',
      }),
      makeRecord({
        sessionId: 's2',
        timestamp: '2026-03-30T14:00:00Z',
        model: 'claude-opus-4-20250514',
      }),
      makeRecord({
        sessionId: 's3',
        timestamp: '2026-03-30T16:00:00Z',
        model: 'claude-sonnet-4-20250514',
      }),
    ];

    const result = aggregateByDay(records);
    expect(result[0].models).toEqual(['claude-opus-4-20250514', 'claude-sonnet-4-20250514']);
  });

  it('should sum cache fields across the day', () => {
    const records: UsageRecord[] = [
      makeRecord({
        sessionId: 's1',
        timestamp: '2026-03-30T10:00:00Z',
        cacheCreationTokens: 100,
        cacheReadTokens: 50,
      }),
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T12:00:00Z', cacheCreationTokens: 200 }),
    ];

    const result = aggregateByDay(records);
    expect(result[0].cacheCreationTokens).toBe(300);
    expect(result[0].cacheReadTokens).toBe(50);
  });

  it('should handle legacy records without model or cache fields', () => {
    const records: UsageRecord[] = [
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T10:00:00Z' }),
    ];

    const result = aggregateByDay(records);
    expect(result[0].models).toEqual([]);
    expect(result[0].cacheCreationTokens).toBeUndefined();
    expect(result[0].cacheReadTokens).toBeUndefined();
  });

  it('should return null cost when any record has unknown pricing', () => {
    const records: UsageRecord[] = [
      makeRecord({ sessionId: 's1', timestamp: '2026-03-30T10:00:00Z', costMicroUSD: 1000 }),
      makeRecord({ sessionId: 's2', timestamp: '2026-03-30T14:00:00Z' }), // no cost
    ];

    const result = aggregateByDay(records);
    expect(result[0].costMicroUSD).toBeNull();
  });

  it('should return empty array for empty input', () => {
    expect(aggregateByDay([])).toEqual([]);
  });
});
