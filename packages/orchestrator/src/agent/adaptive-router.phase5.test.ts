import { describe, it, expect } from 'vitest';
import type {
  BackendCapabilities,
  BackendDef,
  ComplexityVerdict,
  RoutingPolicy,
} from '@harness-engineering/types';
import { BackendRouter } from './backend-router.js';
import { buildCapabilityRegistry, PrivacyNoMatch } from './capability-registry.js';
import { AdaptiveRouter } from './adaptive-router.js';
import { EscalationState } from './escalation-state.js';
import { RoutingDecisionBus } from '../routing/decision-bus.js';

/**
 * AMR Phase 5 (routing endpoints) — router-level coverage for the three
 * ingredients the HTTP endpoints compose in Phase 2:
 *   - `setPolicy` hot-swap (SC1) — next dispatch routes under the new policy;
 *     the accumulated EscalationState climbed floor is preserved across the swap.
 *   - `allowedProviders` allowlist (SC4) — a policy allowlist filters tier
 *     selection to allowed provider types; absent/empty ⇒ all eligible.
 *   - `projectTelemetry` (SC3 unit) — projects the enriched ring into Shuttle's
 *     wire shape, filtering the base BackendRouter emits so rows/`spentUsd`
 *     aren't double-counted.
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

// A second provider TYPE so the allowlist has something to discriminate on.
const mockDef = (capabilities: BackendCapabilities): BackendDef => ({ type: 'mock', capabilities });

const verdict = (level: ComplexityVerdict['level'] = 'trivial'): ComplexityVerdict => ({
  level,
  confidence: 'high',
  signals: {},
  source: 'static',
});

describe('AdaptiveRouter.setPolicy — hot-swap (SC1)', () => {
  // cheapMock (type mock, cost 0) vs pricierLocal (type local, cost 5): both fast,
  // so an allowlist — not tier/cost — is what flips the selection.
  const backends = {
    cheapMock: mockDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
    pricierLocal: localDef(cap({ tier: 'fast', costPer1kTokens: 5 })),
  };

  it('the NEXT dispatch routes under the swapped-in policy', async () => {
    const router = new BackendRouter({ backends, routing: { default: 'cheapMock' } });
    const adaptive = AdaptiveRouter.fromConfig({
      router,
      backends,
      policy: {},
      classify: () => verdict('trivial'),
    });

    // Before: no allowlist ⇒ cheapest qualifying (cheapMock).
    const before = await adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(before.decision.backendName).toBe('cheapMock');

    // Hot-swap in a policy that allows only `local` providers.
    adaptive.setPolicy({ allowedProviders: ['local'] });

    // After: the allowlist excludes the mock ⇒ pricierLocal, even though costlier.
    const after = await adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(after.decision.backendName).toBe('pricierLocal');
  });

  it('preserves the accumulated EscalationState climbed floor across a swap', async () => {
    const tierBackends = {
      cheapFast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
      midStandard: localDef(cap({ tier: 'standard', costPer1kTokens: 3 })),
    };
    const esc = new EscalationState(1); // one quality failure climbs the floor
    const router = new BackendRouter({ backends: tierBackends, routing: { default: 'cheapFast' } });
    const registry = buildCapabilityRegistry(tierBackends);
    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: {},
      classify: () => verdict('trivial'), // base tier fast
      escalation: esc,
    });

    // Climb unit-x's floor to standard.
    esc.recordOutcome('unit-x', 'fast', false);

    // Swap the policy (a fresh, unrelated object) — must NOT reset escalation.
    adaptive.setPolicy({ skillTierOverrides: {} });

    const after = await adaptive.route({
      useCase: { kind: 'tier', tier: 'quick-fix' },
      coherenceUnit: 'unit-x',
    });
    // Floor survived the swap: still routes at the climbed tier.
    expect(after.decision.tierRequired).toBe('standard');
    expect(after.decision.backendName).toBe('midStandard');
  });
});

describe('AdaptiveRouter — allowedProviders allowlist (SC4/D3)', () => {
  const backends = {
    cheapMock: mockDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
    pricierLocal: localDef(cap({ tier: 'fast', costPer1kTokens: 5 })),
  };

  const build = (policy: RoutingPolicy): AdaptiveRouter =>
    AdaptiveRouter.fromConfig({
      router: new BackendRouter({ backends, routing: { default: 'cheapMock' } }),
      backends,
      policy,
      classify: () => verdict('trivial'),
    });

  it('excludes non-allowed provider types from tier selection', async () => {
    const { decision } = await build({ allowedProviders: ['local'] }).route({
      useCase: { kind: 'tier', tier: 'quick-fix' },
    });
    expect(decision.backendName).toBe('pricierLocal'); // mock excluded
  });

  it('a policy WITHOUT an allowlist is unaffected (cheapest wins)', async () => {
    const { decision } = await build({}).route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(decision.backendName).toBe('cheapMock');
  });

  it('an EMPTY allowlist is treated as no constraint (not admit-none)', async () => {
    // Guard: `allowed: []` would fail-close every request; buildConstraints must
    // omit it so an empty array behaves like "all eligible".
    const { decision } = await build({ allowedProviders: [] }).route({
      useCase: { kind: 'tier', tier: 'quick-fix' },
    });
    expect(decision.backendName).toBe('cheapMock');
  });

  it('fails closed (PrivacyNoMatch) when the allowlist empties the qualifying set', async () => {
    await expect(
      build({ allowedProviders: ['openai'] }).route({
        useCase: { kind: 'tier', tier: 'quick-fix' },
      })
    ).rejects.toThrow(PrivacyNoMatch);
  });
});

describe('AdaptiveRouter.projectTelemetry — Shuttle wire projection (SC3 unit)', () => {
  const backends = {
    cheapFast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
    strong: localDef(cap({ tier: 'strong', costPer1kTokens: 6 })),
  };

  const wire = (bus: RoutingDecisionBus): AdaptiveRouter => {
    const router = new BackendRouter({
      backends,
      routing: { default: 'cheapFast' },
      decisionBus: bus, // base emits land here too
    });
    const registry = buildCapabilityRegistry(backends);
    return new AdaptiveRouter({
      router,
      registry,
      policy: {},
      classify: () => verdict('complex'), // complex ⇒ strong, non-zero cost
      decisionBus: bus,
    });
  };

  it('projects only ENRICHED decisions into the wire shape and sums spentUsd', async () => {
    const bus = new RoutingDecisionBus();
    const adaptive = wire(bus);

    await adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    await adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });

    const telemetry = adaptive.projectTelemetry();

    // Two routes ⇒ two enriched rows. The bus ALSO holds two base emits (from
    // resolveDecisionAndDef, no estCostUsd) — those must be filtered out, so the
    // count is 2, not 4.
    expect(telemetry.decisions).toHaveLength(2);
    for (const d of telemetry.decisions) {
      // Wire shape exactly — Shuttle's RoutingDecision keys.
      expect(Object.keys(d).sort()).toEqual([
        'backend',
        'decisionTs',
        'estCostUsd',
        'tierRequired',
      ]);
      expect(d.tierRequired).toBe('strong');
      expect(d.backend).toBe('strong');
      expect(typeof d.decisionTs).toBe('string');
      expect(d.estCostUsd).toBeGreaterThan(0);
      // single-container harness dispatch has no work-item/domain correlation
      expect(d.workItemId).toBeUndefined();
      expect(d.domainId).toBeUndefined();
    }
    expect(telemetry.spentUsd).toBeCloseTo(
      telemetry.decisions.reduce((s, d) => s + d.estCostUsd, 0)
    );
    expect(telemetry.spentUsd).toBeGreaterThan(0);
  });

  it('returns an empty payload when no decision bus is wired', () => {
    const adaptive = new AdaptiveRouter({
      router: new BackendRouter({ backends, routing: { default: 'cheapFast' } }),
      registry: buildCapabilityRegistry(backends),
      policy: {},
      classify: () => verdict('complex'),
      // no decisionBus
    });
    expect(adaptive.projectTelemetry()).toEqual({ decisions: [], spentUsd: 0 });
  });

  it('returns an empty payload when the bus holds only base (non-enriched) emits', async () => {
    // Bus wired to the ROUTER only — base emits accumulate, but the AdaptiveRouter
    // has no bus so it emits no enriched rows; the projection reads its own
    // (absent) bus and returns empty. Proves the filter, not just an empty ring.
    const bus = new RoutingDecisionBus();
    const router = new BackendRouter({
      backends,
      routing: { default: 'cheapFast' },
      decisionBus: bus,
    });
    const adaptive = new AdaptiveRouter({
      router,
      registry: buildCapabilityRegistry(backends),
      policy: {},
      classify: () => verdict('complex'),
      // no decisionBus on the AdaptiveRouter
    });
    await adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(adaptive.projectTelemetry()).toEqual({ decisions: [], spentUsd: 0 });
  });
});
