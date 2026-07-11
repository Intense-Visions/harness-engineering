import { describe, it, expect, vi } from 'vitest';
import type {
  BackendCapabilities,
  BackendDef,
  ComplexityVerdict,
  RoutingPolicy,
  RoutingRequest,
} from '@harness-engineering/types';
import { BackendRouter } from './backend-router.js';
import { buildCapabilityRegistry } from './capability-registry.js';
import { AdaptiveRouter } from './adaptive-router.js';

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
  it('route() returns { decision, def } enriched with complexity/tierRequired/estCostUsd', () => {
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
    const { decision, def } = adaptive.route(req);

    expect(def.type).toBe('local');
    expect(decision.complexity).toEqual(verdict('moderate'));
    expect(decision.tierRequired).toBeDefined();
    expect(typeof decision.estCostUsd).toBe('number');
    // classify invoked exactly once because req.complexity was absent.
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it('does NOT call classify when req.complexity is already provided', () => {
    const backends = { 'cheap-fast': localDef(cap()) };
    const router = new BackendRouter({ backends, routing: { default: 'cheap-fast' } });
    const registry = buildCapabilityRegistry(backends);
    const classify = vi.fn(() => verdict('trivial'));

    const adaptive = new AdaptiveRouter({ router, registry, policy: minimalPolicy, classify });

    const req: RoutingRequest = {
      useCase: { kind: 'tier', tier: 'quick-fix' },
      complexity: verdict('complex'),
    };
    const { decision } = adaptive.route(req);

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

  it('a trivial verdict resolves via the cheapest fast backend (invocationOverride)', () => {
    const router = new BackendRouter({ backends, routing });
    const registry = buildCapabilityRegistry(backends);
    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: minimalPolicy,
      classify: () => verdict('trivial'),
    });

    const { decision } = adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(decision.backendName).toBe('cheapFast');
    expect(decision.tierRequired).toBe('fast');
  });

  it('a complex verdict resolves via the strong backend', () => {
    const router = new BackendRouter({ backends, routing });
    const registry = buildCapabilityRegistry(backends);
    const adaptive = new AdaptiveRouter({
      router,
      registry,
      policy: minimalPolicy,
      classify: () => verdict('complex'),
    });

    const { decision } = adaptive.route({ useCase: { kind: 'tier', tier: 'quick-fix' } });
    expect(decision.backendName).toBe('strong');
    expect(decision.tierRequired).toBe('strong');
  });

  it('threads req.capabilities (needsVision/needsToolUse/minContextTokens) into constraints', () => {
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

    const { decision } = adaptive.route({
      useCase: { kind: 'tier', tier: 'quick-fix' },
      capabilities: { needsVision: true },
    });
    expect(decision.backendName).toBe('strong');
  });
});
