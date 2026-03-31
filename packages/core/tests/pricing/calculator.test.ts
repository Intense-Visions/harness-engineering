import { describe, it, expect } from 'vitest';
import { calculateCost } from '../../src/pricing/calculator';
import type { UsageRecord, ModelPricing } from '@harness-engineering/types';
import type { PricingDataset } from '../../src/pricing/types';

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    sessionId: 'test-session',
    timestamp: '2026-03-31T12:00:00Z',
    tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    ...overrides,
  };
}

const sonnetPricing: ModelPricing = {
  inputPer1M: 3.0,
  outputPer1M: 15.0,
  cacheReadPer1M: 0.3,
  cacheWritePer1M: 3.75,
};

describe('calculateCost', () => {
  const dataset: PricingDataset = new Map([['claude-sonnet-4-20250514', sonnetPricing]]);

  it('should calculate cost in microdollars for a known model', () => {
    const record = makeRecord({
      model: 'claude-sonnet-4-20250514',
      tokens: { inputTokens: 1_000_000, outputTokens: 100_000, totalTokens: 1_100_000 },
    });
    const cost = calculateCost(record, dataset);
    // input: 1M * $3/1M = $3 = 3,000,000 microdollars
    // output: 100K * $15/1M = $1.5 = 1,500,000 microdollars
    // total: 4,500,000 microdollars
    expect(cost).toBe(4_500_000);
  });

  it('should include cache token costs when present', () => {
    const record = makeRecord({
      model: 'claude-sonnet-4-20250514',
      tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    });
    const cost = calculateCost(record, dataset);
    // cacheRead: 1M * $0.3/1M = $0.3 = 300,000 microdollars
    // cacheWrite: 1M * $3.75/1M = $3.75 = 3,750,000 microdollars
    // total: 4,050,000 microdollars
    expect(cost).toBe(4_050_000);
  });

  it('should return null when model is not specified', () => {
    const record = makeRecord(); // no model field
    const cost = calculateCost(record, dataset);
    expect(cost).toBeNull();
  });

  it('should return null when model is unknown', () => {
    const record = makeRecord({ model: 'unknown-model' });
    const cost = calculateCost(record, dataset);
    expect(cost).toBeNull();
  });

  it('should return integer microdollars (no floating point)', () => {
    const record = makeRecord({
      model: 'claude-sonnet-4-20250514',
      tokens: { inputTokens: 333, outputTokens: 777, totalTokens: 1110 },
    });
    const cost = calculateCost(record, dataset);
    expect(Number.isInteger(cost)).toBe(true);
  });

  it('should handle zero tokens', () => {
    const record = makeRecord({
      model: 'claude-sonnet-4-20250514',
      tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    const cost = calculateCost(record, dataset);
    expect(cost).toBe(0);
  });

  it('should skip cache costs when model has no cache pricing', () => {
    const noCacheDataset: PricingDataset = new Map([
      ['basic-model', { inputPer1M: 1.0, outputPer1M: 2.0 }],
    ]);
    const record = makeRecord({
      model: 'basic-model',
      tokens: { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 },
      cacheReadTokens: 500_000,
    });
    const cost = calculateCost(record, noCacheDataset);
    // Only input cost: 1M * $1/1M = $1 = 1,000,000 microdollars
    // cacheRead ignored because model has no cacheReadPer1M
    expect(cost).toBe(1_000_000);
  });
});
