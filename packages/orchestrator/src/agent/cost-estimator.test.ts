import { describe, it, expect } from 'vitest';
import type { BackendDef, RoutingRequest } from '@harness-engineering/types';
import { estimateCost } from './cost-estimator.js';

/** A `local` BackendDef with an optionally-attached capabilities block. */
const local = (capabilities?: BackendDef['capabilities']): BackendDef => ({
  type: 'local',
  endpoint: 'http://localhost:1234',
  model: 'test-model',
  ...(capabilities ? { capabilities } : {}),
});

const req: RoutingRequest = { useCase: { kind: 'tier', tier: 'quick-fix' } };

describe('estimateCost (AMR Phase 3)', () => {
  it('returns 0 for an on-device backend (costPer1kTokens = 0)', () => {
    const def = local({
      tier: 'fast',
      costPer1kTokens: 0,
      privacyClass: 'on-device',
      contextWindow: 8192,
    });
    expect(estimateCost(def, req)).toBe(0);
  });

  it('returns a positive number proportional to costPer1kTokens', () => {
    const cheap = local({
      tier: 'standard',
      costPer1kTokens: 3,
      privacyClass: 'shared-cloud',
      contextWindow: 32000,
    });
    const dear = local({
      tier: 'strong',
      costPer1kTokens: 6,
      privacyClass: 'shared-cloud',
      contextWindow: 32000,
    });
    const cheapCost = estimateCost(cheap, req);
    const dearCost = estimateCost(dear, req);
    expect(cheapCost).toBeGreaterThan(0);
    // Doubling the rate doubles the estimate (linear in costPer1kTokens).
    expect(dearCost).toBeCloseTo(cheapCost * 2, 10);
  });

  it('returns 0 for a def with NO capabilities block (invisible to cost)', () => {
    expect(estimateCost(local(), req)).toBe(0);
  });

  it('is deterministic: same (def, req) yields the same number', () => {
    const def = local({
      tier: 'standard',
      costPer1kTokens: 3,
      privacyClass: 'shared-cloud',
      contextWindow: 32000,
    });
    expect(estimateCost(def, req)).toBe(estimateCost(def, req));
  });
});
