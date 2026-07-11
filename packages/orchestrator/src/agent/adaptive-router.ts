import type {
  BackendCapabilityRegistry,
  BackendDef,
  CapabilityTier,
  ComplexityVerdict,
  RoutingDecision,
  RoutingPolicy,
  RoutingRequest,
} from '@harness-engineering/types';
import { deriveRequiredTier } from '@harness-engineering/intelligence';
import type { PoolStateProvider } from '@harness-engineering/local-models';
import type { BackendRouter } from './backend-router.js';
import {
  buildCapabilityRegistry,
  selectCheapestQualifying,
  type SelectConstraints,
} from './capability-registry.js';
import { estimateCost } from './cost-estimator.js';

export interface AdaptiveRouterDeps {
  router: BackendRouter;
  registry: BackendCapabilityRegistry;
  policy: RoutingPolicy;
  classify: (req: RoutingRequest) => ComplexityVerdict;
  /** name → provider type, derived from agent.backends (Task 6). REQUIRED when policy.allowedProviders is set. */
  providerOf?: (name: string) => BackendDef['type'] | undefined;
  /** Injected spend snapshot (D8/S1-001). Defaults to 0-spend. */
  budgetState?: () => { spentUsd: number };
}

/**
 * AMR Phase 3 (D2): wraps — never modifies — the shipped {@link BackendRouter}.
 *
 * `route()` classifies the request, derives the required {@link CapabilityTier}
 * via `deriveRequiredTier`, picks the cheapest qualifying backend
 * (`selectCheapestQualifying`), and delegates the actual resolution to
 * `router.resolveDecisionAndDef` — enriching the returned {@link RoutingDecision}
 * with `complexity`/`tierRequired`/`estCostUsd` (SC9). The shipped router's
 * identity/default chain still owns the final backend lookup, so when tier
 * selection abstains (`undefined`) dispatch falls through unchanged.
 */
export class AdaptiveRouter {
  constructor(private readonly deps: AdaptiveRouterDeps) {}

  /**
   * Construct an `AdaptiveRouter` from an orchestrator's `agent.backends`
   * (plus optional LMLM pool). Builds the capability registry via
   * `buildCapabilityRegistry` and — crucially — derives `providerOf`
   * UNCONDITIONALLY from `agent.backends` (name → `def.type`).
   *
   * Phase-1 finding (capability-registry.ts:60-66): passing an allowlist to
   * `selectCheapestQualifying` WITHOUT a `providerOf` fail-closes EVERY request
   * (silent DoS), because every candidate's provider reads back as `undefined`.
   * Deriving `providerOf` here means enabling the (Phase-5) allowlist branch can
   * never accidentally deny-all.
   */
  static fromConfig(args: {
    router: BackendRouter;
    backends: Record<string, BackendDef>;
    pool?: PoolStateProvider;
    policy: RoutingPolicy;
    classify: (req: RoutingRequest) => ComplexityVerdict;
    budgetState?: () => { spentUsd: number };
  }): AdaptiveRouter {
    const registry = buildCapabilityRegistry(args.backends, args.pool);
    const providerOf = (name: string): BackendDef['type'] | undefined => args.backends[name]?.type;
    return new AdaptiveRouter({
      router: args.router,
      registry,
      policy: args.policy,
      classify: args.classify,
      providerOf,
      ...(args.budgetState ? { budgetState: args.budgetState } : {}),
    });
  }

  route(req: RoutingRequest): { decision: RoutingDecision; def: BackendDef } {
    const complexity = req.complexity ?? this.deps.classify(req);
    const spend = (this.deps.budgetState ?? (() => ({ spentUsd: 0 })))();
    // Phase-4 seam: escalation floor is a no-op 'fast' until EscalationState lands.
    const requiredTier: CapabilityTier = deriveRequiredTier(
      complexity,
      req.risk,
      this.deps.policy,
      spend,
      'fast'
    );
    const target = this.selectTarget(requiredTier, req); // Tasks 5–7 fill this
    const { decision, def } = this.deps.router.resolveDecisionAndDef(req.useCase, {
      ...(target !== undefined ? { invocationOverride: target } : {}),
    });
    return {
      decision: {
        ...decision,
        complexity,
        tierRequired: requiredTier,
        estCostUsd: estimateCost(def, req),
      },
      def,
    };
  }

  private selectTarget(tier: CapabilityTier, req: RoutingRequest): string | undefined {
    const target = selectCheapestQualifying(
      this.deps.registry,
      tier,
      this.buildConstraints(req),
      this.deps.providerOf
    );
    return target?.name;
  }

  /**
   * Translate the request's declared constraints into {@link SelectConstraints}.
   * `policy.privacyFloor` and the per-request capability needs are threaded in;
   * the provider allowlist branch stays DORMANT in Phase 3 (`RoutingPolicy` does
   * not declare `allowedProviders` until Phase 5 tenant push-down). Task 6 still
   * derives `providerOf` unconditionally so enabling the allowlist later cannot
   * silently fail-close every request (Phase-1 finding, capability-registry.ts:60-66).
   */
  private buildConstraints(req: RoutingRequest): SelectConstraints {
    return {
      ...(this.deps.policy.privacyFloor !== undefined
        ? { privacyFloor: this.deps.policy.privacyFloor }
        : {}),
      ...(req.capabilities?.needsVision !== undefined
        ? { needsVision: req.capabilities.needsVision }
        : {}),
      ...(req.capabilities?.needsToolUse !== undefined
        ? { needsToolUse: req.capabilities.needsToolUse }
        : {}),
      ...(req.capabilities?.minContextTokens !== undefined
        ? { minContextTokens: req.capabilities.minContextTokens }
        : {}),
    };
  }
}
