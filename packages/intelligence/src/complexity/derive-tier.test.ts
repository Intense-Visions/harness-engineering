import { describe, it, expect } from 'vitest';
import { baseTier, blastRadiusVeto, SENSITIVE_BLAST_THRESHOLD } from './derive-tier.js';
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
