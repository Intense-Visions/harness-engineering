import { describe, it, expect } from 'vitest';
import {
  ContextBudgetSchema,
  LeafContextSpendSchema,
  validateLeafContextEstimate,
  type LeafContextEstimate,
} from '@harness-engineering/types';
import {
  DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS,
  resolveContextBudget,
  enforceLeafContextBudget,
  formatBudgetFailure,
  summarizeLeafSpend,
} from './index';

const estimate = (over: Partial<LeafContextEstimate> = {}): LeafContextEstimate => ({
  item: '#1524',
  estimatedTokens: 100_000,
  sources: [],
  ...over,
});

describe('resolveContextBudget', () => {
  it('returns the sane default with no override', () => {
    expect(resolveContextBudget()).toEqual({ maxTokens: DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS });
    expect(DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS).toBe(200_000);
  });

  it('applies an override', () => {
    expect(resolveContextBudget({ maxTokens: 50_000 })).toEqual({ maxTokens: 50_000 });
  });

  it('rejects a non-positive override rather than silently disabling the ceiling', () => {
    expect(() => resolveContextBudget({ maxTokens: 0 })).toThrow();
    expect(() => resolveContextBudget({ maxTokens: -1 })).toThrow();
  });
});

describe('enforceLeafContextBudget', () => {
  const budget = { maxTokens: 200_000 };

  it('passes a within-budget leaf with correct headroom', () => {
    const v = enforceLeafContextBudget(estimate({ estimatedTokens: 120_000 }), budget);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.headroomTokens).toBe(80_000);
  });

  it('treats the boundary (estimate == budget) as within budget, not an overage', () => {
    const v = enforceLeafContextBudget(estimate({ estimatedTokens: 200_000 }), budget);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.headroomTokens).toBe(0);
  });

  it('FAILS LOUD when over budget: ok:false, correct overage, non-empty reason', () => {
    const v = enforceLeafContextBudget(estimate({ estimatedTokens: 250_000 }), budget);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.overageTokens).toBe(50_000);
      expect(v.reason).toContain('#1524');
      expect(v.reason).toContain('rejected at dispatch');
      expect(v.reason.length).toBeGreaterThan(0);
    }
  });

  it('sorts topSources largest-first and names them in the reason', () => {
    const v = enforceLeafContextBudget(
      estimate({
        estimatedTokens: 300_000,
        sources: [
          { label: 'small.ts', tokens: 10_000 },
          { label: 'huge.ts', tokens: 180_000 },
          { label: 'mid.ts', tokens: 90_000 },
          { label: 'tiny.ts', tokens: 20_000 },
        ],
      }),
      budget
    );
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.topSources.map((s) => s.label)).toEqual(['huge.ts', 'mid.ts', 'tiny.ts']);
      expect(v.reason).toContain('huge.ts');
    }
  });
});

describe('formatBudgetFailure', () => {
  it('names item, estimate, budget, and overage for an over-budget verdict', () => {
    const v = enforceLeafContextBudget(estimate({ estimatedTokens: 250_000 }), {
      maxTokens: 200_000,
    });
    const msg = formatBudgetFailure(v);
    expect(msg).toContain('#1524');
    expect(msg).toContain('250,000');
    expect(msg).toContain('200,000');
    expect(msg).toContain('50,000');
  });

  it('states headroom for a within-budget verdict', () => {
    const v = enforceLeafContextBudget(estimate({ estimatedTokens: 120_000 }), {
      maxTokens: 200_000,
    });
    expect(formatBudgetFailure(v)).toContain('within context budget');
  });
});

describe('summarizeLeafSpend', () => {
  const budget = { maxTokens: 200_000 };

  it('derives withinBudget matching the enforced verdict and round-trips the schema', () => {
    const under = summarizeLeafSpend(estimate({ estimatedTokens: 120_000 }), budget);
    expect(under.withinBudget).toBe(true);
    expect(() => LeafContextSpendSchema.parse(under)).not.toThrow();

    const over = summarizeLeafSpend(estimate({ estimatedTokens: 250_000 }), budget);
    expect(over.withinBudget).toBe(false);
    expect(() => LeafContextSpendSchema.parse(over)).not.toThrow();
  });

  it('includes measured cacheReadTokens when supplied, omits it otherwise', () => {
    expect(summarizeLeafSpend(estimate(), budget).cacheReadTokens).toBeUndefined();
    expect(summarizeLeafSpend(estimate(), budget, 44_800_000).cacheReadTokens).toBe(44_800_000);
  });
});

describe('schema validation (malformed input rejected, never silently misread)', () => {
  it('rejects an estimate with an unknown key', () => {
    expect(() =>
      validateLeafContextEstimate({ item: '#1524', estimatedTokens: 1, bogus: true })
    ).toThrow();
  });

  it('rejects negative tokens', () => {
    expect(() => validateLeafContextEstimate({ item: '#1524', estimatedTokens: -1 })).toThrow();
  });

  it('rejects a non-positive budget maxTokens', () => {
    expect(() => ContextBudgetSchema.parse({ maxTokens: 0 })).toThrow();
  });
});
