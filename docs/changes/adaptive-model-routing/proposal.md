# Adaptive Model Routing (AMR)

**Status:** Draft · **Tier:** Large · **Domain:** orchestrator / intelligence
**Keywords:** routing, complexity-aware, provider-neutral, capability-tier, cost-tier, split-routing, tenant-policy, autonomy, authority-scope

## Overview

Routing already exists and is shipped. `BackendRouter` (Spec 2, `multi-backend-routing`) resolves a `RoutingUseCase` to a concrete backend name with fallback chains and a `routing:decision` telemetry bus; Spec B (`granular-task-routing`) added per-skill and per-cognitive-mode axes. **All of it is static config keyed on _identity_** — a skill/mode/tier maps to a fixed backend name. `harness-brainstorming` routes to the same backend whether the task is a one-line rename or a distributed-systems redesign.

Adaptive Model Routing (AMR) adds the missing axis: **route by the difficulty and risk of the specific invocation, not just its identity**, and express targets as **provider-neutral capability tiers** so the engine picks the _cheapest backend that clears the required bar_ rather than the operator naming a backend per skill. AMR is a policy layer that sits **upstream of the shipped `BackendRouter` and feeds it** — the router, its fallback chains, and its decision bus are unchanged.

AMR has four capabilities, each additive:

1. **Complexity triage** — a cheap-first cascade emits a confidence-rated `ComplexityVerdict` for each invocation.
2. **Provider-neutral tier resolution** — the required capability tier (`fast`/`standard`/`strong`) is computed per invocation and resolved to the _cheapest qualifying backend_ under hard constraints. Local vs. cloud is a backend _attribute_ (cost, privacy, latency), never a routing branch.
3. **Split-routing** — a skill emitting a workflow gets a routing decision _per stage_, so mechanical stages run cheap and adversarial/creative stages run capable within one skill run.
4. **Tenant-governed policy + autonomy hooks** — per-tenant policy (allowed providers, budget caps, privacy floor) pushed down via the Shuttle `RuntimeAdapter`, and a `ComplexityVerdict` that gates Meridian `AuthorityScope` autonomy (auto-develop straightforward roadmap items).

## Why now

1. **Provider-neutral cost fitness.** The shipped router forces the operator to name a backend per skill. A fully-cloud tenant still wants trivial work on Haiku/`gpt-4o-mini` and hard work on Opus/`o1` — a capability-tier abstraction delivers that with no local models involved. Cheap-vs-capable is the axis; local-vs-cloud is one attribute of it.
2. **Same-skill difficulty spread.** The dominant routing waste is a capable model doing trivial work (and, worse, a cheap model doing subtle work). Identity-based routing can't tell them apart; per-invocation complexity can.
3. **Autonomy prerequisite.** "Analyze a roadmap item for complexity and develop it without a human if straightforward" _is_ a complexity verdict feeding an authority scope. AMR's `ComplexityVerdict` is the shared input to both routing and autonomy gating.
4. **SaaS economics.** In a hosted platform every token has a payer. Routing becomes a margin decision, and it must be governed per-tenant (budgets, privacy, BYO-key) and metered. AMR carries the policy; Shuttle owns the dollars.

**Strategy grounding.** AMR extends the **Multi-client portability** track (`STRATEGY.md#tracks` — _"per-skill / per-cognitive-mode backend routing"_) from static identity routing to difficulty- and cost-aware routing, and its autonomy ladder is a direct lever on the **Agent Autonomy** key metric (`STRATEGY.md#key-metrics` — % of merged PRs that are 100% bot). No strategy section is contradicted.

## Non-goals

- **Replacing `BackendRouter`.** AMR feeds it. Name resolution, fallback chains (D-B/D11), and the decision bus (D-B/D8) are reused verbatim.
- **A new backend transport.** AMR routes among the existing `BackendDef` types (`claude`/`anthropic`/`openai`/`gemini`/`local`/`pi`/`ssh`/`serverless`).
- **Training or fine-tuning a complexity model.** The v1 classifier is a cheap cascade over static signals + a small LLM tie-break, not a bespoke model.
- **Owning billing.** AMR emits cost/decision telemetry; Shuttle's `ai_config_and_usage` attributes and bills it.
- **Cross-tenant model sharing decisions.** Privacy-class enforcement is a constraint AMR _honors_; the platform inference topology is a Shuttle concern.

## Assumptions

- **Runtime:** Node.js ≥ 18.x; AMR modules are hosted in the orchestrator process (matches monorepo + LMLM baseline).
- **Tenancy:** Phases 1–4 are single-tenant (one `RoutingPolicy` per orchestrator). Multi-tenant policy push-down arrives in Phase 5; a per-tenant orchestrator container (Shuttle model) means Phase 1–4 code needs no tenant-awareness.
- **Token estimability:** `estimateCost` assumes input token counts are derivable pre-dispatch (prompt-size heuristic) and output tokens are bounded by the skill's declared budget. Exact cost is reconciled post-dispatch from backend usage telemetry.
- **Backend metadata coverage:** LMLM pool candidates and cloud backends carry (or default) a `capabilities` block. A backend lacking one is invisible to tier selection and reachable only via identity routing (see Failure modes).
- **Classifier signal availability is lifecycle-dependent** — see S3-001 (surfaced): diff-based signals do not exist at every invocation phase.

## Relationship to shipped routing

| Shipped (do not modify)                                                     | AMR adds                                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BackendRouter.resolve(useCase, opts)` → name + resolutionPath              | An upstream `AdaptiveRouter` that computes the effective `useCase`/`invocationOverride` before delegating to `resolve()`                                     |
| `RoutingConfig` static maps (`default`/`skills`/`modes`/`tier`/`isolation`) | A `policy` block (complexity→tier matrix, skill tier overrides, budget, privacy floor); tier resolution lives in the AMR layer, `RoutingConfig` is untouched |
| Fallback chains, `routing:decision` bus, `harness routing trace`            | `ComplexityVerdict` + `RoutingDecision.complexity`/`tierRequired`/`estCostUsd` fields on the same bus                                                        |
| `RoutingUseCase` identity variants                                          | `complexity` enrichment carried on the use-case, not a new variant                                                                                           |

## Backward compatibility (opt-in, default-off)

AMR never changes what an adopter already does. It is layered so that each rung an adopter has _not_ opted into is inert:

- **No orchestrator?** AMR lives entirely in the orchestrator plus a new `intelligence/complexity` module. Adopters who only use dev-time harness (ESLint rules, `check-deps`, skills in their own agent CLI) never load a line of it.
- **Orchestrator but no `routing.policy`?** `AdaptiveRouter` is never constructed (D11). Dispatch is byte-identical to today's `BackendRouter` — same resolution, same fallback chains, same decision bus, no added latency, no LLM cost.
- **Policy but no `capabilities` on a backend?** That backend is invisible to tier selection and still reachable via identity routing (`routing.skills` / `default`), exactly as before.
- **AMR on but autonomy off?** Autonomy is separately gated and **default steward-gated** (Meridian v1 posture): nothing is auto-merged without an explicit per-tenant `AuthorityScope` opt-in. Turning on routing does not turn on autonomy.
- **Existing `granular-task-routing` / `multi-backend-routing` config?** Untouched. AMR adds exactly one optional `policy` field to `RoutingConfig`; every existing field keeps its meaning. Configs written before AMR validate and behave identically.

The enablement ladder is strictly additive — orchestrator → routing config → `routing.policy` → per-tenant autonomy scope. An adopter stops at whatever rung they choose, and everything below that rung behaves exactly as it did before AMR existed.

## Decisions

| #       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1**  | **Provider-neutral capability tier is the primary axis.** Every backend declares a `capabilities` block: `tier` (`fast`/`standard`/`strong`), `costPer1kTokens`, `privacyClass`, `contextWindow`, `vision`/`toolUse` flags. Routing computes a _required tier_ and picks the min-cost backend with `tier ≥ required` that satisfies hard constraints. Local vs. cloud never appears in the algorithm.                                                                                                                                                                                                                                                                                                                                          | This is the user-requested core: cheaper-model routing must work identically whether the cheap model is local or cloud. Reuses `model-tier-resolver`'s existing `fast`/`standard`/`strong` × `{claude,openai,gemini}` table as the seed. The algorithm branches only on capability tier and cost — never on a backend's local-vs-cloud location, which is merely an attribute feeding the cost and privacy filters (verified black-box by SC3).  |
| **D2**  | **AMR feeds `BackendRouter`; it does not replace it.** `AdaptiveRouter.route(request)` produces a concrete backend name (by expanding a tier token or reading a static override) and calls `BackendRouter.resolve(useCase, { invocationOverride })`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Preserves the shipped fallback-chain + decision-bus machinery; keeps AMR purely additive and independently testable.                                                                                                                                                                                                                                                                                                                             |
| **D3**  | **Complexity is a confidence-rated verdict; authority is derived in TypeScript.** The classifier emits `{ level, confidence, signals }`; a pure function maps `(level, risk, confidence)` → `requiredTier` and → `autonomyEligibility`. The LLM never decides the tier or the merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Mirrors the shipped `outcome-eval`/`acceptance-eval` pattern (TS-derived authority). A low-confidence verdict degrades _up_ a tier and _out_ of autonomy — fail safe.                                                                                                                                                                                                                                                                            |
| **D4**  | **Cheap-first cascade; never pay strong to route.** Classifier order: (a) free static signals — diff size, files/layers touched, `compute_blast_radius`, hotspot/churn, spec-exists, acceptance-measurable; (b) a `fast`-tier LLM tie-break only when static signals are ambiguous; (c) escalate to `standard` only when confidence is low _and_ risk is high.                                                                                                                                                                                                                                                                                                                                                                                 | The router must cost a fraction of what it saves.                                                                                                                                                                                                                                                                                                                                                                                                |
| **D5**  | **Blast-radius veto overrides complexity downgrades.** Any touch of a `sensitivePaths` glob, the `core`/`types` layer, or a public API forces `requiredTier = strong` and `autonomyEligibility = false` regardless of the complexity level.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A "simple-looking" change to security-critical code is exactly the trap; risk trumps apparent simplicity.                                                                                                                                                                                                                                                                                                                                        |
| **D6**  | **Split-routing is per workflow stage, pinned within a coherence unit.** A skill emitting a workflow issues one `route()` per stage (`useCase.kind: 'skill'` + phase). Stages tagged into the same `coherenceUnit` (e.g. one PR's implementation) share a single decision to avoid multi-model style drift.                                                                                                                                                                                                                                                                                                                                                                                                                                    | The Workflow engine already supports per-stage `model`; AMR fills those choices. Coherence pinning prevents incoherent cross-model output within one artifact.                                                                                                                                                                                                                                                                                   |
| **D7**  | **Tenant policy crosses the adapter as an _optional capability interface_, not new base primitives.** AMR reads a `RoutingPolicy` injected at orchestrator start. Shuttle's neutral `RuntimeAdapter` port stays six-primitive; routing rides an **optional `RoutingCapableAdapter`** mixin (`setRoutingPolicy`/`getRoutingTelemetry`) that `HarnessNodeAdapter` implements and the control plane feature-detects (`'setRoutingPolicy' in adapter`). The **interface lives in Shuttle** (`src/services/runtime/` — it is the consumer's port); the shared **types** (`RoutingPolicy`, `ComplexityVerdict`, `BackendCapabilities`) live in **`@harness-engineering/types`** and Shuttle imports them. Routing _decisions_ stay in the substrate. | Adding model-routing to the neutral port would force every future adapter (Cloudflare/K8s) to stub a harness-specific concept. A capability mixin keeps the port neutral. Harness owns policy _semantics_ (the orchestrator interprets it); Shuttle owns per-tenant _setting_ + transport. Dependency flows consumer→substrate (Shuttle already depends on `@harness-engineering/*`), never the reverse.                                         |
| **D8**  | **Budget pressure degrades tier, then pauses — configurable.** Pressure is computed from an injected `budgetState()` seam (current `spentUsd` vs `policy.budget.capUsd`) passed into the pure `deriveRequiredTier`. At or above `policy.budget.degradeAtPct` of `capUsd` (default 90%), `requiredTier` is clamped down one step (`strong`→`standard`); at 100% the `onBudgetExhausted: 'degrade' \| 'pause' \| 'human'` action fires.                                                                                                                                                                                                                                                                                                          | Preserves throughput cheaply under pressure; never silently escalates cost (echoes `local-model-fallback` D2). A concrete threshold (not "near cap") keeps two implementers aligned. Injected snapshot keeps the resolver pure/testable (S1-001).                                                                                                                                                                                                |
| **D11** | **AMR is opt-in and default-off.** The orchestrator constructs `AdaptiveRouter` only when `routing.policy` is present and non-empty. Absent a policy, dispatch calls the shipped `BackendRouter` directly — `AdaptiveRouter` is never instantiated, `classify()` never runs, no complexity/cost telemetry is emitted, and there is zero latency or behavior delta. Adopters who never run the orchestrator (dev-time skills only) never load a line of AMR.                                                                                                                                                                                                                                                                                    | An adopter must keep doing exactly what they do today with **zero action**. Opt-in-by-writing-a-policy makes enablement explicit and discoverable; default-off makes the feature invisible until wanted. Matches the repo's adopter-portability posture (features degrade gracefully, work from a one-line description).                                                                                                                         |
| **D10** | **Vertical escalation: climb tiers on repeated _quality_ failure.** A per-task counter keyed by `(coherenceUnit, tier)` increments on **outcome** failures — a failed gate (`verify` / `outcome-eval NOT_SATISFIED` / blocking review) or repeated structured-output failure — **not** transport errors. On the Nth failure (`escalationThreshold`, default 2) the task's floor tier bumps one step; the next `route()` for that task resolves at `≥ tier+1`, capped at `strong`. An escalated task loses Tier-A autonomy eligibility.                                                                                                                                                                                                         | The cheap-first bet needs a safety valve: when a simple model genuinely can't do the work, climb rather than loop at a tier that can't succeed. Orthogonal to the shipped per-model circuit breaker (horizontal — pick a healthy peer at the same tier); this is vertical. Monotonic + `strong`-capped ⇒ cannot loop or thrash. Escalation is also an autonomy signal (D3): a task that had to climb wasn't as straightforward as triage judged. |
| **D9**  | **AMR emits Meridian-shaped decision events.** Each `RoutingDecision` and `ComplexityVerdict` is broadcast on the existing `routing:decision` bus _and_ shaped into a Meridian protocol event at the adapter boundary for the steward audit trail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Autonomous routing/merges into customer repos are a compliance surface; the protocol event stream is the audit substrate. Model as a Shuttle-specific extension or propose upstream — never ad-hoc.                                                                                                                                                                                                                                              |

## Technical Design

### Type changes (`packages/types/src`)

```ts
// --- Backend capability metadata (D1): additive optional block on every BackendDef ---
export type CapabilityTier = 'fast' | 'standard' | 'strong';
export type PrivacyClass = 'on-device' | 'pooled-isolated' | 'byo-endpoint' | 'shared-cloud';

export interface BackendCapabilities {
  tier: CapabilityTier;
  /** USD per 1k blended tokens; 0 for operator-local. Drives min-cost selection. */
  costPer1kTokens: number;
  privacyClass: PrivacyClass;
  contextWindow: number;
  vision?: boolean;
  toolUse?: boolean;
}
// BackendDef union members gain `capabilities?: BackendCapabilities`.

// --- Complexity verdict (D3), shaped like the eval verdicts ---
export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex';
export interface ComplexityVerdict {
  level: ComplexityLevel;
  confidence: 'high' | 'medium' | 'low';
  signals: Record<string, number | boolean | string>; // blastRadius, filesTouched, layer, ...
  source: 'static' | 'llm-tiebreak' | 'escalated';
}

// --- Routing request: the decision vector fed to AdaptiveRouter ---
export interface RoutingRequest {
  useCase: RoutingUseCase; // existing identity axis (skill/mode/tier/...)
  complexity?: ComplexityVerdict; // from triage; absent → treated as 'moderate'/low-conf
  risk?: { blastRadius: number; sensitivePath: boolean; layer?: string; publicApi?: boolean };
  capabilities?: { needsVision?: boolean; needsToolUse?: boolean; minContextTokens?: number };
  coherenceUnit?: string; // stages sharing this string share one decision (D6)
}

// --- Tier is computed in the AMR layer, NOT added to RoutingValue (S5-002 / D2) ---
// The shipped `RoutingValue` (string | fallback-chain) and `BackendRouter.toArray()`
// are untouched. `AdaptiveRouter` expands a required `CapabilityTier` to a concrete
// backend NAME and passes it as `invocationOverride`, so the router never sees a tier
// token. Tier policy lives entirely in `RoutingPolicy` (`complexityTierMatrix` +
// `skillTierOverrides`, below) — never in `RoutingConfig`.

// --- Policy block (D7/D8), injected per orchestrator (per tenant in SaaS) ---
export interface RoutingPolicy {
  /** (complexity level × risk band) → required tier. Defaults provided; overridable. */
  complexityTierMatrix?: Partial<Record<ComplexityLevel, CapabilityTier>>;
  /** Per-skill/phase required-tier override, evaluated before the matrix. */
  skillTierOverrides?: Record<string, CapabilityTier>;
  privacyFloor?: PrivacyClass; // reject backends weaker than this
  allowedProviders?: BackendDef['type'][]; // tenant allowlist
  budget?: {
    capUsd: number;
    degradeAtPct?: number; // clamp tier down at this % of cap; default 90 (D8)
    onBudgetExhausted: 'degrade' | 'pause' | 'human';
  };
  sensitivePaths?: string[]; // globs → blast-radius veto (D5)
  escalationThreshold?: number; // consecutive quality failures before tier bump; default 2 (D10)
}

// --- Supporting shapes referenced by AdaptiveRouter ---
export type BackendCapabilityRegistry = ReadonlyMap<string, BackendCapabilities>; // backend name → capabilities
export class RoutingError extends Error {
  constructor(
    readonly code: 'privacy-no-match' | 'escalation-exhausted',
    message: string
  ) {
    super(message);
  }
}
// AdaptiveRouter methods beyond route():
//   recordOutcome(coherenceUnit: string, tier: CapabilityTier, ok: boolean): void  // D10 escalation feedback
//   private escalationFloor(coherenceUnit?: string): CapabilityTier                // D10 current floor ('fast' if none)
```

`RoutingConfig` gains one optional field: `policy?: RoutingPolicy`. Everything else on `RoutingConfig` is unchanged, so existing configs keep working byte-for-byte (a config with no `policy` and no `{ tier }` tokens behaves exactly as today).

### The `AdaptiveRouter` (new, `packages/orchestrator/src/agent/adaptive-router.ts`)

```ts
export class AdaptiveRouter {
  constructor(
    private readonly router: BackendRouter, // shipped, unchanged
    private readonly registry: BackendCapabilityRegistry, // capabilities per backend name
    private readonly policy: RoutingPolicy,
    private readonly classify: (req: RoutingRequest) => ComplexityVerdict, // cascade (D4)
    // Injected spend snapshot so deriveRequiredTier stays pure (S1-001). Test seam;
    // wired to the session/tenant cost accumulator in production. Defaults to 0-spend.
    private readonly budgetState: () => { spentUsd: number } = () => ({ spentUsd: 0 })
  ) {}

  route(req: RoutingRequest): { decision: RoutingDecision; def: BackendDef } {
    const complexity = req.complexity ?? this.classify(req);
    const spend = this.budgetState();
    // deriveRequiredTier is pure: complexity/risk set the tier; budget snapshot clamps it
    // down under pressure (D8); the escalation floor (D10) then raises it back if the task
    // has been climbing. requiredTier = max(escalationFloor(taskId), clamp(tier, spend)).
    const requiredTier = deriveRequiredTier(
      complexity,
      req.risk,
      this.policy,
      spend,
      this.escalationFloor(req.coherenceUnit)
    ); // pure (D3/D5/D8/D10)
    // Expand the required tier → cheapest qualifying, constraint-satisfying backend name.
    const target = selectCheapestQualifying(this.registry, requiredTier, {
      privacyFloor: this.policy.privacyFloor,
      allowed: this.policy.allowedProviders,
      needsVision: req.capabilities?.needsVision,
      needsToolUse: req.capabilities?.needsToolUse,
      minContextTokens: req.capabilities?.minContextTokens,
    });
    // Delegate final resolution to the shipped router (fallback chains + decision bus intact).
    // `target` may be undefined when only tier/cost excluded all candidates → fall through to
    // the router's identity/default chain. A privacy/allowlist exclusion throws inside
    // selectCheapestQualifying (fail closed) before reaching here — see Failure modes (S4-001).
    const { decision, def } = this.router.resolveDecisionAndDef(req.useCase, {
      invocationOverride: target?.name,
    });
    // Enrich the emitted decision with complexity/tier/cost for telemetry + audit (D9).
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
}
```

`selectCheapestQualifying` is the heart of D1: filter the registry to backends with `tier ≥ requiredTier`, `privacyClass ≥ floor`, provider in allowlist, capabilities ⊇ required; sort by `costPer1kTokens` asc; return the head. A cloud-only registry yields Haiku/Sonnet/Opus at the three tiers; a mixed registry adds local candidates that simply sort cheaper. **No `if (local)` anywhere.**

### Failure modes

- **Classifier failure/timeout** (LLM tie-break unreachable): fall back to a conservative default `{ level: 'moderate', confidence: 'low' }`, which — per D3 — degrades _up_ a tier and _out_ of autonomy. Never blocks dispatch. Logged as a warning; mirrors `local-model-fallback` D2 (degrade + warn, never silent escalation).
- **Capability-less backend:** invisible to `selectCheapestQualifying`; reachable only through identity routing (`routing.skills`/`default`). No error — it simply cannot win tier selection.
- **No qualifying backend** — behavior depends on _why_ the candidate set is empty (S4-001). A **privacy-floor / allowlist** exclusion **fails closed**: `selectCheapestQualifying` throws `RoutingError('privacy-no-match')` and the item surfaces to the steward — it never falls through to the identity/default chain, which could route a restricted tenant to a non-compliant backend. A **tier/cost-only** exclusion is best-effort: pass no `invocationOverride`, let the shipped router's identity/default chain resolve, and emit a `routing:no-tier-match` warning. Privacy is a hard invariant; tier is best-effort degrade.

### Tier escalation on repeated failure (D10)

AMR holds a per-task `EscalationState`: `Map<coherenceUnit, { floorTier: CapabilityTier; failures: number; escalated: boolean }>`. The executor reports each task outcome via `recordOutcome(coherenceUnit, tier, ok)` — naming mirrors the shipped `LocalModelResolver.recordSuccess/recordFailure`:

- **ok:** clear that task's failure count.
- **fail:** increment; on reaching `escalationThreshold` (default 2), raise `floorTier` one step (`fast`→`standard`→`strong`), reset the count, set `escalated = true`.

`deriveRequiredTier` receives the escalation floor as a parameter and returns `max(floor, clamp(complexityTier, spend))` (matching the `route()` snippet above), so a task that has climbed never drops back to a cheaper tier for its remaining stages. `strong` is the ceiling: if `strong` also crosses the threshold, AMR emits `routing:escalation-exhausted` and the task hard-fails to a human. **Only quality signals feed escalation** — transport/inference errors are handled by the shipped per-model circuit breaker (a healthy peer at the same tier), so the horizontal and vertical mechanisms never double-count one failure. `deriveAutonomyEligibility` reads `escalated`: any task that climbed a tier is disqualified from Tier-A auto-merge (D3/D5/D10 join).

### Complexity cascade (`packages/intelligence/src/complexity/`)

1. **Static pass (free):** pull `filesTouched`, `layer`, `compute_blast_radius`, hotspot/churn, `spec-exists`, `acceptance-eval` measurability. A weighted score maps to a provisional `level` + `confidence`.
2. **LLM tie-break (`fast` tier):** only when static confidence is `low`. One structured call → `{ level, confidence }`.
3. **Escalate (`standard` tier):** only when confidence stays `low` _and_ risk is high.

**Signal availability is phase-dependent (S3-001).** Diff-based signals (`compute_blast_radius`, diff size, hotspot/churn) only exist once there is a diff or target. Pre-diff invocations (brainstorm/plan) fall back to text-only signals (item/description length, spec size, roadmap complexity hints) and cap confidence at `medium`; post-diff invocations (execute/review) use the full static set. The classifier selects the available signal set from the `req.useCase` phase, so a missing diff degrades confidence rather than crashing the static pass.

Emits `ComplexityVerdict`. Reused by both AMR (tier) and autonomy (eligibility) so a task is classified once per invocation.

### Split-routing (D6)

Skills that emit workflows call `AdaptiveRouter.route()` per stage with the stage's `useCase` (`kind: 'skill'`, phase in `cognitiveMode`) and a `coherenceUnit` where stages must agree. `code-review` becomes: mechanical checks → no model; security dimension → `strong`; naming/style → `fast`; adversarial verify → `strong`. The Workflow engine's per-stage `model` field is populated from each decision.

### Tenant integration via the Shuttle `RuntimeAdapter` (D7)

The neutral `RuntimeAdapter` port (six Meridian primitives) is unchanged. Routing rides an optional `RoutingCapableAdapter` mixin defined in Shuttle's `src/services/runtime/`; `HarnessNodeAdapter` implements it, and control-plane callers feature-detect it (`'setRoutingPolicy' in adapter`) so non-routing adapters (Cloudflare/K8s) need no stub.

- **Down:** `RoutingCapableAdapter.setRoutingPolicy(tenantId, RoutingPolicy)`. `HarnessNodeAdapter` PUTs it to the per-tenant orchestrator (`:8080`), which constructs `AdaptiveRouter` with that policy. Shuttle stores it on the existing `tenant-ai-config` and edits it in `settings/ai`. `RoutingPolicy` is imported from `@harness-engineering/types`.
- **Up:** `RoutingCapableAdapter.getRoutingTelemetry(tenantId)` drains the `routing:decision` ring buffer + per-decision `estCostUsd` into Shuttle's `ai_config_and_usage` for attribution/billing and into the steward dashboard.
- **Audit:** decisions surface as Meridian protocol events (D9) for the steward trail.

### Autonomy hook (Meridian Decide step)

`deriveAutonomyEligibility(complexity, risk, gates, policy)` (pure TS) returns a **Tier A–D** verdict feeding Meridian's currently steward-gated **Decide** step. The tiers are a risk × complexity × confidence ladder:

| Tier                             | Condition                                                                                                                                  | Behavior                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **A** — full auto                | `level ≤ simple` · `confidence: high` · blast-radius veto clear · acceptance criteria measurable · all gates green · not `escalated` (D10) | roadmap-pilot → autopilot builds → gates pass → **auto-merge** |
| **B** — auto-build, human merges | `level: moderate`, or Tier-A conditions met but a non-blocking gate warned                                                                 | bot builds + posts `pre-merge-brief`; human clicks merge       |
| **C** — human from planning      | `level: complex`, low confidence, or high blast-radius                                                                                     | escalate to a human at the spec/plan stage                     |
| **D** — refuse/park              | contradicts STRATEGY, unmeasurable acceptance criteria, or needs a product decision                                                        | route to a human; do not attempt                               |

The steward dashboard exposes the scope, the queue, and the per-tenant kill switch. `rollback` + canary are mandatory for Tier A. Every "Tier-A" reference elsewhere in this spec (D3, D5, SC14, SC16) resolves to the row above.

## Integration Points

- **`packages/types/src/orchestrator.ts`** — add `BackendCapabilities`, `ComplexityVerdict`, `RoutingRequest`, `RoutingPolicy`; add `capabilities?` to each `BackendDef`; add optional `complexity`/`tierRequired`/`estCostUsd` to `RoutingDecision`. Barrel regen via `pnpm generate:barrels`. (`RoutingValue` is **not** widened — tier resolution lives in the AMR layer only; S5-002/D2.)
- **`packages/orchestrator/src/agent/adaptive-router.ts`** — NEW; wraps `BackendRouter`.
- **`packages/orchestrator/src/agent/backend-router.ts`** — no behavior change; consumed as-is.
- **`packages/intelligence/src/complexity/`** — NEW cascade classifier.
- **`packages/orchestrator/src/routing/decision-bus.ts`** — payload gains optional fields (back-compatible).
- **CLI:** extend `harness routing trace` to accept a synthetic complexity/risk and print the derived tier + chosen backend + cost estimate (dry-run).
- **Dashboard:** routing panel shows tier-required, complexity level, and cost per decision.
- **Shuttle:** optional `RoutingCapableAdapter` mixin in `src/services/runtime/` (base port unchanged); `HarnessNodeAdapter` implements it; `tenant-ai-config` gains `routingPolicy` (typed by imported `@harness-engineering/types`); `settings/ai` editor; `ai_config_and_usage` fed by telemetry.

## Success Criteria

### Functional

- **SC1** — Two invocations of the same skill with `trivial` vs `complex` verdicts resolve to a `fast`-tier and `strong`-tier backend respectively, with no config change between them.
- **SC2** — A computed required tier of `standard` resolves to the cheapest backend with `tier ≥ standard` satisfying privacy/allowlist/capability constraints; adding a cheaper qualifying backend to the registry changes the choice with no config edit.
- **SC3** — A cloud-only registry (no local backends) still routes trivial→`fast` and complex→`strong` with no config change — demonstrating the axis is cheap-vs-capable, not local-vs-cloud.
- **SC4** — A workflow-emitting skill produces per-stage decisions; stages sharing a `coherenceUnit` share one decision.
- **SC13** — A per-tenant `RoutingPolicy` set via `RoutingCapableAdapter.setRoutingPolicy` changes that tenant's resolution without affecting another tenant's orchestrator (D7).

### Safety / Invariants

- **SC5** — A change touching a `sensitivePaths` glob or `core`/`types`/public API resolves to `strong` and `autonomyEligibility: false` even at `trivial` complexity (D5).
- **SC6** — A `low`-confidence verdict never lowers the tier below the identity-based default and never yields Tier-A autonomy (D3).
- **SC7** — Budget-near-cap clamps tier down one step (or pauses per config); it never silently escalates to a more expensive backend (D8).
- **SC8** — With no `policy` block, routing output is byte-identical to the shipped `BackendRouter` (pure additive).
- **SC14** — An item that is `complex`, high-blast-radius, or low-confidence never receives Tier-A (auto-merge) autonomy eligibility; only `≤ simple` + `high` confidence + clear veto + measurable acceptance + green gates does (D3/D5).
- **SC16** — After `escalationThreshold` consecutive quality failures at tier T on a task, its next resolution is at tier ≥ T+1 (capped at `strong`); escalation is driven only by gate/output failures (never transport errors), and an escalated task is never Tier-A eligible (D10).

### Operability

- **SC9** — Every decision emits complexity + tier + `estCostUsd` on `routing:decision` and is retrievable via `getRoutingTelemetry`.
- **SC10** — `harness routing trace --complexity complex --risk high` prints the derived tier and chosen backend without dispatching.
- **SC15** — Each `RoutingDecision` and `ComplexityVerdict` surfaces as a Meridian-shaped protocol event at the adapter boundary for the steward audit trail (D9).

### Non-regression

- **SC11** — Existing `granular-task-routing` and `multi-backend-routing` test suites pass unchanged.
- **SC12** — LMLM (`local-model-lifecycle-manager`) pool candidates appear in the registry with `privacyClass` and `costPer1kTokens`; no LMLM code changes required.
- **SC17** — With no `routing.policy`, `AdaptiveRouter` is never constructed and `classify()` is never invoked; dispatch latency and emitted telemetry are unchanged from the shipped `BackendRouter` (no new spans or LLM calls) (D11).
- **SC18** — Enabling `routing.policy` does not enable autonomy: no item is auto-merged without an explicit per-tenant `AuthorityScope`; the default posture is steward-gated (a human approves every Meridian Decide).
- **SC19** — A `harness.config.json` authored before AMR (no `policy`, no `capabilities`) validates unchanged and produces byte-identical routing — the strong form of SC8, covering an adopter who never opts in.

## Implementation Order

**Phase 1 — Capability registry + tier tokens (substrate, ~3d).** `BackendCapabilities`, `RoutingValue` tier-token, `selectCheapestQualifying`, registry built from `agent.backends` + LMLM pool. Provider-neutral tier resolution working end-to-end (SC2/SC3). No complexity yet.

**Phase 2 — Complexity cascade (~4d).** Static pass + `fast` tie-break + escalation; `ComplexityVerdict`. Wire `deriveRequiredTier` + blast-radius veto (SC1/SC5/SC6).

**Phase 3 — `AdaptiveRouter` + decision enrichment (~2d).** Wrap `BackendRouter`; the orchestrator constructs `AdaptiveRouter` only when `routing.policy` is present, else dispatches through `BackendRouter` unchanged (D11 default-off gate); enrich telemetry; extend `harness routing trace` (SC8/SC9/SC10/SC17/SC19).

**Phase 4 — Split-routing + escalation (~4d).** Per-stage `route()` from workflow-emitting skills; coherence pinning; populate Workflow per-stage `model` (SC4). Executor `recordOutcome` feedback + vertical `EscalationState` (D10/SC16).

**Phase 5 — Tenant policy via optional adapter capability (Shuttle, ~4d).** `RoutingCapableAdapter` mixin (base port untouched); `HarnessNodeAdapter` HTTP impl + orchestrator policy endpoint; `tenant-ai-config.routingPolicy`; `settings/ai` editor; `ai_config_and_usage` attribution (D7/SC).

**Phase 6 — Autonomy hook + Meridian audit (~4d).** `deriveAutonomyEligibility` Tier A–D (reads D10 `escalated`); graduate Meridian Decide step behind per-tenant `AuthorityScope`; protocol audit events; per-tenant kill switch; `rollback`/canary wiring for Tier A (D9).

**Total:** ~21 working days. Phases 1–4 are substrate-only and independently shippable (deliver provider-neutral + complexity + escalation routing before any SaaS work). Phases 5–6 depend on Shuttle's adapter surface and should land after 1–4 prove out in single-tenant.

## Deferred follow-ups

Phases 1–4 CORE are implemented, unit-tested, and reviewed. The live classifier, the two routing hard-fail-to-human signals, and the unified `RoutingError` family have since landed (see below). The following are knowingly deferred; this section records the honest scope boundary so downstream readers don't over-read what has landed.

- **Phase 4c — live quality-gate fan-in (D10/SC16).** The vertical escalation _mechanism_ is complete and unit-tested: `EscalationState` climbs a coherence unit's floor tier on the Nth consecutive quality failure (monotonic, `strong`-capped, `exhausted`-signalling); `AdaptiveRouter.recordOutcome` / the orchestrator's `recordAmrOutcome` seam feed it; and `onExhausted` now **hard-fails to a human** (queues a `needs-human` `routing:escalation-exhausted` interaction, not just a log). What is still NOT wired is a **live call site that emits `quality-fail`**: no per-`coherenceUnit` QUALITY verdict currently reaches `recordOutcome`. Investigation (2026-07-11) confirmed the orchestrator has **no clean quality signal available today**: worker exit `reason` (`normal`/`error`) is derived purely from whether the agent runner generator completed vs threw (`runAgentInBackgroundTask`), and the `ExecutionOutcome.result` recorded by `CompletionHandler` is derived from that _same_ runner-exit signal — so it is not an independent quality verdict. `PRDetector.branchHasPullRequest` returns only `{ found }` — it carries no PR-review decision, CI conclusion, or merged/blocked verdict back to the orchestrator, and there is no in-orchestrator gate/review/verify runner producing a per-unit pass/fail. A bare normal runner exit is therefore deliberately escalation-_neutral_ (it records nothing). **Wiring this soundly needs new plumbing across the review/CI feedback path** — e.g. a PR-review-decision / CI-conclusion sweep keyed to the coherence unit (issue), or an in-orchestrator quality-gate runner — that maps a _real_ gate/review failure to `recordOutcome(unit, lastRoutedTier, 'quality-fail')` (and a real pass to `'quality-pass'`), keeping transport failures out (breaker's job). It hooks at `emitWorkerExit`'s `outcomeClass` argument (already plumbed through `recordAmrOutcome`), which is why no orchestrator refactor is needed — only the missing upstream verdict source. Forcing the existing runner-exit signal into `recordOutcome` now would be unsound: it would record every clean agent exit as `quality-pass` (masking accumulating failures) and every runner crash as `quality-fail` (double-counting the transport breaker's job). **Net: SC16 is mechanism-satisfied + hard-fail-to-human-satisfied, not yet live-satisfied (no quality-fail emitter).**
- **Phase 4b — split-routing (D6/SC4).** Deferred. There is no per-stage workflow execution engine that reads a per-stage `model` and calls `route()` per stage with coherence pinning. The Workflow `model` field is **schema-only** today (it validates and round-trips but nothing consumes it to drive per-stage backend selection). Split-routing lands once a workflow stage-execution consumer exists.
- **Phases 5–6 — Shuttle (cross-repo).** Tenant policy push-down (`allowedProviders` / `tenant-ai-config.routingPolicy` via the Shuttle adapter capability) and the autonomy hook + Meridian audit trail (`deriveAutonomyEligibility` consuming `EscalationState.isEscalated`, graduated Decide behind per-tenant `AuthorityScope`) are deferred to the Shuttle SaaS work and depend on its adapter surface.

### Landed since the initial Phase 1–4 review

- **Live classifier wiring — DONE** (`becb2e789`). Production AMR now passes the REAL intelligence complexity cascade (`makeLiveClassify`) to `AdaptiveRouter`, reading pre-diff task-text signals gathered at the dispatch call site (`buildTaskText`), replacing the constant `{ moderate, low }` stub. Enabling `routing.policy` yields per-task-difficulty-aware routing (SC1 live), degrading offline/static-only when no provider is available (never blocks dispatch — D4). Diff-based signals stay absent by design (S3-001).
- **`PrivacyNoMatch` steward signal at the dispatch boundary — DONE** (finding #3). A fail-closed `PrivacyNoMatch` from `route()` is now claimed at the dispatch boundary (`handleRoutingFailure`) and emits a distinct `routing:no-tier-match` `needs-human` steward escalation (S4-001) — never lumped into the generic transport bucket and never fed to escalation. Fail-closed is preserved (no dispatch to a non-compliant backend).
- **Unify `RoutingError` — DONE** (finding #4). The orchestrator-local `PrivacyNoMatch` now extends the exported `RoutingError` (carrying `code: 'privacy-no-match'`), and the exhausted path emits `RoutingError('escalation-exhausted')` — one typed error family, no dead exported error type.
