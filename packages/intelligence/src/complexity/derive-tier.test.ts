import { describe, it, expect } from 'vitest';
import {
  baseTier,
  blastRadiusVeto,
  deriveRequiredTier,
  SENSITIVE_BLAST_THRESHOLD,
} from './derive-tier.js';
import type {
  ComplexityVerdict,
  RoutingRisk,
  RoutingPolicy,
  ComplexityLevel,
  CapabilityTier,
} from '@harness-engineering/types';

function verdict(
  level: ComplexityLevel,
  confidence: ComplexityVerdict['confidence'] = 'high'
): ComplexityVerdict {
  return { level, confidence, signals: {}, source: 'static' };
}

const emptyPolicy: RoutingPolicy = {};

describe('blastRadiusVeto (D5)', () => {
  it('false when no risk supplied', () => {
    expect(blastRadiusVeto(undefined)).toBe(false);
  });
  it('true for sensitivePath', () => {
    expect(blastRadiusVeto({ blastRadius: 0, sensitivePath: true })).toBe(true);
  });
  it('true for publicApi', () => {
    expect(blastRadiusVeto({ blastRadius: 0, sensitivePath: false, publicApi: true })).toBe(true);
  });
  it('true for core/types layer', () => {
    expect(blastRadiusVeto({ blastRadius: 0, sensitivePath: false, layer: 'core' })).toBe(true);
    expect(blastRadiusVeto({ blastRadius: 0, sensitivePath: false, layer: 'types' })).toBe(true);
  });
  it('true when blastRadius >= threshold', () => {
    expect(blastRadiusVeto({ blastRadius: SENSITIVE_BLAST_THRESHOLD, sensitivePath: false })).toBe(
      true
    );
    expect(
      blastRadiusVeto({ blastRadius: SENSITIVE_BLAST_THRESHOLD - 1, sensitivePath: false })
    ).toBe(false);
  });
});

describe('baseTier — default matrix (SC1)', () => {
  it('trivial→fast, simple→fast, moderate→standard, complex→strong', () => {
    expect(baseTier(verdict('trivial'), undefined, emptyPolicy)).toBe('fast');
    expect(baseTier(verdict('simple'), undefined, emptyPolicy)).toBe('fast');
    expect(baseTier(verdict('moderate'), undefined, emptyPolicy)).toBe('standard');
    expect(baseTier(verdict('complex'), undefined, emptyPolicy)).toBe('strong');
  });

  it('[SC1] trivial (clear risk) → fast and complex → strong, same policy', () => {
    const clearRisk: RoutingRisk = { blastRadius: 0, sensitivePath: false };
    expect(baseTier(verdict('trivial'), clearRisk, emptyPolicy)).toBe('fast');
    expect(baseTier(verdict('complex'), clearRisk, emptyPolicy)).toBe('strong');
  });
});

describe('baseTier — skillTierOverrides precedence', () => {
  it('override takes precedence over the matrix', () => {
    const policy: RoutingPolicy = { skillTierOverrides: { demo: 'strong' } };
    expect(baseTier(verdict('trivial'), undefined, policy, 'demo')).toBe('strong');
  });
  it('override is ignored when skillKey does not match', () => {
    const policy: RoutingPolicy = { skillTierOverrides: { other: 'strong' } };
    expect(baseTier(verdict('trivial'), undefined, policy, 'demo')).toBe('fast');
  });
});

describe('baseTier — D5 veto (SC5)', () => {
  it('sensitivePath at trivial → strong', () => {
    expect(baseTier(verdict('trivial'), { blastRadius: 0, sensitivePath: true }, emptyPolicy)).toBe(
      'strong'
    );
  });
  it('layer core/types at trivial → strong', () => {
    expect(
      baseTier(
        verdict('trivial'),
        { blastRadius: 0, sensitivePath: false, layer: 'core' },
        emptyPolicy
      )
    ).toBe('strong');
    expect(
      baseTier(
        verdict('trivial'),
        { blastRadius: 0, sensitivePath: false, layer: 'types' },
        emptyPolicy
      )
    ).toBe('strong');
  });
  it('publicApi at simple → strong', () => {
    expect(
      baseTier(
        verdict('simple'),
        { blastRadius: 0, sensitivePath: false, publicApi: true },
        emptyPolicy
      )
    ).toBe('strong');
  });
  it('blastRadius >= threshold at trivial → strong', () => {
    expect(
      baseTier(
        verdict('trivial'),
        { blastRadius: SENSITIVE_BLAST_THRESHOLD, sensitivePath: false },
        emptyPolicy
      )
    ).toBe('strong');
  });
});

describe('baseTier — SC6 low-confidence degrades UP never down', () => {
  it('low-confidence trivial is never below the matrix default', () => {
    const low = baseTier(verdict('trivial', 'low'), undefined, emptyPolicy);
    // trivial matrix default is fast; low-confidence bumps up one step → standard.
    const rank: Record<CapabilityTier, number> = { fast: 0, standard: 1, strong: 2 };
    expect(rank[low]).toBeGreaterThanOrEqual(rank.fast);
    expect(low).toBe('standard');
  });
});

// --- Task 8: deriveRequiredTier (D8 budget clamp + D10 escalation floor) ---

const RANK: Record<CapabilityTier, number> = { fast: 0, standard: 1, strong: 2 };
const ALL_LEVELS: ComplexityLevel[] = ['trivial', 'simple', 'moderate', 'complex'];
const ALL_CONF: ComplexityVerdict['confidence'][] = ['high', 'medium', 'low'];

const noSpend = { spentUsd: 0 };
const noRisk = undefined;

/** Budget policy with a $100 cap and default degradeAt (90). Spend is passed separately. */
function budgetPolicy(_unusedPct: number, degradeAtPct = 90): RoutingPolicy {
  void _unusedPct;
  return {
    budget: { capUsd: 100, degradeAtPct, onBudgetExhausted: 'degrade' },
  };
}

describe('deriveRequiredTier — D8 budget clamp (SC7-partial)', () => {
  it('clamps one step down at/over degradeAtPct (strong→standard→fast, fast→fast)', () => {
    const policy = budgetPolicy(95);
    const spend = { spentUsd: 95 };
    expect(deriveRequiredTier(verdict('complex'), noRisk, policy, spend, 'fast')).toBe('standard');
    expect(deriveRequiredTier(verdict('moderate'), noRisk, policy, spend, 'fast')).toBe('fast');
    expect(deriveRequiredTier(verdict('trivial'), noRisk, policy, spend, 'fast')).toBe('fast');
  });

  it('does not clamp below the degrade threshold', () => {
    const policy = budgetPolicy(50);
    const spend = { spentUsd: 50 };
    expect(deriveRequiredTier(verdict('complex'), noRisk, policy, spend, 'fast')).toBe('strong');
  });

  it('does not clamp when policy.budget is undefined', () => {
    const spend = { spentUsd: 999 };
    expect(deriveRequiredTier(verdict('complex'), noRisk, emptyPolicy, spend, 'fast')).toBe(
      'strong'
    );
  });

  it('never returns a tier more expensive than the pre-clamp tier', () => {
    const policy = budgetPolicy(95);
    const spend = { spentUsd: 95 };
    for (const level of ALL_LEVELS) {
      const pre = baseTier(verdict(level), noRisk, policy);
      const post = deriveRequiredTier(verdict(level), noRisk, policy, spend, 'fast');
      expect(RANK[post]).toBeLessThanOrEqual(RANK[pre]);
    }
  });
});

describe('deriveRequiredTier — D5 × D8 interaction (veto is a HARD floor)', () => {
  it('veto-forced strong stays strong under budget pressure (SC5 "regardless")', () => {
    const policy = budgetPolicy(99);
    const spend = { spentUsd: 99 };
    const sensitive: RoutingRisk = { blastRadius: 0, sensitivePath: true };
    // trivial complexity + sensitive path → veto forces strong; budget must NOT undercut it.
    expect(deriveRequiredTier(verdict('trivial'), sensitive, policy, spend, 'fast')).toBe('strong');
  });

  it('core-layer veto stays strong under budget pressure', () => {
    const policy = budgetPolicy(99);
    const spend = { spentUsd: 99 };
    const core: RoutingRisk = { blastRadius: 0, sensitivePath: false, layer: 'core' };
    expect(deriveRequiredTier(verdict('trivial'), core, policy, spend, 'fast')).toBe('strong');
  });

  it('non-veto strong DOES clamp under budget pressure (contrast)', () => {
    const policy = budgetPolicy(99);
    const spend = { spentUsd: 99 };
    // complex, no sensitive risk → strong, but clamps to standard under budget.
    expect(deriveRequiredTier(verdict('complex'), noRisk, policy, spend, 'fast')).toBe('standard');
  });
});

describe('deriveRequiredTier — D10 escalation floor', () => {
  it('escalationFloor strong forces strong on trivial/low-risk/no-budget', () => {
    expect(deriveRequiredTier(verdict('trivial'), noRisk, emptyPolicy, noSpend, 'strong')).toBe(
      'strong'
    );
  });

  it('escalationFloor standard raises a trivial request to standard', () => {
    expect(deriveRequiredTier(verdict('trivial'), noRisk, emptyPolicy, noSpend, 'standard')).toBe(
      'standard'
    );
  });

  it('escalation floor raises but never lowers', () => {
    // complex → strong; a floor of fast must not lower it.
    expect(deriveRequiredTier(verdict('complex'), noRisk, emptyPolicy, noSpend, 'fast')).toBe(
      'strong'
    );
  });

  it('floor is applied AFTER the budget clamp (floor wins over clamp)', () => {
    const policy = budgetPolicy(99);
    const spend = { spentUsd: 99 };
    // complex clamps to standard, but a strong floor re-raises to strong.
    expect(deriveRequiredTier(verdict('complex'), noRisk, policy, spend, 'strong')).toBe('strong');
  });
});

describe('deriveRequiredTier — SC6 exhaustive (low-confidence never yields Tier-A cheap)', () => {
  it('every level × confidence × floor: result >= max(matrix/floor); low-conf never below default', () => {
    for (const level of ALL_LEVELS) {
      for (const conf of ALL_CONF) {
        for (const floor of ['fast', 'standard'] as CapabilityTier[]) {
          const v = verdict(level, conf);
          const result = deriveRequiredTier(v, noRisk, emptyPolicy, noSpend, floor);
          // Never below the escalation floor.
          expect(RANK[result]).toBeGreaterThanOrEqual(RANK[floor]);
          // Never below the base (pre-floor) tier.
          const base = baseTier(v, noRisk, emptyPolicy);
          expect(RANK[result]).toBeGreaterThanOrEqual(RANK[base]);
          // SC6: a low-confidence request is never mapped to `fast` when the
          // identity default (floor) is higher, and low-conf itself bumps up.
          if (conf === 'low' && floor !== 'fast') {
            expect(result).not.toBe('fast');
          }
        }
      }
    }
  });
});

describe('deriveRequiredTier — purity', () => {
  it('is referentially transparent and does not mutate policy', () => {
    const policy: RoutingPolicy = {
      complexityTierMatrix: { moderate: 'standard' },
      budget: { capUsd: 100, degradeAtPct: 90, onBudgetExhausted: 'degrade' },
      skillTierOverrides: { demo: 'standard' },
    };
    const snapshot = JSON.stringify(policy);
    const v = verdict('moderate');
    const a = deriveRequiredTier(v, noRisk, policy, { spentUsd: 10 }, 'fast', 'demo');
    const b = deriveRequiredTier(v, noRisk, policy, { spentUsd: 10 }, 'fast', 'demo');
    expect(a).toBe(b);
    expect(JSON.stringify(policy)).toBe(snapshot);
  });
});
