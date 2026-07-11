import { describe, it, expect } from 'vitest';
import type {
  BackendCapabilities,
  BackendDef,
  Issue,
  RoutingPolicy,
  RoutingRequest,
} from '@harness-engineering/types';
import { BackendRouter } from './backend-router.js';
import { buildCapabilityRegistry } from './capability-registry.js';
import { AdaptiveRouter } from './adaptive-router.js';
import { makeLiveClassify } from './live-classify.js';
import { buildTaskText } from './complexity-request.js';

/**
 * SC1 LIVE (final-review finding #2): the AdaptiveRouter is wired to the REAL
 * intelligence complexity cascade via `makeLiveClassify`, NOT the Phase-3
 * constant `{moderate, low}` stub and NOT an injected `req.complexity`. This
 * proves live classification of ACTUAL task text changes the routed tier by
 * difficulty — the whole point of the wire.
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

// fast + standard + strong so the derived tier has room to move by difficulty.
const backends = {
  cheapFast: localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
  mid: localDef(cap({ tier: 'standard', costPer1kTokens: 3 })),
  strong: localDef(cap({ tier: 'strong', costPer1kTokens: 10 })),
};
// Default `strong` so cheaper selections prove tier selection OVERRODE the default.
const routing = { default: 'strong' } as const;
const minimalPolicy: RoutingPolicy = {};

function makeIssue(over: Partial<Issue>): Issue {
  return {
    id: 'i1',
    identifier: 'CORE-1',
    title: 'title',
    description: null,
    priority: null,
    state: 'planned',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: null,
    ...over,
  };
}

/** A clearly-trivial, well-scoped unit: short, spec attached, measurable acceptance. */
const TRIVIAL_ISSUE = makeIssue({
  title: 'Bump version',
  description: 'Acceptance: 1 test',
  spec: 'docs/specs/bump.md',
});

/** A clearly-complex, unscoped unit: very long description, no spec, no acceptance. */
const COMPLEX_ISSUE = makeIssue({
  title: 'Redesign scheduling subsystem',
  description: 'x'.repeat(4000),
  spec: null,
});

const TIER_RANK = { fast: 0, standard: 1, strong: 2 } as const;

function newRouter(): AdaptiveRouter {
  const router = new BackendRouter({ backends, routing });
  const registry = buildCapabilityRegistry(backends);
  return new AdaptiveRouter({
    router,
    registry,
    policy: minimalPolicy,
    // REAL cascade, provider absent ⇒ fully offline / static-only. No stub.
    classify: makeLiveClassify(() => undefined),
  });
}

function reqFor(issue: Issue): RoutingRequest {
  return {
    useCase: { kind: 'tier', tier: 'quick-fix' },
    coherenceUnit: issue.id,
    taskText: buildTaskText(issue),
  };
}

describe('AdaptiveRouter — SC1 LIVE (real cascade, not stub, not injected complexity)', () => {
  it('classifies a trivial-text unit at a strictly LOWER tier than a complex-text unit', async () => {
    const adaptive = newRouter();

    const trivial = await adaptive.route(reqFor(TRIVIAL_ISSUE));
    const complex = await adaptive.route(reqFor(COMPLEX_ISSUE));

    // The wire is live: the ONLY difference between the two requests is the task
    // text (no injected req.complexity). The derived tier MUST move by difficulty.
    expect(TIER_RANK[trivial.decision.tierRequired!]).toBeLessThan(
      TIER_RANK[complex.decision.tierRequired!]
    );

    // And the complexity band itself reflects the live static verdict, not the
    // constant `moderate` stub.
    expect(trivial.decision.complexity?.source).toBe('static');
    expect(complex.decision.complexity?.source).toBe('static');
    expect(trivial.decision.complexity?.level).not.toBe(complex.decision.complexity?.level);
  });

  it('the trivial-text unit resolves the cheapest fast backend (tier selection overrides the strong default)', async () => {
    const adaptive = newRouter();
    const { decision } = await adaptive.route(reqFor(TRIVIAL_ISSUE));
    expect(decision.tierRequired).toBe('fast');
    expect(decision.backendName).toBe('cheapFast');
  });

  it('the complex-text unit routes to the strong backend', async () => {
    const adaptive = newRouter();
    const { decision } = await adaptive.route(reqFor(COMPLEX_ISSUE));
    expect(decision.backendName).toBe('strong');
  });

  it('a request with NO taskText degrades to the conservative {moderate, low} verdict (D4), never throwing', async () => {
    const adaptive = newRouter();
    const { decision } = await adaptive.route({
      useCase: { kind: 'tier', tier: 'quick-fix' },
      coherenceUnit: 'x',
      // no taskText
    });
    expect(decision.complexity?.level).toBe('moderate');
    expect(decision.complexity?.confidence).toBe('low');
  });
});
