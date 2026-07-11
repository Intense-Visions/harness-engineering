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
  PrivacyNoMatch,
  type SelectConstraints,
} from './capability-registry.js';
import { estimateCost } from './cost-estimator.js';
import { EscalationState } from './escalation-state.js';
import type { RoutingDecisionBus } from '../routing/decision-bus.js';

export interface AdaptiveRouterDeps {
  router: BackendRouter;
  registry: BackendCapabilityRegistry;
  policy: RoutingPolicy;
  /**
   * Complexity classifier. Accepts a sync verdict-provider (Phase-3 conservative
   * stub) OR an async classifier (D4 live cascade); `route()` awaits either shape.
   * A rejection/throw is caught and degraded to `{moderate, low}` (never blocks
   * dispatch — Failure modes / D4).
   */
  classify: (req: RoutingRequest) => ComplexityVerdict | Promise<ComplexityVerdict>;
  /** name → provider type, derived from agent.backends (Task 6). REQUIRED when policy.allowedProviders is set. */
  providerOf?: (name: string) => BackendDef['type'] | undefined;
  /** Injected spend snapshot (D8/S1-001). Defaults to 0-spend. */
  budgetState?: () => { spentUsd: number };
  /**
   * D10 vertical escalation state. When present, `route()` uses
   * `escalation.floorFor(req.coherenceUnit)` as the tier floor (a climbed unit
   * resolves higher); when absent, the floor is the no-op `'fast'`.
   */
  escalation?: EscalationState;
  /**
   * D10 steward-escalation seam. Invoked with the `coherenceUnit` when
   * `recordOutcome` returns `'exhausted'` (floor already `strong`, re-crossed the
   * threshold). The orchestrator binds this to `routingDecisionBus`/logger to emit
   * `routing:escalation-exhausted`.
   */
  onExhausted?: (coherenceUnit: string) => void;
  /**
   * SC9: enriched-decision bus. The shipped `resolveDecisionAndDef` emits the
   * BASE decision inside the D2-frozen router (no `complexity`/`tierRequired`/
   * `estCostUsd`). When `AdaptiveRouter` owns live dispatch it emits the
   * ENRICHED decision here so a subscriber actually receives the AMR telemetry.
   * Absent ⇒ no enriched emit (and when AMR is off the router isn't constructed,
   * so nothing changes on the bus — SC8/SC17 preserved).
   */
  decisionBus?: RoutingDecisionBus;
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
    classify: (req: RoutingRequest) => ComplexityVerdict | Promise<ComplexityVerdict>;
    budgetState?: () => { spentUsd: number };
    /** D10: injected escalation state; defaults to a fresh one seeded from `policy.escalationThreshold`. */
    escalation?: EscalationState;
    /** D10: steward-escalation seam bound by the orchestrator to the decision bus/logger. */
    onExhausted?: (coherenceUnit: string) => void;
    /** SC9: enriched-decision bus (the same instance dispatch emits base decisions onto). */
    decisionBus?: RoutingDecisionBus;
  }): AdaptiveRouter {
    const registry = buildCapabilityRegistry(args.backends, args.pool);
    const providerOf = (name: string): BackendDef['type'] | undefined => args.backends[name]?.type;
    const escalation = args.escalation ?? new EscalationState(args.policy.escalationThreshold);
    return new AdaptiveRouter({
      router: args.router,
      registry,
      policy: args.policy,
      classify: args.classify,
      providerOf,
      escalation,
      ...(args.budgetState ? { budgetState: args.budgetState } : {}),
      ...(args.onExhausted ? { onExhausted: args.onExhausted } : {}),
      ...(args.decisionBus ? { decisionBus: args.decisionBus } : {}),
    });
  }

  async route(req: RoutingRequest): Promise<{ decision: RoutingDecision; def: BackendDef }> {
    const complexity = req.complexity ?? (await this.classifySafe(req));
    const spend = (this.deps.budgetState ?? (() => ({ spentUsd: 0 })))();
    // D10: the escalation floor raises the derived tier for a coherence unit that
    // has climbed on repeated quality failure. Absent EscalationState ⇒ no-op 'fast'.
    const escalationFloor: CapabilityTier =
      this.deps.escalation?.floorFor(req.coherenceUnit) ?? 'fast';
    const requiredTier: CapabilityTier = deriveRequiredTier(
      complexity,
      req.risk,
      this.deps.policy,
      spend,
      escalationFloor
    );
    const target = this.selectTarget(requiredTier, req); // Tasks 5–7 fill this
    const { decision, def } = this.deps.router.resolveDecisionAndDef(req.useCase, {
      ...(target !== undefined ? { invocationOverride: target } : {}),
    });
    const enriched: RoutingDecision = {
      ...decision,
      complexity,
      tierRequired: requiredTier,
      estCostUsd: estimateCost(def, req),
    };
    // SC9: surface the enrichment to bus subscribers. `resolveDecisionAndDef`
    // already emitted the BASE decision (D2-frozen); this second emit carries the
    // AMR fields (`complexity`/`tierRequired`/`estCostUsd`) so telemetry drains and
    // dashboards see complexity-aware routing. Only fires on the AMR path — when
    // no policy is set the router is never constructed, so the bus is unchanged.
    this.deps.decisionBus?.emit(enriched);
    return { decision: enriched, def };
  }

  /**
   * D4 fail-safe: await the (possibly async) classifier; if it rejects or throws,
   * degrade to a conservative `{ level:'moderate', confidence:'low' }` verdict.
   * Classification NEVER blocks dispatch — a classifier failure/timeout must not
   * propagate out of `route()`.
   */
  private async classifySafe(req: RoutingRequest): Promise<ComplexityVerdict> {
    try {
      return await this.deps.classify(req);
    } catch {
      return { level: 'moderate', confidence: 'low', signals: {}, source: 'static' };
    }
  }

  /**
   * D10 outcome feedback (mirrors LocalModelResolver.recordSuccess/recordFailure).
   * Only QUALITY failures are reported here; transport/inference errors go to the
   * shipped per-model breaker and must NOT reach this path (they never
   * double-count). A quality failure that re-crosses the threshold while the floor
   * is already `strong` returns `'exhausted'` from EscalationState, at which point
   * the injected `onExhausted` seam emits `routing:escalation-exhausted` for
   * steward escalation. No-op when no EscalationState is injected.
   */
  recordOutcome(coherenceUnit: string, tier: CapabilityTier, ok: boolean): void {
    const result = this.deps.escalation?.recordOutcome(coherenceUnit, tier, ok);
    if (result === 'exhausted') {
      this.deps.onExhausted?.(coherenceUnit);
    }
  }

  private selectTarget(tier: CapabilityTier, req: RoutingRequest): string | undefined {
    let target: ReturnType<typeof selectCheapestQualifying>;
    try {
      target = selectCheapestQualifying(
        this.deps.registry,
        tier,
        this.buildConstraints(req),
        this.deps.providerOf
      );
    } catch (err) {
      if (err instanceof PrivacyNoMatch) {
        // S4-001: privacy/allowlist exclusion fails CLOSED — never fall through
        // to identity routing at a non-compliant backend. Re-raise; the dispatch
        // site (orchestrator, Task 8/9) maps this to a routing:no-tier-match
        // steward escalation. route() therefore never calls resolveDecisionAndDef
        // with a compliant-fallback override on this path.
        throw err;
      }
      throw err;
    }
    // undefined ⇒ tier/cost-only exclusion ⇒ identity/default fall-through (best-effort).
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
