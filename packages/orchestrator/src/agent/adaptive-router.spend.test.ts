import { describe, it, expect } from 'vitest';
import type {
  BackendCapabilities,
  BackendDef,
  ComplexityVerdict,
  RoutingPolicy,
} from '@harness-engineering/types';
import { BackendRouter } from './backend-router.js';
import { AdaptiveRouter } from './adaptive-router.js';

/**
 * D8 live spend accumulator — makes the budget clamp actually fire.
 * `estimateCost` is deterministic: (4000/1000) × costPer1kTokens = 4 × rate.
 */

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
  model: 'test-model',
  capabilities,
});

const verdict = (level: ComplexityVerdict['level']): ComplexityVerdict => ({
  level,
  confidence: 'high',
  signals: {},
  source: 'static',
});

// strong: rate 10 → 40/dispatch; mid: rate 5 → 20/dispatch; fast: rate 0 → 0.
const backends = {
  fast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
  mid: localDef(cap({ tier: 'standard', costPer1kTokens: 5 })),
  strong: localDef(cap({ tier: 'strong', costPer1kTokens: 10 })),
};

const build = (
  policy: RoutingPolicy,
  level: ComplexityVerdict['level'] = 'complex'
): AdaptiveRouter =>
  AdaptiveRouter.fromConfig({
    router: new BackendRouter({ backends, routing: { default: 'strong' } }),
    backends,
    policy,
    classify: () => verdict(level),
  });

const REQ = { useCase: { kind: 'tier' as const, tier: 'quick-fix' as const } };

describe('AdaptiveRouter — live spend accumulator (D8)', () => {
  it('accumulates estCostUsd across dispatches (getSpentUsd grows)', async () => {
    const r = build({}); // no budget ⇒ no clamp, but still accrues
    expect(r.getSpentUsd()).toBe(0);
    await r.route(REQ); // complex ⇒ strong (rate 10) ⇒ +40
    expect(r.getSpentUsd()).toBe(40);
    await r.route(REQ);
    expect(r.getSpentUsd()).toBe(80);
  });

  it('a decision reflects the cost that was accrued (estCostUsd on the enriched decision)', async () => {
    const r = build({});
    const { decision } = await r.route(REQ);
    expect(decision.estCostUsd).toBe(40); // strong, rate 10
    expect(r.getSpentUsd()).toBe(40);
  });

  it('budget clamp FIRES as accrued spend crosses degradeAtPct (was dead before)', async () => {
    // cap 100, degrade at 50% ⇒ clamp once spend >= 50. Each strong dispatch = 40.
    const r = build({ budget: { capUsd: 100, degradeAtPct: 50, onBudgetExhausted: 'degrade' } });

    // Dispatch 1: spend 0 (0%) ⇒ no clamp ⇒ strong.
    const d1 = await r.route(REQ);
    expect(d1.decision.tierRequired).toBe('strong');
    expect(d1.decision.backendName).toBe('strong');
    expect(r.getSpentUsd()).toBe(40);

    // Dispatch 2: spend 40 (40% < 50%) ⇒ still no clamp ⇒ strong.
    const d2 = await r.route(REQ);
    expect(d2.decision.tierRequired).toBe('strong');
    expect(r.getSpentUsd()).toBe(80);

    // Dispatch 3: spend 80 (80% >= 50%) ⇒ clamp strong→standard ⇒ mid backend.
    const d3 = await r.route(REQ);
    expect(d3.decision.tierRequired).toBe('standard');
    expect(d3.decision.backendName).toBe('mid');
    expect(r.getSpentUsd()).toBe(100); // +20 (mid rate 5)
  });

  it('no budget policy ⇒ accrual is harmless, tier never clamps', async () => {
    const r = build({}); // no budget
    for (let i = 0; i < 5; i++) {
      const { decision } = await r.route(REQ);
      expect(decision.tierRequired).toBe('strong'); // never clamps regardless of spend
    }
    expect(r.getSpentUsd()).toBe(200); // 5 × 40, accrued but unused
  });

  it('an injected budgetState overrides the internal accumulator for the clamp', async () => {
    // Inject a budgetState already over the degrade threshold ⇒ clamp on the FIRST
    // dispatch, even though the internal accumulator is still 0 at read time.
    const r = AdaptiveRouter.fromConfig({
      router: new BackendRouter({ backends, routing: { default: 'strong' } }),
      backends,
      policy: { budget: { capUsd: 100, degradeAtPct: 50, onBudgetExhausted: 'degrade' } },
      classify: () => verdict('complex'),
      budgetState: () => ({ spentUsd: 90 }), // 90% ⇒ clamp
    });
    const { decision } = await r.route(REQ);
    expect(decision.tierRequired).toBe('standard'); // clamped by the injected spend
    // getSpentUsd() reflects the EFFECTIVE spend (the injected source that drove
    // routing), not the internal tally — so an operator sees what actually clamped.
    expect(r.getSpentUsd()).toBe(90);
  });

  it('the D5 blast-radius veto floor is INVIOLABLE under budget pressure (clamp cannot undercut strong)', async () => {
    // A sensitive-path / high-blast-radius request forces `strong` "regardless"
    // (SC5); the budget clamp must NOT degrade it even when massively over budget.
    const r = build({ budget: { capUsd: 1, degradeAtPct: 10, onBudgetExhausted: 'degrade' } });
    const riskyReq = {
      ...REQ,
      risk: { blastRadius: 10, sensitivePath: true }, // triggers the D5 veto
    };
    // Prime spend far over the cap so the clamp WOULD fire without the veto.
    await r.route(riskyReq);
    await r.route(riskyReq);
    const { decision } = await r.route(riskyReq);
    expect(decision.tierRequired).toBe('strong'); // veto pins strong despite overspend
    expect(decision.backendName).toBe('strong');

    // Control: the SAME over-budget state, but a non-risky request DOES clamp.
    const { decision: clamped } = await r.route(REQ);
    expect(clamped.tierRequired).toBe('standard');
  });

  it('a fail-closed (PrivacyNoMatch) dispatch does NOT accrue spend', async () => {
    // Only a shared-cloud backend, but privacyFloor demands on-device ⇒ selection
    // throws PrivacyNoMatch before the accrue. Spend must stay flat.
    const cloudOnly = {
      cloud: localDef(cap({ tier: 'strong', costPer1kTokens: 10, privacyClass: 'shared-cloud' })),
    };
    const r = AdaptiveRouter.fromConfig({
      router: new BackendRouter({ backends: cloudOnly, routing: { default: 'cloud' } }),
      backends: cloudOnly,
      policy: { privacyFloor: 'on-device' },
      classify: () => verdict('moderate'),
    });
    await expect(r.route(REQ)).rejects.toThrow(/PrivacyNoMatch|no backend/i);
    expect(r.getSpentUsd()).toBe(0); // threw before accrual
  });
});
