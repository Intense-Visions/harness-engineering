import { describe, it, expect } from 'vitest';
import type {
  BackendCapabilities,
  BackendDef,
  ComplexityVerdict,
  RoutingPolicy,
} from '@harness-engineering/types';
import { BackendRouter } from './backend-router.js';
import { AdaptiveRouter } from './adaptive-router.js';
import { EscalationState } from './escalation-state.js';

/** AMR observability — EscalationState.climbedUnits() + AdaptiveRouter.getStatus(). */

const cap = (over: Partial<BackendCapabilities> = {}): BackendCapabilities => ({
  tier: 'fast',
  costPer1kTokens: 0,
  privacyClass: 'on-device',
  contextWindow: 8192,
  ...over,
});
const localDef = (capabilities: BackendCapabilities): BackendDef => ({
  type: 'local',
  endpoint: 'http://localhost:1234',
  model: 'm',
  capabilities,
});
const verdict = (level: ComplexityVerdict['level']): ComplexityVerdict => ({
  level,
  confidence: 'high',
  signals: {},
  source: 'static',
});
const backends = {
  fast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
  mid: localDef(cap({ tier: 'standard', costPer1kTokens: 5 })),
  strong: localDef(cap({ tier: 'strong', costPer1kTokens: 10 })),
};
const build = (policy: RoutingPolicy, escalation?: EscalationState): AdaptiveRouter =>
  AdaptiveRouter.fromConfig({
    router: new BackendRouter({ backends, routing: { default: 'strong' } }),
    backends,
    policy,
    classify: () => verdict('complex'),
    ...(escalation ? { escalation } : {}),
  });
const REQ = { useCase: { kind: 'tier' as const, tier: 'quick-fix' as const } };

describe('EscalationState.climbedUnits', () => {
  it('lists only units that have climbed above the fast floor, with their tier', () => {
    const esc = new EscalationState(1); // one failure climbs
    esc.recordOutcome('unit-a', 'fast', false); // → standard
    esc.recordOutcome('unit-b', 'fast', true); // stays fast (a pass)
    esc.recordOutcome('unit-c', 'fast', false); // → standard
    esc.recordOutcome('unit-c', 'standard', false); // → strong

    const climbed = esc
      .climbedUnits()
      .sort((a, b) => a.coherenceUnit.localeCompare(b.coherenceUnit));
    expect(climbed).toEqual([
      { coherenceUnit: 'unit-a', floor: 'standard' },
      { coherenceUnit: 'unit-c', floor: 'strong' },
    ]);
  });

  it('is empty when nothing has escalated', () => {
    const esc = new EscalationState(2);
    esc.recordOutcome('u', 'fast', false); // 1 failure < threshold 2 ⇒ no climb
    expect(esc.climbedUnits()).toEqual([]);
  });
});

describe('AdaptiveRouter.getStatus', () => {
  it('reports active + no budget/escalation/allowlist for a bare policy', () => {
    const s = build({}).getStatus();
    expect(s.active).toBe(true);
    expect(s.budget).toBeNull();
    expect(s.escalation).toEqual([]);
    expect(s.allowedProviders).toBeNull();
  });

  it('reports budget spend-vs-cap using the monotonic accumulator, with the degrading flag', async () => {
    const r = build({ budget: { capUsd: 100, degradeAtPct: 50, onBudgetExhausted: 'degrade' } });
    // Two strong dispatches (rate 10 ⇒ estCost 40 each) ⇒ spend 80.
    await r.route(REQ);
    await r.route(REQ);
    const s = r.getStatus();
    expect(s.budget).toEqual({
      spentUsd: 80,
      capUsd: 100,
      degradeAtPct: 50,
      spentPct: 80,
      degrading: true, // 80% >= 50%
      exhausted: false, // 80% < 100% (hard cap)
    });
  });

  it('reports exhausted once monotonic spend reaches the hard cap', async () => {
    // capUsd 100; strong dispatches accrue ~40 each until the clamp cheapens them,
    // so a few dispatches push the monotonic accumulator to/over the cap.
    const r = build({ budget: { capUsd: 100, degradeAtPct: 50, onBudgetExhausted: 'degrade' } });
    await r.route(REQ);
    await r.route(REQ);
    await r.route(REQ);
    const s = r.getStatus();
    expect(s.budget!.spentUsd).toBeGreaterThanOrEqual(100); // at/over the hard cap
    expect(s.budget?.exhausted).toBe(true);
    expect(s.budget?.degrading).toBe(true);
  });

  it('degrading is false below the threshold, and defaults degradeAtPct to 90', async () => {
    const r = build({ budget: { capUsd: 1000, onBudgetExhausted: 'degrade' } }); // no degradeAtPct
    await r.route(REQ); // spend 40 ⇒ 4%
    const s = r.getStatus();
    expect(s.budget?.degradeAtPct).toBe(90);
    expect(s.budget?.spentPct).toBe(4);
    expect(s.budget?.degrading).toBe(false);
  });

  it('surfaces climbed escalation units and the provider allowlist', () => {
    const esc = new EscalationState(1);
    const r = build({ allowedProviders: ['local', 'anthropic'] }, esc);
    esc.recordOutcome('issue-42', 'fast', false); // → standard
    const s = r.getStatus();
    expect(s.escalation).toEqual([{ coherenceUnit: 'issue-42', floor: 'standard' }]);
    expect(s.allowedProviders).toEqual(['local', 'anthropic']);
  });
});
