import { describe, it, expect, vi } from 'vitest';
import type {
  BackendCapabilities,
  BackendDef,
  ComplexityVerdict,
  RoutingPolicy,
  RoutingRequest,
} from '@harness-engineering/types';
import { BackendRouter } from './backend-router.js';
import { buildCapabilityRegistry, PrivacyNoMatch } from './capability-registry.js';
import { AdaptiveRouter } from './adaptive-router.js';
import { EscalationState } from './escalation-state.js';
import { RoutingDecisionBus } from '../routing/decision-bus.js';
import type { RoutingDecision } from '@harness-engineering/types';

const cap = (over: Partial<BackendCapabilities> = {}): BackendCapabilities => ({
  tier: 'fast',
  costPer1kTokens: 0,
  privacyClass: 'on-device',
  contextWindow: 8192,
  ...over,
});

const localDef = (capabilities?: BackendCapabilities): BackendDef => ({
  type: 'local',
  endpoint: 'http://localhost:1234',
  model: 'test-model',
  ...(capabilities ? { capabilities } : {}),
});

const verdict = (level: ComplexityVerdict['level'] = 'moderate'): ComplexityVerdict => ({
  level,
  confidence: 'high',
  signals: {},
  source: 'static',
});

const minimalPolicy: RoutingPolicy = {};

describe('AdaptiveRouter — skeleton + classify seam (Task 4)', () => {
  it('route() returns { decision, def } enriched with complexity/tierRequired/estCostUsd', async () => {
    const backends = { 'cheap-fast': localDef(cap({ costPer1kTokens: 0 })) };
    const router = new BackendRouter({ backends, routing: { default: 'cheap-fast' } });
    const registry = buildCapabilityRegistry(backends);
    const classify = vi.fn(() => verdict('moderate'));

    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: minimalPolicy,
      classify,
    });

    const req: RoutingRequest = { useCase: { kind: 'tier', tier: 'quick-fix' } };
    const { decision, def } = await adaptive.route(req);

    expect(def.type).toBe('local');
    expect(decision.complexity).toEqual(verdict('moderate'));
    expect(decision.tierRequired).toBeDefined();
    expect(typeof decision.estCostUsd).toBe('number');
    // classify invoked exactly once because req.complexity was absent.
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it('awaits classify; a classify failure yields a conservative {moderate,low} verdict, never throws (D4)', async () => {
    const backends = { 'cheap-fast': localDef(cap({ costPer1kTokens: 0 })) };
    const router = new BackendRouter({ backends, routing: { default: 'cheap-fast' } });
    const registry = buildCapabilityRegistry(backends);
    const failingClassify = () => {
      throw new Error('timeout');
    };

    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: minimalPolicy,
      classify: failingClassify,
    });

    const { decision } = await adaptive.route({ useCase: { kind: 'chat' } });
    expect(decision.complexity).toEqual(
      expect.objectContaining({ level: 'moderate', confidence: 'low' })
    );
  });

  it('awaits an async classifier that rejects and still degrades to {moderate,low} (D4)', async () => {
    const backends = { 'cheap-fast': localDef(cap({ costPer1kTokens: 0 })) };
    const router = new BackendRouter({ backends, routing: { default: 'cheap-fast' } });
    const registry = buildCapabilityRegistry(backends);
    const asyncFailing = () => Promise.reject(new Error('provider down'));

    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: minimalPolicy,
      classify: asyncFailing,
    });

    const { decision } = await adaptive.route({ useCase: { kind: 'chat' } });
    expect(decision.complexity).toEqual(
      expect.objectContaining({ level: 'moderate', confidence: 'low' })
    );
  });

  it('does NOT call classify when req.complexity is already provided', async () => {
    const backends = { 'cheap-fast': localDef(cap()) };
    const router = new BackendRouter({ backends, routing: { default: 'cheap-fast' } });
    const registry = buildCapabilityRegistry(backends);
    const classify = vi.fn(() => verdict('trivial'));

    const adaptive = new AdaptiveRouter({ router, registry, policy: minimalPolicy, classify });

    const req: RoutingRequest = {
      useCase: { kind: 'tier', tier: 'quick-fix' },
      complexity: verdict('complex'),
    };
    const { decision } = await adaptive.route(req);

    expect(classify).toHaveBeenCalledTimes(0);
    expect(decision.complexity).toEqual(verdict('complex'));
  });
});

describe('AdaptiveRouter — tier selection via selectCheapestQualifying (Task 5)', () => {
  const backends = {
    cheapFast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
    midStandard: localDef(cap({ tier: 'standard', costPer1kTokens: 3 })),
    strong: localDef(cap({ tier: 'strong', costPer1kTokens: 10 })),
  };
  // Routing default is `strong` so we can prove tier selection OVERRODE the
  // identity default when it resolves a cheaper qualifying backend.
  const routing = { default: 'strong' } as const;

  it('a trivial verdict resolves via the cheapest fast backend (invocationOverride)', async () => {
    const router = new BackendRouter({ backends, routing });
    const registry = buildCapabilityRegistry(backends);
    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: minimalPolicy,
      classify: () => verdict('trivial'),
    });

    const { decision } = await adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(decision.backendName).toBe('cheapFast');
    expect(decision.tierRequired).toBe('fast');
  });

  it('a complex verdict resolves via the strong backend', async () => {
    const router = new BackendRouter({ backends, routing });
    const registry = buildCapabilityRegistry(backends);
    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: minimalPolicy,
      classify: () => verdict('complex'),
    });

    const { decision } = await adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(decision.backendName).toBe('strong');
    expect(decision.tierRequired).toBe('strong');
  });

  it('threads req.capabilities (needsVision/needsToolUse/minContextTokens) into constraints', async () => {
    // Only `strong` has vision; a trivial verdict would otherwise pick cheapFast,
    // but needsVision must force selection to a vision-capable backend.
    const visionBackends = {
      cheapFast: localDef(cap({ tier: 'fast', costPer1kTokens: 0, vision: false })),
      strong: localDef(cap({ tier: 'fast', costPer1kTokens: 10, vision: true })),
    };
    const router = new BackendRouter({
      backends: visionBackends,
      routing: { default: 'cheapFast' },
    });
    const registry = buildCapabilityRegistry(visionBackends);
    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: minimalPolicy,
      classify: () => verdict('trivial'),
    });

    const { decision } = await adaptive.route({
      useCase: { kind: 'tier', tier: 'quick-fix' },
      capabilities: { needsVision: true },
    });
    expect(decision.backendName).toBe('strong');
  });
});

describe('AdaptiveRouter.fromConfig — providerOf derivation (Task 6, fail-closed DoS guard)', () => {
  // Phase-1 finding (capability-registry.ts:60-66): an allowlist with NO
  // providerOf fail-closes EVERY request (silent DoS). fromConfig must ALWAYS
  // derive providerOf from agent.backends so enabling the allowlist later is safe.
  const backends = {
    cheapFast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
    strong: localDef(cap({ tier: 'strong', costPer1kTokens: 10 })),
  };

  it('builds the registry and derives providerOf = (name) => backends[name].type', async () => {
    const router = new BackendRouter({ backends, routing: { default: 'strong' } });
    const adaptive = AdaptiveRouter.fromConfig({
      router,
      backends,
      policy: minimalPolicy,
      classify: () => verdict('trivial'),
    });
    // A trivial verdict resolves cheapFast — proves the derived registry works.
    const { decision } = await adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(decision.backendName).toBe('cheapFast');
  });

  it('supplies a derived providerOf so an allowlist path can never fail-close every request', () => {
    const router = new BackendRouter({ backends, routing: { default: 'strong' } });
    const adaptive = AdaptiveRouter.fromConfig({
      router,
      backends,
      policy: minimalPolicy,
      classify: () => verdict('trivial'),
    });
    // Reach into the constructed deps to assert providerOf is present + correct.
    const providerOf = (adaptive as unknown as { deps: { providerOf?: (n: string) => unknown } })
      .deps.providerOf;
    expect(providerOf).toBeDefined();
    expect(providerOf?.('cheapFast')).toBe('local');
    expect(providerOf?.('does-not-exist')).toBeUndefined();
  });
});

describe('AdaptiveRouter — fail modes (Task 7)', () => {
  it('PrivacyNoMatch fails closed: route() does NOT delegate to identity routing (S4-001)', async () => {
    // Only backend is shared-cloud, but the policy demands an on-device floor →
    // selectCheapestQualifying throws PrivacyNoMatch. route() must re-raise and
    // NEVER call resolveDecisionAndDef with a non-compliant fallback.
    const backends = {
      cloudOnly: localDef(
        cap({ tier: 'strong', costPer1kTokens: 5, privacyClass: 'shared-cloud' })
      ),
    };
    const router = new BackendRouter({ backends, routing: { default: 'cloudOnly' } });
    const registry = buildCapabilityRegistry(backends);
    const spy = vi.spyOn(router, 'resolveDecisionAndDef');

    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: { privacyFloor: 'on-device' },
      classify: () => verdict('moderate'),
    });

    await expect(adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } })).rejects.toThrow(
      PrivacyNoMatch
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('tier/cost undefined falls through: resolveDecisionAndDef called with NO invocationOverride', async () => {
    // All backends are below `strong` → selectCheapestQualifying returns undefined
    // (tier/cost-only exclusion, best-effort). route() must delegate to the identity
    // chain (no invocationOverride) and still enrich the returned decision.
    const backends = {
      cheapFast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
      midStandard: localDef(cap({ tier: 'standard', costPer1kTokens: 3 })),
    };
    const router = new BackendRouter({ backends, routing: { default: 'midStandard' } });
    const registry = buildCapabilityRegistry(backends);
    const spy = vi.spyOn(router, 'resolveDecisionAndDef');

    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: {},
      classify: () => verdict('complex'), // complex → strong required, none qualify
    });

    const { decision } = await adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });

    // Delegated WITHOUT an invocationOverride (empty opts object).
    expect(spy).toHaveBeenCalledTimes(1);
    const optsArg = spy.mock.calls[0]?.[1];
    expect(optsArg).toEqual({});
    // Identity/default chain resolved, enriched with the derived tier.
    expect(decision.backendName).toBe('midStandard');
    expect(decision.tierRequired).toBe('strong');
    expect(decision.complexity?.level).toBe('complex');
  });
});

describe('AdaptiveRouter — SC9 decision enrichment on routing:decision bus (Task 12)', () => {
  it('the RETURNED decision carries complexity/tierRequired/estCostUsd (SC9/D9)', async () => {
    const backends = {
      cheapFast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
      strong: localDef(cap({ tier: 'strong', costPer1kTokens: 6 })),
    };
    const bus = new RoutingDecisionBus();
    const observed: RoutingDecision[] = [];
    bus.subscribe((d) => observed.push(d));

    const router = new BackendRouter({
      backends,
      routing: { default: 'cheapFast' },
      decisionBus: bus,
    });
    const registry = buildCapabilityRegistry(backends);
    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: {},
      classify: () => verdict('complex'), // complex ⇒ strong tier
    });

    const { decision } = await adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });

    // Phase-3 guarantee: the RETURNED decision is enriched (SC9). The telemetry
    // drain / caller reads this returned value.
    expect(decision.complexity).toEqual(verdict('complex'));
    expect(decision.tierRequired).toBe('strong');
    expect(typeof decision.estCostUsd).toBe('number');
    expect(decision.estCostUsd).toBeGreaterThan(0);

    // SEAM (documented, D9): the bus emits INSIDE resolveDecisionAndDef, BEFORE
    // AdaptiveRouter enriches the returned object. So a subscriber observes the
    // base (un-enriched) decision in Phase 3; full bus-payload enrichment (the
    // Meridian/Shuttle protocol form) is a Phase-5 adapter concern. We assert the
    // subscriber saw exactly one decision naming the tier-selected backend.
    expect(observed).toHaveLength(1);
    expect(observed[0]?.backendName).toBe('strong');
  });
});

describe('AdaptiveRouter — escalation floor + recordOutcome (D10/SC16, Task 6)', () => {
  const backends = {
    cheapFast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
    midStandard: localDef(cap({ tier: 'standard', costPer1kTokens: 3 })),
    strong: localDef(cap({ tier: 'strong', costPer1kTokens: 10 })),
  };

  it('uses the EscalationState floor so a climbed unit resolves at the higher tier (SC16)', async () => {
    const esc = new EscalationState(1); // threshold 1 ⇒ one failure climbs
    const router = new BackendRouter({ backends, routing: { default: 'cheapFast' } });
    const registry = buildCapabilityRegistry(backends);
    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: {},
      classify: () => verdict('trivial'), // trivial ⇒ base tier fast
      escalation: esc,
    });

    // Baseline: trivial ⇒ fast, cheapFast selected.
    const before = await adaptive.route({
      useCase: { kind: 'tier', tier: 'quick-fix' },
      coherenceUnit: 'unit-x',
    });
    expect(before.decision.tierRequired).toBe('fast');

    // A quality failure at fast climbs the floor to standard for unit-x.
    esc.recordOutcome('unit-x', 'fast', false);

    const after = await adaptive.route({
      useCase: { kind: 'tier', tier: 'quick-fix' },
      coherenceUnit: 'unit-x',
    });
    expect(after.decision.tierRequired).toBe('standard'); // floor raised the tier
    expect(after.decision.backendName).toBe('midStandard');

    // A different unit is unaffected — still fast.
    const other = await adaptive.route({
      useCase: { kind: 'tier', tier: 'quick-fix' },
      coherenceUnit: 'unit-y',
    });
    expect(other.decision.tierRequired).toBe('fast');
  });

  it('recordOutcome exhaustion emits routing:escalation-exhausted via the injected callback', () => {
    const esc = new EscalationState(1);
    const emitted: string[] = [];
    const router = new BackendRouter({ backends, routing: { default: 'cheapFast' } });
    const registry = buildCapabilityRegistry(backends);
    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: {},
      classify: () => verdict('trivial'),
      escalation: esc,
      onExhausted: (unit) => emitted.push(`routing:escalation-exhausted:${unit}`),
    });

    // Climb fast→standard→strong, then re-cross at strong ⇒ exhausted.
    adaptive.recordOutcome('u', 'fast', false); // → standard
    adaptive.recordOutcome('u', 'standard', false); // → strong
    expect(emitted).toHaveLength(0);
    adaptive.recordOutcome('u', 'strong', false); // strong re-crosses ⇒ exhausted
    expect(emitted).toContain('routing:escalation-exhausted:u');
  });

  it('recordOutcome is a safe no-op when no EscalationState is injected', () => {
    const router = new BackendRouter({ backends, routing: { default: 'cheapFast' } });
    const registry = buildCapabilityRegistry(backends);
    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: {},
      classify: () => verdict('trivial'),
    });
    expect(() => adaptive.recordOutcome('u', 'fast', false)).not.toThrow();
  });
});
