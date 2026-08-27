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
  assertLeafWithinBudget,
  ContextBudgetExceededError,
  evaluateSessionContextBudget,
  DEFAULT_SESSION_BUDGET_HINT,
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

describe('assertLeafWithinBudget (fail-loud consult helper)', () => {
  const budget = { maxTokens: 200_000 };

  it('returns void (no throw) when the leaf is within budget', () => {
    expect(() =>
      assertLeafWithinBudget(estimate({ estimatedTokens: 120_000 }), budget)
    ).not.toThrow();
    expect(() =>
      assertLeafWithinBudget(estimate({ estimatedTokens: 200_000 }), budget)
    ).not.toThrow();
  });

  it('THROWS ContextBudgetExceededError carrying the losing verdict when over budget', () => {
    let caught: unknown;
    try {
      assertLeafWithinBudget(estimate({ estimatedTokens: 250_000 }), budget);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ContextBudgetExceededError);
    const err = caught as ContextBudgetExceededError;
    expect(err.message).toContain('#1524');
    expect(err.message).toContain('rejected at dispatch');
    expect(err.verdict.ok).toBe(false);
    expect(err.verdict.overageTokens).toBe(50_000);
    expect(err.verdict.budgetTokens).toBe(200_000);
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

describe('evaluateSessionContextBudget (manual-session WARN, shared comparison)', () => {
  const budget = { maxTokens: 200_000 };

  it('is ok (no notice) within budget, boundary included', () => {
    const within = evaluateSessionContextBudget('code_search', 199_999, budget);
    expect(within.ok).toBe(true);
    expect(within.overageTokens).toBe(0);
    expect(within.notice).toBe('');

    const boundary = evaluateSessionContextBudget('code_search', 200_000, budget);
    expect(boundary.ok).toBe(true);
    expect(boundary.notice).toBe('');
  });

  it('warns over budget with a loud steer notice and exact overage', () => {
    const signal = evaluateSessionContextBudget('code_search', 250_000, budget);
    expect(signal.ok).toBe(false);
    expect(signal.overageTokens).toBe(50_000);
    expect(signal.item).toBe('code_search');
    expect(signal.notice).toContain('[harness context-budget]');
    expect(signal.notice).toContain('code_search');
    expect(signal.notice).toContain('50,000');
    expect(signal.notice).toContain(DEFAULT_SESSION_BUDGET_HINT);
  });

  it('accepts a custom steer hint', () => {
    const signal = evaluateSessionContextBudget('read_file', 250_000, budget, {
      hint: 'Use code_unfold instead.',
    });
    expect(signal.notice).toContain('Use code_unfold instead.');
    expect(signal.notice).not.toContain(DEFAULT_SESSION_BUDGET_HINT);
  });

  it('shares the over/under decision with enforceLeafContextBudget (never diverges)', () => {
    for (const tokens of [1, 199_999, 200_000, 200_001, 500_000]) {
      const session = evaluateSessionContextBudget('t', tokens, budget);
      const leaf = enforceLeafContextBudget(
        { item: 't', estimatedTokens: tokens, sources: [] },
        budget
      );
      expect(session.ok).toBe(leaf.ok);
      if (!leaf.ok) expect(session.overageTokens).toBe(leaf.overageTokens);
    }
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
