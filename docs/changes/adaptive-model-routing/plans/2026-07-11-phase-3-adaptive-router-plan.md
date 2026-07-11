# Plan: AMR Phase 3 — `AdaptiveRouter` + Decision Enrichment (default-off wiring)

**Date:** 2026-07-11 | **Spec:** `docs/changes/adaptive-model-routing/proposal.md` (Technical Design → "The `AdaptiveRouter`"; "Backward compatibility (opt-in, default-off)"; "Failure modes"; Decisions D2/D7/D9/D11; Success Criteria SC8/SC9/SC10/SC17/SC19; Implementation Order → Phase 3) | **Tasks:** 12 | **Time:** ~50 min | **Integration Tier:** medium

**Branch:** stay on `spec/adaptive-model-routing` (do not switch). Use fixed date string `2026-07-11` where a date is needed; no `Date.now()`.

**Builds on Phases 1 & 2 (DONE, committed):**

- **Phase 1** — `packages/orchestrator/src/agent/capability-registry.ts:54` `selectCheapestQualifying(registry, requiredTier, constraints, providerOf?)` (throws `PrivacyNoMatch` on privacy/allowlist empty — `capability-registry.ts:13`; returns `undefined` on tier/cost-only empty — `capability-registry.ts:110`); `buildCapabilityRegistry(backends, pool?)` at `capability-registry.ts:141`. **Not yet exported from the orchestrator barrel** (`packages/orchestrator/src/index.ts:30` only exports `BackendRouter`).
- **Phase 2** — `@harness-engineering/intelligence` barrel exports `classify` (`packages/intelligence/src/index.ts:147`) and `deriveRequiredTier` (`:151`). Signature: `deriveRequiredTier(complexity, risk, policy, spend, escalationFloor, skillKey?)` — `packages/intelligence/src/complexity/derive-tier.ts:126`. `classify(input: ClassifyInput, provider?, models?)` is `async` and phase-aware — `packages/intelligence/src/complexity/classifier.ts:40`.
- **Shipped router** — `BackendRouter.resolveDecisionAndDef(useCase, { invocationOverride })` at `packages/orchestrator/src/agent/backend-router.ts:208`. Decision bus at `packages/orchestrator/src/routing/decision-bus.ts:36`. **Do not modify either.**
- **Types (Phase 2, shipped)** — `RoutingRequest`, `RoutingRisk`, `RoutingPolicy`, `BudgetSnapshot`, `ComplexityVerdict`, `BackendCapabilityRegistry` all exported from `@harness-engineering/types` (`packages/types/src/orchestrator.ts:364-414`, barrel `packages/types/src/index.ts:159-166`).

---

## Goal

Wire an `AdaptiveRouter` that wraps (never modifies) the shipped `BackendRouter`: classify → `deriveRequiredTier` → `selectCheapestQualifying` → delegate via `resolveDecisionAndDef`, enriching the `RoutingDecision` with `complexity`/`tierRequired`/`estCostUsd` — and gate its construction behind a non-empty `routing.policy` so an adopter with no policy gets byte-identical, zero-added-latency dispatch through the unchanged `BackendRouter`.

## Observable Truths (Acceptance Criteria)

EARS framing where behavioral.

1. **[SC8 / SC19]** _Ubiquitous._ With no `routing.policy` in the config, routing output (backend name, resolution path, `backendType`) is byte-identical to the shipped `BackendRouter` for every use case; a pre-AMR `harness.config.json` (no `policy`, no `capabilities`) validates and routes identically.
2. **[SC17 / D11]** _Unwanted._ If `routing.policy` is absent or empty, then the orchestrator shall not construct `AdaptiveRouter` and `classify()` shall never run — no new spans, no LLM calls, no complexity/cost telemetry. (Asserted via a `classify` spy that must record zero calls, and by the dispatch path pointing at the raw `BackendRouter`.)
3. **[SC9 / D9]** _Event-driven._ When `AdaptiveRouter.route(req)` resolves, the returned `RoutingDecision` carries `complexity` (the verdict), `tierRequired` (the derived `CapabilityTier`), and `estCostUsd` (a number), and those fields ride the same `routing:decision` bus payload (back-compatible optional fields).
4. **[providerOf derivation]** _Ubiquitous._ When `policy.allowedProviders` is set, `AdaptiveRouter` shall pass `selectCheapestQualifying` a `providerOf` derived from `agent.backends` (name → `def.type`); it shall never pass an allowlist without a matching `providerOf`. (Guards the Phase-1 silent-DoS finding at `capability-registry.ts:60-66`.)
5. **[PrivacyNoMatch surfacing / S4-001]** _Unwanted._ If `selectCheapestQualifying` throws `PrivacyNoMatch`, then `AdaptiveRouter.route` shall not fall through to identity routing — it surfaces a steward escalation / `routing:no-tier-match`-style signal and does not call `resolveDecisionAndDef` with a compliant-fallback override.
6. **[tier/cost fall-through]** _Event-driven._ When `selectCheapestQualifying` returns `undefined` (tier/cost-only exclusion), `AdaptiveRouter.route` calls `resolveDecisionAndDef(useCase, {})` with no `invocationOverride`, letting the shipped identity/default chain resolve.
7. **[Phase-4 seam]** `AdaptiveRouter.route` accepts `req.coherenceUnit` and calls `deriveRequiredTier` with an `escalationFloor` argument fixed to `'fast'` (no-op floor) — leaving `EscalationState`/`recordOutcome` for Phase 4.
8. **[SC10]** _Event-driven._ When `harness routing trace --complexity complex --risk high` runs, the CLI prints the derived tier + chosen backend + est cost without dispatching, and the production ring buffer length is unchanged.
9. **[config]** `RoutingConfig` gains one optional `policy?: RoutingPolicy` field; every existing `RoutingConfig` field keeps its meaning and existing routing suites pass unchanged (SC11).
10. **[health]** `harness validate` shows no NEW findings referencing the AMR packages; `harness check-deps` passes; new vitest suites are green.

## Uncertainties

- **[ASSUMPTION]** The classifier's `ClassifyInput` (`signals`, `phase`, `riskHigh`, `prompt`) is buildable inside `AdaptiveRouter` from `RoutingRequest` (map `req.risk` → `riskHigh`; derive `phase` from the use-case kind; text-only signals when no diff). Phase 3 wires a minimal adapter; richer signal-gathering is a classifier concern already shipped in Phase 2. If the mapping needs signals not present on `RoutingRequest`, Task 3's `buildClassifyInput` needs revision.
- **[ASSUMPTION]** `estimateCost(def, req)` does not exist yet (grep found no symbol). Phase 3 introduces a small pure `estimateCost` using `def.capabilities?.costPer1kTokens` and a bounded token heuristic; exact cost reconciliation is out of scope (spec Assumptions → "Token estimability"). If a shared cost util is expected elsewhere, Task 5 placement may move.
- **[DEFERRABLE]** Whether `AdaptiveRouter` is wired into `OrchestratorBackendFactory.forUseCase` dispatch or sits beside it. This plan gates construction in `orchestrator.ts` and exposes the adaptive path via the factory, but the live per-dispatch swap of `route()` for `forUseCase()` is minimal in Phase 3 (enrichment + telemetry only); split-routing per stage is Phase 4.
- **[DEFERRABLE]** Meridian-shaped protocol event emission (SC15/D9 full form) is a Shuttle-adapter concern (Phase 5); Phase 3 only enriches the in-process `routing:decision` payload.

## File Map

- **MODIFY** `packages/types/src/orchestrator.ts` — add `policy?: RoutingPolicy` to `RoutingConfig` (`:591`); add optional `complexity?`/`tierRequired?`/`estCostUsd?` to `RoutingDecision` (`:679`).
- **CREATE** `packages/orchestrator/src/agent/cost-estimator.ts` — pure `estimateCost(def, req)`.
- **CREATE** `packages/orchestrator/src/agent/cost-estimator.test.ts`.
- **CREATE** `packages/orchestrator/src/agent/adaptive-router.ts` — the `AdaptiveRouter` class (wraps `BackendRouter`).
- **CREATE** `packages/orchestrator/src/agent/adaptive-router.test.ts`.
- **MODIFY** `packages/orchestrator/src/index.ts` — export `AdaptiveRouter`, `buildCapabilityRegistry`, `selectCheapestQualifying`, `PrivacyNoMatch` from the barrel.
- **MODIFY** `packages/orchestrator/src/orchestrator.ts` — default-off gate (`:628` factory-construction block): build the `AdaptiveRouter` only when `routing.policy` is present and non-empty.
- **CREATE** `packages/orchestrator/src/agent/adaptive-router.default-off.test.ts` — SC8/SC17/SC19 byte-identical + zero-classify proof.
- **MODIFY** `packages/orchestrator/src/server/routes/v1/routing.ts` — extend `handleTrace` to accept synthetic `complexity`/`risk` and return derived tier + est cost (`:189`).
- **MODIFY** `packages/orchestrator/src/server/routes/v1/routing.test.ts` — trace dry-run assertions (ring-buffer unchanged).
- **MODIFY** `packages/cli/src/commands/routing/trace.ts` — add `--complexity`/`--risk` flags + render tier/cost (`:40`).
- **MODIFY** `packages/cli/src/commands/routing/routing.test.ts` — CLI flag/render assertions.

## Skeleton

_Skeleton produced (task count 12 ≥ 8, standard rigor)._

1. Type deltas — `RoutingConfig.policy` + `RoutingDecision` enrichment fields (~2 tasks, ~8 min)
2. Cost estimator (pure, TDD) (~1 task, ~5 min)
3. `AdaptiveRouter` core: classify → derive → select → delegate → enrich (~3 tasks, ~15 min)
4. Fail-modes wiring: providerOf derivation + PrivacyNoMatch surface + tier/cost fall-through (~2 tasks, ~10 min)
5. Default-off gate in orchestrator + byte-identical proof (~2 tasks, ~10 min)
6. CLI + server `routing trace` dry-run enrichment (SC10) (~2 tasks, ~10 min)

**Estimated total:** 12 tasks, ~50 minutes.

_Skeleton approved: pending human approval (see sign-off request below)._

## Tasks

### Task 1: Add `policy?: RoutingPolicy` to `RoutingConfig`

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`, `packages/types/src/orchestrator.test.ts` (or nearest type suite)

1. In `packages/types/src/orchestrator.ts`, add a type-level test first. If a `orchestrator.test.ts` type suite exists, add an assertion that a `RoutingConfig` with `policy: { budget: { capUsd: 0, onBudgetExhausted: 'degrade' } }` compiles and one with `policy: undefined` compiles. If no such suite exists, create `packages/types/src/routing-config-policy.test-d.ts` using the repo's `tsd`/`expectTypeOf` convention (mirror `ts-testing-types`).
2. Run the type test — observe failure (`policy` not assignable).
3. In `RoutingConfig` (`packages/types/src/orchestrator.ts:591`), after the `modes?` field (`:631`), add:

   ```ts
   /**
    * AMR Phase 3 (D11): opt-in adaptive-routing policy. Its PRESENCE and
    * non-emptiness is the default-off gate — the orchestrator constructs
    * `AdaptiveRouter` only when this is set. Absent ⇒ dispatch is byte-identical
    * to the shipped `BackendRouter` (SC8/SC17/SC19). Every other `RoutingConfig`
    * field keeps its meaning; a config without `policy` validates unchanged.
    */
   policy?: RoutingPolicy;
   ```

4. Run the type test — observe pass.
5. Run: `pnpm --filter @harness-engineering/types build && harness validate`
6. Commit: `feat(types): add optional RoutingConfig.policy (AMR D11 default-off gate)`

### Task 2: Add `complexity`/`tierRequired`/`estCostUsd` enrichment fields to `RoutingDecision`

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`, type suite

1. Add a type-level test asserting a `RoutingDecision` accepts optional `complexity?: ComplexityVerdict`, `tierRequired?: CapabilityTier`, `estCostUsd?: number`, and that omitting all three still compiles (back-compat). Run — observe failure.
2. In `RoutingDecision` (`packages/types/src/orchestrator.ts:679`), after `durationMs` (`:690`), add:

   ```ts
   /** AMR Phase 3 (D9/SC9): the complexity verdict that drove tier selection. Absent for identity-only (non-AMR) dispatch. */
   complexity?: ComplexityVerdict;
   /** AMR Phase 3 (D9/SC9): the derived required CapabilityTier. Absent for identity-only dispatch. */
   tierRequired?: CapabilityTier;
   /** AMR Phase 3 (D9/SC9): estimated USD cost of the resolved backend for this invocation. */
   estCostUsd?: number;
   ```

3. Confirm `ComplexityVerdict` and `CapabilityTier` are already in scope in this file (they are — `:364`, `:87` region). Run type test — observe pass.
4. Run: `pnpm --filter @harness-engineering/types build && harness validate`
5. Commit: `feat(types): enrich RoutingDecision with complexity/tierRequired/estCostUsd (SC9)`

### Task 3: Pure `estimateCost(def, req)` (TDD)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/agent/cost-estimator.ts`, `packages/orchestrator/src/agent/cost-estimator.test.ts`
**Skills:** `test-tdd-workflow` (apply), `ts-performance-patterns` (reference)

1. Create `packages/orchestrator/src/agent/cost-estimator.test.ts` with cases:
   - a `def` whose `capabilities.costPer1kTokens = 0` (on-device) → `estimateCost` returns `0`.
   - a `def` with `costPer1kTokens = 3` and a bounded token estimate → returns a positive number proportional to `costPer1kTokens`.
   - a `def` with NO `capabilities` block → returns `0` (invisible-to-cost, spec Failure modes).
   - deterministic: same `(def, req)` → same number (no `Date.now`, no randomness).
2. Run: `pnpm --filter @harness-engineering/orchestrator test cost-estimator` — observe failure.
3. Create `packages/orchestrator/src/agent/cost-estimator.ts`:

   ```ts
   import type { BackendDef, RoutingRequest } from '@harness-engineering/types';

   /**
    * AMR Phase 3 (spec "Assumptions" → Token estimability): a pre-dispatch
    * USD estimate = (estimated blended tokens / 1000) × costPer1kTokens.
    * Pure and deterministic — input tokens from a prompt-size heuristic,
    * output bounded by a fixed budget until Phase-5 usage reconciliation.
    * A def with no capabilities block estimates 0 (invisible to cost).
    */
   const DEFAULT_EST_TOKENS = 4000; // conservative bounded blended-token estimate (input+output)

   export function estimateCost(def: BackendDef, _req: RoutingRequest): number {
     const rate = def.capabilities?.costPer1kTokens;
     if (rate === undefined || rate === 0) return 0;
     return (DEFAULT_EST_TOKENS / 1000) * rate;
   }
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator test cost-estimator` — observe pass.
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(orchestrator): pure estimateCost for AMR decision enrichment`

### Task 4: `AdaptiveRouter` skeleton + `buildClassifyInput` seam (TDD)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/agent/adaptive-router.ts`, `packages/orchestrator/src/agent/adaptive-router.test.ts`
**Skills:** `gof-chain-of-responsibility` (reference), `ts-type-guards` (reference)

1. Create `packages/orchestrator/src/agent/adaptive-router.test.ts`. First test: constructing `AdaptiveRouter` with a stub `BackendRouter`, a one-entry registry, a minimal `policy`, and a `classify` spy; calling `route({ useCase })` returns `{ decision, def }` and the `decision` carries `complexity`, `tierRequired`, `estCostUsd`. Assert `classify` is called exactly once when `req.complexity` is absent, and zero times when `req.complexity` is provided.
2. Run: `pnpm --filter @harness-engineering/orchestrator test adaptive-router` — observe failure.
3. Create `packages/orchestrator/src/agent/adaptive-router.ts` with constructor + `route()` orchestration (leave provider/fail-mode branches for Tasks 5–7). Use exact injected deps mirroring the spec snippet (`packages/adaptive-router.ts` in proposal → Technical Design):

   ```ts
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
   import { selectCheapestQualifying, PrivacyNoMatch } from './capability-registry.js';
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
   ```

   > Note: `classify` here is the SYNC-adapted seam. Since Phase 2's `classify` is `async`, the orchestrator wires a pre-resolved verdict or a sync wrapper; the classifier's async provider call is done upstream and passed via `req.complexity` in the hot path (Task 8/gate). Keep `classify` typed sync in the router; async orchestration lives at the construction site (Task 8).

4. Run: `pnpm --filter @harness-engineering/orchestrator test adaptive-router` — observe pass.
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(orchestrator): AdaptiveRouter skeleton wrapping BackendRouter (D2)`

### Task 5: Wire `selectCheapestQualifying` into `selectTarget` + enrich constraints (TDD)

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/agent/adaptive-router.ts`, `packages/orchestrator/src/agent/adaptive-router.test.ts`

1. Add tests: with a registry of `{ cheapFast (fast,$0), midStandard (standard,$3), strong ($10) }` and no policy constraints, `route()` on a `trivial` verdict resolves via `invocationOverride: 'cheapFast'`; a `complex` verdict resolves via the strong backend. Assert `req.capabilities` (`needsVision`/`needsToolUse`/`minContextTokens`) are threaded into `selectCheapestQualifying` constraints.
2. Run test — observe failure.
3. Replace `selectTarget` in `adaptive-router.ts`:

   ```ts
   private selectTarget(tier: CapabilityTier, req: RoutingRequest): string | undefined {
     const target = selectCheapestQualifying(
       this.deps.registry,
       tier,
       {
         ...(this.deps.policy.privacyFloor !== undefined ? { privacyFloor: this.deps.policy.privacyFloor } : {}),
         ...(this.deps.policy.allowedProviders !== undefined ? { allowed: this.deps.policy.allowedProviders } : {}),
         ...(req.capabilities?.needsVision !== undefined ? { needsVision: req.capabilities.needsVision } : {}),
         ...(req.capabilities?.needsToolUse !== undefined ? { needsToolUse: req.capabilities.needsToolUse } : {}),
         ...(req.capabilities?.minContextTokens !== undefined ? { minContextTokens: req.capabilities.minContextTokens } : {}),
       },
       this.deps.providerOf
     );
     return target?.name;
   }
   ```

   (Note: `policy.allowedProviders` is not on the Phase-2/3 `RoutingPolicy` type at `packages/types/src/orchestrator.ts:398`. If it is absent from the type, do NOT widen it here — read it via an optional cast ONLY if the spec's Phase-3 scope requires the allowlist path. If absent, the `allowed` branch is dead until Phase 5; keep the `providerOf` derivation task (Task 6) as the guard so enabling the allowlist later is safe. **Flag this to the human at sign-off.**)

4. Run test — observe pass.
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(orchestrator): AdaptiveRouter tier selection via selectCheapestQualifying`

### Task 6: Derive `providerOf` from `agent.backends` (fail-closed DoS guard) (TDD)

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/agent/adaptive-router.ts`, `packages/orchestrator/src/agent/adaptive-router.test.ts`

1. Add a static factory + test. Test: `AdaptiveRouter.fromConfig({ router, backends, pool?, policy, classify })` (a) builds the registry via `buildCapabilityRegistry(backends, pool)`, (b) derives `providerOf = (name) => backends[name]?.type`, and (c) NEVER passes an `allowed` allowlist to `selectCheapestQualifying` without a `providerOf` (assert: if a test policy sets `allowedProviders` but `providerOf` is undefined, the factory still supplies a derived `providerOf`). Reference the Phase-1 finding at `capability-registry.ts:60-66` in the test comment.
2. Run test — observe failure.
3. Add to `adaptive-router.ts`:

   ```ts
   import { buildCapabilityRegistry, selectCheapestQualifying, PrivacyNoMatch } from './capability-registry.js';
   import type { PoolStateProvider } from '@harness-engineering/local-models';

   static fromConfig(args: {
     router: BackendRouter;
     backends: Record<string, BackendDef>;
     pool?: PoolStateProvider;
     policy: RoutingPolicy;
     classify: (req: RoutingRequest) => ComplexityVerdict;
     budgetState?: () => { spentUsd: number };
   }): AdaptiveRouter {
     const registry = buildCapabilityRegistry(args.backends, args.pool);
     // Phase-1 finding (capability-registry.ts:60-66): an allowlist with no
     // providerOf fail-closes EVERY request (silent DoS). ALWAYS derive it.
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
   ```

4. Run test — observe pass.
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(orchestrator): derive providerOf from agent.backends (fail-closed guard)`

### Task 7: Fail-modes — `PrivacyNoMatch` surfaces, tier/cost `undefined` falls through (TDD)

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/agent/adaptive-router.ts`, `packages/orchestrator/src/agent/adaptive-router.test.ts`

1. Add tests:
   - **PrivacyNoMatch (S4-001):** a registry whose only backends fail `policy.privacyFloor` → `selectCheapestQualifying` throws `PrivacyNoMatch`; `route()` must NOT call `router.resolveDecisionAndDef` with a fallback override — instead it re-throws / emits a `routing:no-tier-match`-style steward escalation. Assert `router.resolveDecisionAndDef` was NOT called (spy).
   - **tier/cost fall-through:** a registry where all backends are below the required tier → `selectCheapestQualifying` returns `undefined`; `route()` calls `resolveDecisionAndDef(useCase, {})` with NO `invocationOverride` and returns the identity/default resolution (enriched with complexity/tier/cost).
2. Run tests — observe failure.
3. Update `selectTarget` / `route` to distinguish: wrap the `selectCheapestQualifying` call; on `PrivacyNoMatch` do NOT proceed to identity routing — surface it:

   ```ts
   private selectTarget(tier: CapabilityTier, req: RoutingRequest): string | undefined {
     let target;
     try {
       target = selectCheapestQualifying(this.deps.registry, tier, this.buildConstraints(req), this.deps.providerOf);
     } catch (err) {
       if (err instanceof PrivacyNoMatch) {
         // S4-001: privacy/allowlist exclusion fails closed — never fall through
         // to identity routing at a non-compliant backend. Surface to the steward.
         throw err; // route() re-raises; the dispatch site maps this to a routing:no-tier-match escalation.
       }
       throw err;
     }
     return target?.name; // undefined ⇒ tier/cost-only exclusion ⇒ identity/default fall-through (best-effort)
   }
   ```

   Extract the constraints object into a private `buildConstraints(req)` helper (moved from Task 5). Document that the dispatch-site catch (Task 8) is where the `routing:no-tier-match` signal is emitted.

4. Run tests — observe pass.
5. Run: `harness validate && harness check-deps`
6. Commit: `fix(orchestrator): fail-closed PrivacyNoMatch, best-effort tier fall-through (S4-001)`

### Task 8: Barrel exports for AdaptiveRouter + capability-registry

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/index.ts` | **Category:** integration

1. In `packages/orchestrator/src/index.ts`, after the `BackendRouter` export (`:30-31`), add:

   ```ts
   export { AdaptiveRouter } from './agent/adaptive-router';
   export type { AdaptiveRouterDeps } from './agent/adaptive-router';
   export {
     selectCheapestQualifying,
     buildCapabilityRegistry,
     defaultPoolCapabilities,
     PrivacyNoMatch,
   } from './agent/capability-registry';
   export type { SelectConstraints } from './agent/capability-registry';
   export { estimateCost } from './agent/cost-estimator';
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator build`
3. Run: `harness validate && harness check-deps`
4. Commit: `chore(orchestrator): export AdaptiveRouter + capability-registry from barrel`

### Task 9: Default-off gate in `orchestrator.ts` (D11) (TDD)

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/agent/adaptive-router.default-off.test.ts`

1. Create `packages/orchestrator/src/agent/adaptive-router.default-off.test.ts`. Tests (SC8/SC17/SC19):
   - **no policy → no AdaptiveRouter:** construct an `Orchestrator` with `agent.backends` set but `agent.routing.policy` absent; assert the orchestrator's adaptive-router accessor is `null` (add a test-visible getter `getAdaptiveRouter()` returning `this.adaptiveRouter`), and dispatch resolution is byte-identical to a bare `BackendRouter` over the same config (compare `backendName` + `resolutionPath` + `backendType`).
   - **empty policy `{}` → no AdaptiveRouter:** same assertion (spec D11: "present and non-empty").
   - **classify never runs:** inject a `classify` spy through the construction seam and assert zero calls when no policy.
2. Run test — observe failure.
3. In `orchestrator.ts` at the factory-construction block (`:628`), after `this.backendFactory = new OrchestratorBackendFactory({...})`, add the gate. Introduce a `private adaptiveRouter: AdaptiveRouter | null = null;` field near `backendFactory` (`:198`), and:

   ```ts
   // AMR Phase 3 (D11): construct AdaptiveRouter ONLY when routing.policy is
   // present AND non-empty. Absent/empty ⇒ dispatch stays on the shipped
   // BackendRouter, byte-identical, no classify(), no added latency (SC8/SC17/SC19).
   const policy = routing.policy;
   const policyActive = policy !== undefined && Object.keys(policy).length > 0;
   this.adaptiveRouter = policyActive
     ? AdaptiveRouter.fromConfig({
         router: this.backendFactory.getRouter(),
         backends: this.config.agent.backends,
         ...(this.modelPool ? { pool: this.modelPool } : {}),
         policy,
         // classify seam: an async classifier resolved to a sync verdict-provider.
         // Phase 3 wires a conservative default; richer async triage is invoked
         // upstream and passed via req.complexity. (Spec Failure modes: classifier
         // failure ⇒ { level:'moderate', confidence:'low' } — never blocks dispatch.)
         classify: (_req) => ({
           level: 'moderate',
           confidence: 'low',
           signals: {},
           source: 'static',
         }),
       })
     : null;
   ```

   In the `else` branch (`:663`, no backends), also set `this.adaptiveRouter = null;`. Add the `getAdaptiveRouter()` getter used by the test. Import `AdaptiveRouter` from `./agent/adaptive-router`.

   > Keep this MINIMAL: do NOT swap `forUseCase` dispatch to route through `AdaptiveRouter` in this task — that is the enrichment-on-dispatch step and risks the byte-identical guarantee. The gate only CONSTRUCTS (or does not construct) the router.

4. Run test — observe pass. Also run the full existing routing suites: `pnpm --filter @harness-engineering/orchestrator test routing` — SC11 non-regression must stay green.
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(orchestrator): default-off AdaptiveRouter gate on routing.policy (D11/SC8/SC17/SC19)`

### Task 10: Server `routing/trace` — accept synthetic complexity/risk, return derived tier + cost (TDD)

**Depends on:** Task 9 | **Files:** `packages/orchestrator/src/server/routes/v1/routing.ts`, `packages/orchestrator/src/server/routes/v1/routing.test.ts`
**Skills:** `ts-zod-integration` (reference)

1. In `routing.test.ts`, add: POST `/api/v1/routing/trace` with body `{ useCase, complexity: 'complex', risk: 'high' }` returns `{ decision, def: { type }, tierRequired, estCostUsd }`; the production ring buffer length is unchanged after the call (dry-run — assert via the bus `recent().length`). Also assert a request WITHOUT `complexity`/`risk` still returns the legacy shape (back-compat).
2. Run test — observe failure.
3. In `routing.ts`, extend `TraceBodySchema` (`:171`) with optional `complexity: z.enum(['trivial','simple','moderate','complex']).optional()` and `risk: z.enum(['low','high']).optional()`. In `handleTrace` (`:189`), after the existing dry-run `dryRunRouter.resolveDecisionAndDef(...)` (`:222-229`), when `complexity`/`risk` are present, compute (without dispatch):
   - a synthetic `ComplexityVerdict` from the flag (`{ level, confidence: 'high', signals: {}, source: 'static' }`),
   - a synthetic `RoutingRisk` (`risk === 'high'` → `{ blastRadius: 10, sensitivePath: true }`, else `{ blastRadius: 0, sensitivePath: false }`),
   - `tierRequired = deriveRequiredTier(verdict, risk, deps.routing?.policy ?? {}, { spentUsd: 0 }, 'fast')` (import `deriveRequiredTier` from `@harness-engineering/intelligence`),
   - `estCostUsd = estimateCost(def, { useCase, complexity: verdict, risk })`.
     Return `{ decision, def: { type: def.type }, tierRequired, estCostUsd }`. Keep the bus-less sibling `BackendRouter` (`:222`) so the ring buffer is untouched (dry-run invariant preserved).
4. Run test — observe pass.
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(orchestrator): routing/trace derives tier + cost from synthetic complexity/risk (SC10)`

### Task 11: CLI `harness routing trace --complexity/--risk` (SC10) (TDD)

**Depends on:** Task 10 | **Files:** `packages/cli/src/commands/routing/trace.ts`, `packages/cli/src/commands/routing/routing.test.ts`

1. In `routing.test.ts`, add: invoking the trace command with `--complexity complex --risk high` POSTs `{ useCase, complexity: 'complex', risk: 'high' }` and the human renderer prints `Tier required: <tier>` and `Est cost: $<n>` lines in addition to the backend line; a run without the flags omits those lines.
2. Run test — observe failure.
3. In `trace.ts` (`:40`), add `.option('--complexity <level>', 'Synthetic complexity (trivial|simple|moderate|complex) — dry-run only')` and `.option('--risk <band>', 'Synthetic risk band (low|high) — dry-run only')`. Thread them into the POST body (`:53`): `postJson('/api/v1/routing/trace', { useCase, ...(opts.complexity ? { complexity: opts.complexity } : {}), ...(opts.risk ? { risk: opts.risk } : {}) })`. Extend `TraceResponse` (`:12`) with optional `tierRequired?: string; estCostUsd?: number`. In `renderHuman` (`:27`), after the Backend line, when present print:

   ```ts
   if (r.decision.tierRequired ?? (r as unknown as { tierRequired?: string }).tierRequired) {
     /* prefer top-level tierRequired */
   }
   ```

   Simpler: read `r.tierRequired`/`r.estCostUsd` from the top-level response and print `Tier required: ${r.tierRequired}` and `Est cost: $${r.estCostUsd?.toFixed(4)}` when defined.

4. Run: `pnpm --filter @harness-engineering/cli test routing` — observe pass.
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(cli): routing trace --complexity/--risk prints derived tier + est cost (SC10)`

### Task 12: SC9 decision-enrichment-on-bus proof + reference-docs regen

**Depends on:** Task 11 | **Files:** `packages/orchestrator/src/agent/adaptive-router.test.ts`, `docs/reference/*` (generated) | **Category:** integration

1. Add an SC9 acceptance test in `adaptive-router.test.ts`: subscribe a listener to a real `RoutingDecisionBus`, construct a `BackendRouter` with that bus, wrap it in `AdaptiveRouter`, call `route()`, and assert the emitted decision on the bus carries `complexity`, `tierRequired`, and `estCostUsd`. (The bus emits inside `resolveDecisionAndDef`; enrichment is applied by `AdaptiveRouter` on the returned object — assert BOTH the returned decision AND, per D9, that a subscriber observing the bus can be enriched. If the bus emits pre-enrichment, document that Phase 3 enriches the returned decision and the telemetry drain reads the returned value; note this seam explicitly.)
2. Run: `pnpm --filter @harness-engineering/orchestrator test adaptive-router` — observe pass.
3. Regenerate CLI reference docs for the new trace flags (known pre-push gate): `pnpm run generate-docs`. Stage any updated `docs/reference/*`.
4. Run: `harness validate && harness check-deps`
5. Commit: `test(orchestrator): SC9 decision enrichment on routing:decision bus + docs`

## Concerns / Flags for Human Review

1. **Default-off gate site (cite):** The single wiring site is `packages/orchestrator/src/orchestrator.ts:628` (the `new OrchestratorBackendFactory({...})` block, inside the `if (agent.backends non-empty)` guard at `:605`). The gate reads `routing.policy` from the `routing` local (`:616`) and must set `this.adaptiveRouter = null` in BOTH the no-policy path AND the else branch at `:663`. This is the exact seam where SC8/SC17/SC19 live — Task 9.
2. **`allowedProviders` not on the Phase-3 `RoutingPolicy` type.** `packages/types/src/orchestrator.ts:398` `RoutingPolicy` does NOT declare `allowedProviders` (the spec's Technical Design snippet lists it, but the shipped Phase-2 type defers it — comment at `:396` says tenant push-down arrives in Phase 5). Task 5/6 therefore derive `providerOf` unconditionally (the DoS guard) but the `allowed` allowlist branch is dormant until the type gains the field. **Do not widen the type in Phase 3** unless the human wants the allowlist active now. Flagged in Task 5.
3. **Async classifier vs sync `route()`.** Phase 2's `classify` is `async` (`classifier.ts:40`), but `AdaptiveRouter.route` is sync in the spec snippet. Phase 3 wires a conservative sync default-verdict at the construction site (Task 9) and expects real triage to be resolved upstream and passed via `req.complexity`. If the human wants live async classification inside dispatch, that is a larger change touching `forUseCase` and should be scoped explicitly (likely Phase 4 alongside split-routing).
4. **Barrel export gap.** `capability-registry.ts` (Phase 1) was never exported from the orchestrator barrel (`index.ts:30` only exports `BackendRouter`). Task 8 fixes this; without it the CLI/server trace cannot import `selectCheapestQualifying`/`buildCapabilityRegistry`.
5. **`estimateCost` is new.** No existing cost util was found; Task 3 creates a minimal pure one. If a shared token/cost estimator is expected to live in `@harness-engineering/core` or intelligence, placement should move — flag at sign-off.
6. **Pre-push gates (known repo hazards):** reference-docs freshness (Task 12 runs `generate-docs`), whole-tree `format:check` (untracked `.harness/*` state, `docs/pulse-reports/` may trip it — stash -u if needed), and changeset gate for the publishable `types`/`orchestrator`/`cli` packages. A changeset will be required before push.
