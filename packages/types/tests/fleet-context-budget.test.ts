import { describe, it, expect } from 'vitest';
import {
  FLEET_CONTEXT_BUDGET_VERSION,
  ContextBudgetSchema,
  LeafContextEstimateSchema,
  LeafContextSpendSchema,
  validateLeafContextEstimate,
  safeParseLeafContextEstimate,
} from '../src/fleet-context-budget';

describe('fleet-context-budget shapes', () => {
  it('exposes a positive envelope version', () => {
    expect(FLEET_CONTEXT_BUDGET_VERSION).toBeGreaterThan(0);
  });

  it('LeafContextEstimateSchema defaults sources to an empty array', () => {
    const parsed = LeafContextEstimateSchema.parse({ item: '#1524', estimatedTokens: 100 });
    expect(parsed.sources).toEqual([]);
  });

  it('ContextBudgetSchema rejects a non-positive ceiling', () => {
    expect(() => ContextBudgetSchema.parse({ maxTokens: 0 })).toThrow();
    expect(ContextBudgetSchema.parse({ maxTokens: 200_000 }).maxTokens).toBe(200_000);
  });

  it('LeafContextSpendSchema round-trips a well-formed record', () => {
    const rec = {
      item: '#1524',
      budgetTokens: 200_000,
      estimatedTokens: 120_000,
      withinBudget: true,
      cacheReadTokens: 44_800_000,
    };
    expect(LeafContextSpendSchema.parse(rec)).toEqual(rec);
    expect(() => LeafContextSpendSchema.parse({ ...rec, bogus: 1 })).toThrow();
  });
});

describe('validateLeafContextEstimate', () => {
  it('parses a well-formed estimate (throwing form)', () => {
    const est = validateLeafContextEstimate({
      item: '#1524',
      estimatedTokens: 100,
      sources: [{ label: 'a.ts', tokens: 100 }],
    });
    expect(est.item).toBe('#1524');
    expect(est.sources[0]).toEqual({ label: 'a.ts', tokens: 100 });
  });

  it('throws on an unknown key or negative tokens', () => {
    expect(() =>
      validateLeafContextEstimate({ item: '#1524', estimatedTokens: 1, bogus: true })
    ).toThrow();
    expect(() => validateLeafContextEstimate({ item: '#1524', estimatedTokens: -1 })).toThrow();
  });
});

describe('safeParseLeafContextEstimate', () => {
  it('returns success for a valid estimate', () => {
    const r = safeParseLeafContextEstimate({ item: '#1524', estimatedTokens: 5 });
    expect(r.success).toBe(true);
  });

  it('returns failure (never throws) for a malformed estimate', () => {
    const r = safeParseLeafContextEstimate({ item: '', estimatedTokens: 5 });
    expect(r.success).toBe(false);
  });
});
