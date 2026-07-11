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
import type { BackendRouter } from './backend-router.js';
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

  // Placeholder — replaced in Tasks 5–7. Returns undefined so Task 4 delegates to identity chain.
  private selectTarget(_tier: CapabilityTier, _req: RoutingRequest): string | undefined {
    return undefined;
  }
}
