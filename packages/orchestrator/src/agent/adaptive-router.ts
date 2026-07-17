import type {
  BackendCapabilityRegistry,
  BackendDef,
  CapabilityTier,
  ComplexityVerdict,
  RoutingDecision,
  RoutingPolicy,
  RoutingRequest,
  RoutingTelemetry,
  RoutingTelemetryDecision,
  RoutingStatus,
  RoutingBudgetStatus,
} from '@harness-engineering/types';
import {
  deriveRequiredTier,
  TIER_RANK,
  RANK_TIER,
  DEFAULT_DEGRADE_AT_PCT,
} from '@harness-engineering/intelligence';
import { RoutingError } from '@harness-engineering/types';
import type { PoolStateProvider } from '@harness-engineering/local-models';
import type { BackendRouter } from './backend-router.js';
import {
  buildCapabilityRegistry,
  selectCheapestQualifying,
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
  /**
   * D8 live spend accumulator. Monotonic sum of `estCostUsd` over every decision
   * this router has made. `route()` reads it (via the `budgetState` default)
   * BEFORE deriving a tier, so `deriveRequiredTier`'s budget clamp actually fires
   * as spend accrues — previously `budgetState` was an un-wired `{ spentUsd: 0 }`
   * stub, so the clamp was dead.
   *
   * Semantics (deliberately modest — do NOT read this as a hard ceiling):
   * - **Soft, lagging cap.** The clamp reads spend accrued from PRIOR dispatches;
   *   a burst of concurrent dispatches all read a stale-low total before any of
   *   them accrues, so a burst can overshoot `capUsd` before the clamp engages.
   *   This is a degrade *signal*, not an admission gate.
   * - **Single-step degrade.** `deriveRequiredTier` lowers the tier by exactly ONE
   *   step under budget pressure and never below the D5 privacy veto floor — it
   *   does not throttle progressively toward `fast`.
   * - **Monotonic** (NOT the bounded `projectTelemetry` ring-sum): a long run must
   *   not evict early spend and un-clamp. Preserved across `setPolicy` (instance
   *   persists) — note a *lowered* `capUsd` then clamps immediately and, since the
   *   total never decreases, irreversibly for the rest of the run.
   * An injected `deps.budgetState` overrides this for the clamp (DI/tests).
   */
  private spentUsd = 0;

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

  /**
   * AMR Phase 5 (D1): hot-swap the routing policy in place. Every policy field
   * takes effect on the NEXT dispatch EXCEPT `escalationThreshold` (see note) —
   * the capability registry and `providerOf` are derived from `agent.backends`,
   * NOT from `policy`, so a policy edit leaves them untouched; `route()` /
   * `buildConstraints` / `deriveRequiredTier` all read `this.deps.policy` fresh,
   * so the swapped-in tier matrix / privacy floor / allowlist / budget all apply.
   * The live {@link EscalationState} is preserved by reference: a unit's climbed
   * floor survives the swap (a policy edit must not reset accumulated escalation).
   * The monotonic spend accumulator also persists — so a swap that LOWERS `capUsd`
   * clamps immediately and irreversibly for the rest of the run (see `spentUsd`).
   *
   * Threshold note: the `EscalationState` was seeded with the ORIGINAL policy's
   * `escalationThreshold` and is intentionally NOT re-seeded here — re-seeding
   * would conflate "raise the bar" with "reset progress". Preserving climbed
   * floors is the invariant (SC1); a live threshold change is out of scope (D1).
   */
  setPolicy(policy: RoutingPolicy): void {
    this.deps.policy = policy;
  }

  /**
   * AMR Phase 5 (D2): project the ENRICHED routing decisions in the bus ring
   * buffer into the Shuttle telemetry wire shape ({@link RoutingTelemetry}).
   *
   * Non-destructive — this backs the idempotent `GET /api/v1/routing/telemetry`,
   * so it reads (never clears) the ring; the ring self-evicts FIFO at capacity
   * and Shuttle dedups by `decisionTs`. `spentUsd` is therefore a sum over the
   * RETAINED ring (telemetry, not billing-of-record).
   *
   * Filters to ENRICHED decisions only — those `AdaptiveRouter.route()` emitted,
   * carrying `estCostUsd`+`tierRequired`. The SAME bus also carries the BASE emit
   * from `BackendRouter.resolveDecisionAndDef` (neither field), so an unfiltered
   * projection would double-count rows and under-fill `spentUsd`. Returns an
   * empty payload when no bus is wired or no enriched decisions exist.
   */
  projectTelemetry(): RoutingTelemetry {
    const bus = this.deps.decisionBus;
    if (bus === undefined) return { decisions: [], spentUsd: 0 };
    const decisions: RoutingTelemetryDecision[] = [];
    let spentUsd = 0;
    for (const d of bus.recent()) {
      // Enriched rows carry BOTH fields; the base BackendRouter emit carries
      // neither. Guard on both so a partially-shaped decision can't slip in.
      if (d.estCostUsd === undefined || d.tierRequired === undefined) continue;
      decisions.push({
        decisionTs: d.timestamp,
        tierRequired: d.tierRequired,
        backend: d.backendName,
        estCostUsd: d.estCostUsd,
      });
      spentUsd += d.estCostUsd;
    }
    return { decisions, spentUsd };
  }

  /**
   * D8: the EFFECTIVE spend total the budget clamp reads — the injected
   * `budgetState` when present, otherwise the router's own monotonic accumulator.
   * Returning the effective value (not blindly the internal tally) means an
   * operator reading this always sees the number that actually drove routing.
   */
  getSpentUsd(): number {
    return this.deps.budgetState ? this.deps.budgetState().spentUsd : this.spentUsd;
  }

  /**
   * AMR observability: the live operator status — budget spend-vs-cap (using the
   * monotonic accumulator that drives the clamp, NOT the telemetry ring sum),
   * the coherence units that have climbed their escalation floor, and the active
   * provider allowlist. Called only on a live router, so `active` is always true.
   */
  getStatus(): RoutingStatus {
    const policy = this.deps.policy;
    const budget = policy.budget;
    let budgetStatus: RoutingBudgetStatus | null = null;
    if (budget && budget.capUsd > 0) {
      const spentUsd = this.getSpentUsd();
      // Same default the clamp uses, imported (not hardcoded) so status can't
      // drift from deriveRequiredTier's actual behavior.
      const degradeAtPct = budget.degradeAtPct ?? DEFAULT_DEGRADE_AT_PCT;
      budgetStatus = {
        spentUsd,
        capUsd: budget.capUsd,
        degradeAtPct,
        spentPct: Math.round((spentUsd / budget.capUsd) * 100),
        // Compute from the exact fraction so these match the real clamp conditions
        // (`spentFraction >= degradeAt` / `>= 1`), not the display-rounded percent.
        degrading: spentUsd / budget.capUsd >= degradeAtPct / 100,
        exhausted: spentUsd / budget.capUsd >= 1,
      };
    }
    return {
      active: true,
      budget: budgetStatus,
      escalation: this.deps.escalation?.climbedUnits() ?? [],
      allowedProviders: policy.allowedProviders ?? null,
    };
  }

  async route(req: RoutingRequest): Promise<{ decision: RoutingDecision; def: BackendDef }> {
    const complexity = req.complexity ?? (await this.classifySafe(req));
    // D8: the budget clamp reads the spend accrued from PRIOR dispatches (this
    // decision's own cost isn't known until a backend is selected below). An
    // injected `budgetState` wins (DI/tests); otherwise the live internal
    // accumulator. From here to the accumulate below there is NO `await`, so the
    // read → derive → accumulate window is atomic per call (no lost updates).
    const spend = this.deps.budgetState ? this.deps.budgetState() : { spentUsd: this.spentUsd };
    // D8 hard cap, `human` mode: at/above 100% of `capUsd`, do NOT route — throw a
    // fail-closed `budget-exhausted` that the dispatch boundary turns into a single
    // `routing:budget-exhausted` steward escalation (mirrors the privacy-no-match
    // path). Thrown BEFORE any backend selection / cost accrual, so an un-routed
    // dispatch spends nothing. Fires regardless of the D5 veto: a sensitive task is
    // not cheapened, it is paused for a human's budget decision (`degrade`/`pause`
    // stay in the pure clamp — route cheaper, never halt). Default-off: no budget ⇒
    // this is skipped and dispatch is byte-identical.
    const budget = this.deps.policy.budget;
    if (
      budget &&
      budget.capUsd > 0 &&
      budget.onBudgetExhausted === 'human' &&
      spend.spentUsd / budget.capUsd >= 1
    ) {
      throw new RoutingError(
        'budget-exhausted',
        `routing budget cap $${budget.capUsd} reached (spent ~$${spend.spentUsd.toFixed(
          2
        )}); onBudgetExhausted=human — surfacing to a steward instead of routing`
      );
    }
    // D10: the escalation floor raises the derived tier for a coherence unit that
    // has climbed on repeated quality failure. Absent EscalationState ⇒ no-op 'fast'.
    // split-routing D8(a): a caller (the workflow engine's one-shot per-stage
    // retry) may pin a request-scoped floor via `req.floor` (a bumped tier). We
    // take the max-by-rank of the cumulative unit floor and the request floor so
    // the retry routes at the higher tier WITHOUT mutating EscalationState.
    // Additive: `req.floor` absent ⇒ this reduces to the prior expression exactly
    // (max(escalationFloor, 'fast') === escalationFloor), so `route()` is
    // behaviorally identical to before (SC8).
    const unitFloor: CapabilityTier = this.deps.escalation?.floorFor(req.coherenceUnit) ?? 'fast';
    const escalationFloor: CapabilityTier =
      RANK_TIER[Math.max(TIER_RANK[unitFloor], TIER_RANK[req.floor ?? 'fast'])]!;
    const requiredTier: CapabilityTier = deriveRequiredTier(
      complexity,
      req.risk,
      this.deps.policy,
      spend,
      escalationFloor
    );
    const target = this.selectTarget(requiredTier, req); // Tasks 5–7 fill this
    // #876 execution-stage mis-route fix (D4/SC3): a useCase with NO per-skill /
    // per-mode / per-tier binding is SUPPOSED to resolve to `routing.default` (the
    // per-phase execution backend). Handing `selectTarget`'s tier-cheapest
    // qualifying backend to `invocationOverride` would short-circuit
    // `resolve()` step 1 and land it on the reasoner instead. So when the useCase
    // would fall to default, we DROP the override and let `resolveDecisionAndDef`
    // resolve through the normal chain to `routing.default`. AMR tier selection is
    // preserved for every OTHER useCase (tier / intelligence / per-skill / design
    // stages with a bound cognitiveMode) — those do NOT fall to default, so the
    // override still applies. A privacy/allowlist exclusion still fails closed in
    // `selectTarget` (it throws before we reach here), so this gate never masks it.
    const applyOverride = target !== undefined && !this.deps.router.wouldFallToDefault(req.useCase);
    const { decision, def } = this.deps.router.resolveDecisionAndDef(req.useCase, {
      ...(applyOverride ? { invocationOverride: target } : {}),
    });
    const estCostUsd = estimateCost(def, req);
    // D8: accrue this decision's estimated cost into the monotonic accumulator so
    // the NEXT dispatch's budget clamp sees it. Always accrues (cheap; harmless
    // when no budget is set — the clamp simply no-ops); an injected `budgetState`
    // means the caller owns accounting, so we leave the internal total unused.
    this.spentUsd += estCostUsd;
    const enriched: RoutingDecision = {
      ...decision,
      complexity,
      tierRequired: requiredTier,
      estCostUsd,
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
    // S4-001: selection fails CLOSED — `selectCheapestQualifying` throws
    // `PrivacyNoMatch` when a privacy/allowlist exclusion leaves no compliant
    // backend, and that MUST propagate rather than fall through to identity
    // routing at a non-compliant backend. We deliberately do NOT catch here (a
    // catch-and-rethrow would be a useless wrapper): the throw bubbles to the
    // dispatch site (orchestrator, Task 8/9), which maps it to a
    // routing:no-tier-match steward escalation; route() never calls
    // resolveDecisionAndDef with a compliant-fallback override on this path.
    const target = selectCheapestQualifying(
      this.deps.registry,
      tier,
      this.buildConstraints(req),
      this.deps.providerOf
    );
    // undefined ⇒ tier/cost-only exclusion ⇒ identity/default fall-through (best-effort).
    return target?.name;
  }

  /**
   * Translate the request's declared constraints into {@link SelectConstraints}.
   * `policy.privacyFloor`, the provider allowlist (AMR Phase 5, D3), and the
   * per-request capability needs are threaded in. `providerOf` is derived
   * unconditionally in `fromConfig`, so the allowlist can never silently
   * fail-close every request (Phase-1 finding, capability-registry.ts:60-66).
   */
  private buildConstraints(req: RoutingRequest): SelectConstraints {
    const allowed = this.deps.policy.allowedProviders;
    return {
      ...(this.deps.policy.privacyFloor !== undefined
        ? { privacyFloor: this.deps.policy.privacyFloor }
        : {}),
      // AMR Phase 5 (D3): provider allowlist. Pass ONLY when non-empty — an empty
      // array would fail-close EVERY request (`selectCheapestQualifying` treats
      // `allowed: []` as "admit none"). Absent/empty ⇒ all providers eligible.
      ...(allowed !== undefined && allowed.length > 0 ? { allowed } : {}),
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
