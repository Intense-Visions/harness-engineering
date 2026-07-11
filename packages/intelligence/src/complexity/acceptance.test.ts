import { describe, it, expect } from 'vitest';
// Import ONLY from the package barrel to prove the public surface.
import { deriveRequiredTier, blastRadiusVeto } from '../index.js';
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

const RANK: Record<CapabilityTier, number> = { fast: 0, standard: 1, strong: 2 };
const noSpend = { spentUsd: 0 };

describe('AMR Phase 2 acceptance — SC1', () => {
  it('same skill: trivial → fast, complex → strong, identical policy (no mutation)', () => {
    const policy: RoutingPolicy = {};
    const snapshot = JSON.stringify(policy);
    const risk: RoutingRisk = { blastRadius: 0, sensitivePath: false };

    const trivial = deriveRequiredTier(verdict('trivial'), risk, policy, noSpend, 'fast', 'demo');
    const complex = deriveRequiredTier(verdict('complex'), risk, policy, noSpend, 'fast', 'demo');

    expect(trivial).toBe('fast');
    expect(complex).toBe('strong');
    // Same policy object between calls, unmutated.
    expect(JSON.stringify(policy)).toBe(snapshot);
  });
});

describe('AMR Phase 2 acceptance — SC5 (D5 veto)', () => {
  it('trivial + sensitivePath → strong, and veto flag is active (Phase-6 autonomy join)', () => {
    const risk: RoutingRisk = { blastRadius: 0, sensitivePath: true };
    const tier = deriveRequiredTier(verdict('trivial'), risk, {}, noSpend, 'fast');
    expect(tier).toBe('strong');
    // Autonomy would be denied because the veto is active.
    expect(blastRadiusVeto(risk)).toBe(true);
  });

  it('trivial + core layer → strong', () => {
    const risk: RoutingRisk = { blastRadius: 0, sensitivePath: false, layer: 'core' };
    expect(deriveRequiredTier(verdict('trivial'), risk, {}, noSpend, 'fast')).toBe('strong');
  });
});

describe('AMR Phase 2 acceptance — SC6 (low confidence degrades up)', () => {
  it('low-confidence with identity default standard → never below standard, never fast', () => {
    const policy: RoutingPolicy = { skillTierOverrides: { demo: 'standard' } };
    const tier = deriveRequiredTier(
      verdict('trivial', 'low'),
      { blastRadius: 0, sensitivePath: false },
      policy,
      noSpend,
      'standard',
      'demo'
    );
    expect(RANK[tier]).toBeGreaterThanOrEqual(RANK.standard);
    expect(tier).not.toBe('fast');
  });
});
