# Plan: Split-Routing Phase 2 — Per-Stage Routing + Cumulative Coherence-Pinning

**Date:** 2026-07-11 | **Spec:** `docs/changes/split-routing/proposal.md` (rev-2) | **Tasks:** 9 | **Time:** ~38 min | **Integration Tier:** medium | **Branch:** `spec/split-routing` (builds on Phase 1 HEAD `97776d30c`)

## Goal

Wire the Phase-1 stage-execution engine to route each stage independently through `AdaptiveRouter.route()` under one shared `coherenceUnit`: a `buildStageRequest` seeds `RoutingRequest.complexity`/`risk` from `step.routingHint` so a `strong`-hinted and a `fast`-hinted stage resolve to different tiers/backends deterministically (SC2), and per-stage `recordOutcome` + the escalation-floor read make the unit floor cumulative so a later stage inherits a raised floor once `EscalationState.threshold` failures accrue (SC3) — all without touching `AdaptiveRouter`/`BackendRouter` internals and without any failure/retry/terminal semantics (Phase 3).

## Scope (Phase 2 only)

**In scope:**

- `buildStageRequest(step, coherenceUnit, priorRuns, floor?)` — pure builder producing a `RoutingRequest`: `useCase = { kind:'skill', skillName: step.skill, cognitiveMode: step.cognitiveMode }`, shared `coherenceUnit`, and — when `step.routingHint` is present — seeded `complexity`/`risk` (deterministic routing, S3).
- Extend `WorkflowEngineContext` with an **optional** `adaptiveRouter?` (narrow surface: `route(req)` → `{ decision, def }`, `recordOutcome(unit, tier, ok)`). Keep the Phase-1 `resolveStageBackend` as the identity fallback.
- Wire the engine so each stage: builds the request, calls `route()` when `adaptiveRouter` is present (else identity fallback), populates `StageRun.decision` (+ `tier`), and runs the **resolved** backend via the existing `runStageSession`.
- Add `decision?`/`tier?` fields to `StageRun` (deferred from Phase 1 Task 2).
- Cumulative coherence-pinning: call `adaptiveRouter.recordOutcome(unit, decision.tierRequired, ok=true)` per stage (Phase 2 treats every stage as `ok=true`), so the `recordOutcome` wiring **and** the floor-read (`escalationFloor` inside `route()`) are both in place — a later stage inherits a raised floor.
- Prove SC2 (deterministic distinct-tier resolution) and SC3 (cumulative floor at the real threshold).

**Out of scope (scope guards — do NOT do):**

- Failure / escalation **retry** + terminal semantics (Phase 3, D8/D10). Phase 2 wires `recordOutcome` but **does not act on failures** — no engine retry, no `nextTier` bump, no `finalizeWorkflowTerminal` on quality fail. The `floor?` parameter of `buildStageRequest` is **plumbed but always `undefined`** in Phase 2 (Phase 3 supplies the bumped floor on the engine retry).
- The `workflowFor` opt-in gate + declarative producer + `dispatchIssue` wiring (Phase 4). The engine is still invoked directly by tests; `dispatchIssue` stays byte-unchanged.
- Do NOT modify `AdaptiveRouter` / `BackendRouter` / `EscalationState` / `deriveRequiredTier` internals (AMR D2 / SC8). Phase 2 only **calls** `route()` / `recordOutcome()`.
- Keep Phase-1 SC1/SC5 guarantees intact — re-run those tests unchanged.

## Observable Truths (Acceptance Criteria)

Phase-2 slice of the spec's SC2/SC3 (+ non-regression of SC1/SC5/SC8):

1. **[SC2-a — deterministic distinct tiers]** Given `routing.policy` set (an `AdaptiveRouter` present) and two stages in one unit whose `routingHint`s seed a `complex` and a `trivial` `ComplexityVerdict` respectively, when the engine routes each stage, then the `complex`-hinted stage's `StageRun.decision.tierRequired` shall be `strong` and the `trivial`-hinted stage's shall be `fast` — resolved **without** invoking the live `classify` seam (proven: a spy `classify` is called 0 times because `req.complexity` is pre-seeded).
2. **[SC2-b — distinct backends]** With backends registered at distinct capability tiers, the two stages of SC2-a shall resolve to **different** `StageRun.decision.backendName`s / `def`s (the `strong`-hinted stage selects the `strong`-tier backend; the `fast`-hinted stage the `fast`-tier backend).
3. **[SC3 — cumulative floor at the real threshold]** Given an `EscalationState(threshold=2)` shared by the unit's `AdaptiveRouter`, when **two** (= threshold) quality failures are recorded for the unit (`recordOutcome(unit, tier, false)` twice), then a **subsequent** stage's `route()` shall resolve at `≥ standard` (the floor climbed `fast→standard` on the **2nd** failure, not the 1st) — proving the floor is cumulative and threshold-driven, and that the engine's per-stage `recordOutcome` feeds the same shared unit floor `route()` reads.
4. **[SC3-wiring]** The engine shall call `ctx.adaptiveRouter.recordOutcome(coherenceUnit, decision.tierRequired, true)` exactly once per stage (Phase 2 `ok=true`), and the tier passed shall be the stage's own resolved `tierRequired` (proven: a `recordOutcome` spy captures `(unit, tier, true)` per stage).
5. **[identity fallback]** When `adaptiveRouter` is **absent**, the engine shall fall back to `ctx.resolveStageBackend(step)` (Phase-1 identity path), populate **no** `StageRun.decision`, and call **no** `recordOutcome` — behaviorally identical to Phase 1 for the no-policy case.
6. **[SC8-slice — non-regression]** `AdaptiveRouter`/`BackendRouter`/`EscalationState`/`deriveRequiredTier` are byte-unchanged; `dispatchIssue` byte-unchanged; the Phase-1 SC1/SC5 tests pass unchanged; `harness validate` reports no NEW findings and `harness check-deps` passes.

## Grounding evidence (real `file:line`)

- **`route()` bypasses live classification when `complexity` is pre-seeded** — `packages/orchestrator/src/agent/adaptive-router.ts:118`: `const complexity = req.complexity ?? (await this.classifySafe(req));`. So seeding `req.complexity` from `routingHint` makes routing deterministic and never calls `classify` (SC2-a). Confirmed by the existing test "does NOT call classify when req.complexity is already provided" — `adaptive-router.test.ts:105-121`.
- **`route()` reads the escalation floor per call** — `adaptive-router.ts:122-123`: `const escalationFloor = this.deps.escalation?.floorFor(req.coherenceUnit) ?? 'fast';` then `deriveRequiredTier(complexity, req.risk, policy, spend, escalationFloor)` at `:124-130`. So a raised floor for a unit lifts a **later** `route()` for the same `coherenceUnit` (SC3). The engine must pass `req.coherenceUnit = plan.coherenceUnit` on every stage.
- **`deriveRequiredTier` maps `complexity.level` → tier via the default matrix** — `packages/intelligence/src/complexity/derive-tier.ts:28-33` (`DEFAULT_MATRIX`: `trivial→fast`, `simple→fast`, `moderate→standard`, `complex→strong`) and `:137-149`. With an empty policy (`{}`), a `complex` verdict derives `strong` and a `trivial` verdict `fast` — deterministic distinct tiers (SC2). The floor raises but never lowers (`Math.max(TIER_RANK[escalationFloor], …)`, `:148`), so a raised floor forces `≥` the raised tier (SC3).
- **`recordOutcome` climbs one tier on the Nth (threshold) consecutive quality failure, not the 1st** — `packages/orchestrator/src/agent/escalation-state.ts:57-90`: `state.failures += 1; if (state.failures < this.threshold) return 'ok';` then on the threshold crossing `state.floorTier = RANK_TIER[currentRank + 1]`. Default `threshold = 2` (`:23`). This is the **real** SC3 semantics — "two failures climb," NOT "one failure climbs" (C3 in the spec). `AdaptiveRouter.recordOutcome` delegates to it — `adaptive-router.ts:173-178`.
- **`AdaptiveRouter.route()` returns `{ decision, def }`; `decision.tierRequired` is the derived tier and `decision.backendName`/`def` the resolved backend** — `adaptive-router.ts:117,131-147`. `RoutingDecision.tierRequired?: CapabilityTier` and `.backendName: string` — `packages/types/src/orchestrator.ts:735,743`. The engine writes both onto `StageRun` (`decision` + `tier`).
- **`RoutingUseCase` skill variant** — `packages/types/src/orchestrator.ts:768`: `{ kind: 'skill'; skillName: string; cognitiveMode?: string }`. `buildStageRequest` constructs exactly this from `step.skill` + `step.cognitiveMode`.
- **`RoutingRequest` shape** — `orchestrator.ts:400-412`: `{ useCase, complexity?, risk?, capabilities?, coherenceUnit?, taskText? }`. `buildStageRequest` sets `useCase`, `coherenceUnit`, and (conditionally) `complexity`/`risk` from the hint. `exactOptionalPropertyTypes` is on → conditional spreads, never explicit `undefined`.
- **`WorkflowStep.routingHint`** — `packages/types/src/workflow.ts:17-23`: `routingHint?: { complexity?: ComplexityVerdict; risk?: RoutingRisk }`. Already present (Phase 1, no runtime consumer). Phase 2 is its first consumer.
- **`StageRun` currently has no `decision`/`tier`** — `packages/types/src/workflow.ts:44-56`. Phase 1 Task 2 explicitly deferred `decision?: RoutingDecision` + `tier?: CapabilityTier` to Phase 2. `RoutingDecision`/`CapabilityTier` are already barrel-exported from types (`packages/types/src/index.ts:154,158`).
- **Phase-1 engine seam to replace** — `packages/orchestrator/src/workflow/execute-workflow.ts:164` (`const backend = ctx.resolveStageBackend(step);`) is the identity stub. Phase 2 wraps this: `adaptiveRouter ? route(buildStageRequest(...)) : resolveStageBackend(step)`. `runStageSession` already takes a `backend: AgentBackend` (`:75-83`) — Phase 2 passes the routed `def` (adapted to the `{ name }` surface `runStageSession` uses for recorder keying).
- **`WorkflowEngineContext`** — `execute-workflow.ts:15-49`: Phase 2 adds an **optional** `adaptiveRouter?` member. The engine must NOT import `orchestrator.ts` (layer cycle) — it depends only on the narrow router surface, matching how Phase 1 kept the context narrow (Phase-1 plan Concern 3).
- **Existing `AdaptiveRouter` construction pattern for tests** — `packages/orchestrator/src/agent/adaptive-router.test.ts:40-53,124-130`: build `backends` at distinct capability tiers → `new BackendRouter({ backends, routing })` → `buildCapabilityRegistry(backends)` → `new AdaptiveRouter({ router, registry, policy, classify, escalation })`. Phase 2 tests reuse this exact recipe (real `AdaptiveRouter`, not a fake) so SC2/SC3 exercise the true routing math.

## Concerns (flag before/while implementing)

1. **[CONCERN — how `routingHint` deterministically forces a tier through `deriveRequiredTier`.]** The forcing is via `route()`'s `req.complexity ?? classifySafe(req)` short-circuit (`adaptive-router.ts:118`): seeding `req.complexity` from `step.routingHint.complexity` means the LLM/live classifier never runs, and `deriveRequiredTier` maps `level` → tier through `DEFAULT_MATRIX` (`derive-tier.ts:28-33`) purely. **Resolution:** `buildStageRequest` copies `routingHint.complexity` into `req.complexity` and `routingHint.risk` into `req.risk`. To make SC2 unambiguous, the fixture uses `complexity.level:'complex'` (→ `strong`) vs `'trivial'` (→ `fast`) with `confidence:'high'` (a `low` confidence would bump the tier UP one step — `derive-tier.ts:89-91` — muddying the assertion), an **empty policy `{}`** (default matrix, no skill override, no budget clamp), and **no `risk`** on the fast stage (a `risk` with `sensitivePath`/`publicApi`/`layer:'core'|'types'` or `blastRadius ≥ 25` triggers the D5 `strong` veto — `derive-tier.ts:46-55` — which would force the fast stage to `strong` too). This is called out so the fixture's hint values are deliberate, not incidental. **[VERIFIED]** against `derive-tier.ts:28-33,46-55,67-97,137-149`.

2. **[CONCERN — is identity-fallback when `adaptiveRouter` is null clean?]** Yes, and Phase 2 keeps it byte-clean. When `ctx.adaptiveRouter` is absent the engine takes the **exact Phase-1 path**: `ctx.resolveStageBackend(step)` → `runStageSession(..., backend, ...)`, with **no** `StageRun.decision`/`tier` written and **no** `recordOutcome` call. The branch is a single `if (ctx.adaptiveRouter)` at the top of the per-stage body; the else-branch is literally the Phase-1 line. **Verification that it is clean:** the Phase-1 SC1/SC5 tests (which supply a `ctx` with **no** `adaptiveRouter`) must pass unchanged (Task 8/9 re-run). If any Phase-1 test needs editing beyond adding an optional-field-absent `ctx`, that is a signal the fallback is NOT clean — stop and reconsider. **[Flag]** `exactOptionalPropertyTypes` forbids writing `run.decision = undefined`; the identity path must **omit** `decision`/`tier` entirely (conditional assignment), mirroring how Phase-1 omits `sessionId` on abort (`execute-workflow.ts:144-145`).

3. **[CONCERN — Phase 2 `ok=true` means the engine never itself raises the floor; SC3 must prove the *wiring*, not an engine-driven climb.]** In Phase 2 every stage passes (`ok=true`), so the engine's own `recordOutcome` calls never cross the failure threshold — the floor never climbs from engine activity alone. That is correct for Phase 2 (real gate/quality evaluation is Phase 3). SC3 therefore proves two separable facts: (a) **the read side** — a raised floor (raised by driving `recordOutcome(unit, tier, false)` the threshold number of times directly against the shared `EscalationState`) lifts a subsequent stage's `route()` for the same `coherenceUnit`; and (b) **the write side** — the engine calls `recordOutcome(unit, decision.tierRequired, true)` per stage against that same shared state (SC3-wiring). Together they establish that once Phase 3 flips some stages to `ok=false`, a later stage inherits the climbed floor. **This is deliberately NOT "one failure climbs"** — the test drives exactly `threshold` (2) failures and asserts the climb happens on the 2nd, matching `escalation-state.ts:73`. **[Flag]** Do not simulate the climb by calling `recordOutcome` once and asserting a climb — that would encode the wrong (C3) semantics the spec explicitly rejects.

4. **[CONCERN — the routed `def` (a `BackendDef`) vs the `AgentBackend` surface `runStageSession` expects.]** `route()` returns `def: BackendDef` (a config shape with `.type`, not a live `AgentBackend`). `runStageSession` only reads `backend.name` for recorder keying (`execute-workflow.ts:96`) and otherwise uses `ctx.makeRunner(backend)` to get the runner. **Resolution for Phase 2:** the engine derives the backend **name** from `decision.backendName` and passes a minimal `{ name: decision.backendName }` (typed via the existing `AgentBackend` surface the context already uses) to `runStageSession`, exactly as the Phase-1 tests build `fakeBackend(name)` (`execute-workflow.test.ts:13-15`). The **real** `AgentBackend` instantiation from a `BackendDef` (the backend factory) is a Phase-4 concern when `dispatchIssue` supplies a real `makeRunner`; Phase 2's `ctx.makeRunner` is still test-injected. Flagged so the reviewer sees the `def`→runner bridge is intentionally deferred to Phase 4 wiring, not smuggled in here.

## File Map

- MODIFY `packages/types/src/workflow.ts` (add `decision?: RoutingDecision` + `tier?: CapabilityTier` to `StageRun`; import the two types)
- MODIFY `packages/orchestrator/src/workflow/execute-workflow.ts` (add optional `adaptiveRouter?` to `WorkflowEngineContext`; add `buildStageRequest`; branch the per-stage body in `executeWorkflow` between `route()` and identity fallback; call `recordOutcome`; write `decision`/`tier` onto the `StageRun`)
- MODIFY `packages/orchestrator/src/workflow/execute-workflow.test.ts` (Phase-2 tests: `buildStageRequest` unit tests, SC2 deterministic-distinct-tier via real `AdaptiveRouter`, SC3 cumulative-floor, SC3-wiring `recordOutcome` spy, identity-fallback; re-assert SC1/SC5 unchanged)

## Skeleton

1. **`StageRun` routing fields** (Task 1, ~4 min) — add `decision?`/`tier?` to the type + shape test.
2. **`buildStageRequest`** (Tasks 2-3, ~10 min) — the pure request builder: `useCase` from the step, shared `coherenceUnit`, seeded `complexity`/`risk` from `routingHint`; `floor?` plumbed (unused Phase 2). Unit-tested for both hinted and unhinted stages.
3. **Engine `adaptiveRouter` surface + `route()` wiring** (Tasks 4-5, ~12 min) — add optional `adaptiveRouter?` to `WorkflowEngineContext`; branch the per-stage body (route vs identity), populate `StageRun.decision`/`tier`, run the resolved backend.
4. **Cumulative coherence-pinning** (Task 6, ~5 min) — call `recordOutcome(unit, tier, true)` per stage; SC3-wiring spy test.
5. **SC2 + SC3 acceptance via real `AdaptiveRouter`/`EscalationState`** (Task 7, ~10 min) — deterministic distinct tiers/backends (SC2) + cumulative floor at threshold (SC3).
6. **Non-regression + validate** (Tasks 8-9, ~6 min) — Phase-1 SC1/SC5 unchanged, identity-fallback clean, SC8 byte-unchanged check, `validate`/`check-deps`.

_Skeleton approved: pending (standard rigor, 9 tasks ≥ 8 → present for approval before expanding to execution)._

## Tasks

### Task 1 (TDD): Add `decision?` + `tier?` to `StageRun`

**Depends on:** none | **Files:** `packages/types/src/workflow.ts`, `packages/types/src/workflow.test.ts`

1. Append a type-level test to `packages/types/src/workflow.test.ts` (create if absent):

   ```ts
   import { describe, it, expect } from 'vitest';
   import type { StageRun, RoutingDecision, CapabilityTier } from '@harness-engineering/types';

   describe('split-routing Phase 2 StageRun routing fields', () => {
     it('StageRun accepts a resolved decision + tier', () => {
       const tier: CapabilityTier = 'strong';
       const decision = { backendName: 'strong-backend', tierRequired: tier } as RoutingDecision;
       const run: StageRun = {
         index: 0,
         step: { skill: 's', produces: 'a' },
         decision,
         tier,
       };
       expect(run.decision?.backendName).toBe('strong-backend');
       expect(run.tier).toBe('strong');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/types exec vitest run src/workflow.test.ts` — observe FAILURE (`decision`/`tier` not on `StageRun`).
3. In `packages/types/src/workflow.ts`, add the import (extend the existing `import type { ComplexityVerdict, RoutingRisk } from './orchestrator';` at `workflow.ts:1`):

   ```ts
   import type {
     ComplexityVerdict,
     RoutingRisk,
     RoutingDecision,
     CapabilityTier,
   } from './orchestrator';
   ```

   Then add to the `StageRun` interface (after `tokens?`, `workflow.ts:51`), matching the spec's `StageRun` shape (proposal.md:91,95):

   ```ts
     /** split-routing Phase 2: the resolved backend + tier + cost for this stage. */
     decision?: RoutingDecision;
     /** split-routing Phase 2: the derived required tier (== decision.tierRequired). */
     tier?: CapabilityTier;
   ```

4. Run: `pnpm --filter @harness-engineering/types exec vitest run src/workflow.test.ts` — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures beyond the pre-existing dashboard-CSS baseline.
6. Commit: `feat(types): add decision + tier to StageRun (split-routing P2)`

### Task 2 (TDD): `buildStageRequest` — useCase + shared coherenceUnit, no hint

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

1. Append a test (add `buildStageRequest` to the existing import from `./execute-workflow`):

   ```ts
   import { buildStageRequest } from './execute-workflow';

   describe('buildStageRequest — request construction (split-routing P2)', () => {
     it('builds a skill useCase + shared coherenceUnit; omits complexity/risk when no routingHint', () => {
       const req = buildStageRequest(
         { skill: 'harness-debugging', produces: 'a', cognitiveMode: 'diagnostic' },
         'issue-1',
         []
       );
       expect(req.useCase).toEqual({
         kind: 'skill',
         skillName: 'harness-debugging',
         cognitiveMode: 'diagnostic',
       });
       expect(req.coherenceUnit).toBe('issue-1');
       // exactOptionalPropertyTypes: absent (not `undefined`) when no hint
       expect('complexity' in req).toBe(false);
       expect('risk' in req).toBe(false);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/execute-workflow.test.ts` — observe FAILURE (`buildStageRequest` undefined).
3. In `packages/orchestrator/src/workflow/execute-workflow.ts`, add `RoutingRequest` to the type import from `@harness-engineering/types`, then add the builder (place it above `runStageSession`):

   ```ts
   /**
    * Build the per-stage RoutingRequest. The useCase is derived from the step
    * (skill + optional cognitiveMode); the shared `coherenceUnit` pins all stages
    * to one escalation floor (D2). When `step.routingHint` is present we seed
    * `complexity`/`risk` so `route()` short-circuits live classification
    * (adaptive-router.ts:118) and the stage resolves DETERMINISTICALLY (S3) — a
    * `complex`-hinted stage → `strong`, a `trivial`-hinted stage → `fast`, without
    * depending on the LLM/text classifier. `floor` is plumbed for Phase 3's engine
    * retry (a bumped required floor); it is always `undefined` in Phase 2 and, when
    * set, is applied by seeding a floor-forcing risk/complexity is NOT done here —
    * Phase 3 threads it into the request. exactOptionalPropertyTypes ⇒ conditional
    * spreads, never explicit `undefined`.
    */
   export function buildStageRequest(
     step: WorkflowExecutionPlan['stages'][number],
     coherenceUnit: string,
     _priorRuns: StageRun[],
     _floor?: CapabilityTier
   ): RoutingRequest {
     const useCase = {
       kind: 'skill' as const,
       skillName: step.skill,
       ...(step.cognitiveMode !== undefined ? { cognitiveMode: step.cognitiveMode } : {}),
     };
     return {
       useCase,
       coherenceUnit,
       ...(step.routingHint?.complexity !== undefined
         ? { complexity: step.routingHint.complexity }
         : {}),
       ...(step.routingHint?.risk !== undefined ? { risk: step.routingHint.risk } : {}),
     };
   }
   ```

   Add `CapabilityTier` and `RoutingRequest` to the `@harness-engineering/types` type import at the top of the file.

4. Run the test — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
6. Commit: `feat(orchestrator): add buildStageRequest for per-stage routing (split-routing P2)`

### Task 3 (TDD): `buildStageRequest` — seeds complexity/risk from routingHint

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.test.ts`

1. Append a test proving the hint seeds `complexity`/`risk` (this is the S3 determinism seam):

   ```ts
   it('seeds complexity+risk from routingHint so routing is deterministic (S3)', () => {
     const complexity = {
       level: 'complex' as const,
       confidence: 'high' as const,
       signals: {},
       source: 'static' as const,
     };
     const risk = { blastRadius: 3, sensitivePath: false };
     const req = buildStageRequest(
       { skill: 'design-review', produces: 'r', routingHint: { complexity, risk } },
       'issue-1',
       []
     );
     expect(req.complexity).toEqual(complexity);
     expect(req.risk).toEqual(risk);
     // useCase has no cognitiveMode when the step omits it
     expect(req.useCase).toEqual({ kind: 'skill', skillName: 'design-review' });
   });
   ```

2. Run the test — observe PASS (the Task-2 implementation already handles the hint). If it FAILS, fix `buildStageRequest`'s conditional spreads.
3. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/execute-workflow.test.ts` — all PASS.
4. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
5. Commit: `test(orchestrator): buildStageRequest seeds complexity/risk from hint (split-routing P2)`

### Task 4 (TDD): Add optional `adaptiveRouter` to `WorkflowEngineContext`

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

1. Append a compile-time-shape test proving the context accepts an optional narrow router surface and that an absent-router ctx still typechecks:

   ```ts
   it('WorkflowEngineContext accepts an optional adaptiveRouter (route + recordOutcome)', () => {
     const withRouter = {
       adaptiveRouter: {
         route: async () => ({ decision: {} as any, def: { name: 'b' } as any }),
         recordOutcome: () => {},
       },
     } as Partial<WorkflowEngineContext>;
     const withoutRouter = {} as Partial<WorkflowEngineContext>;
     expect(withRouter.adaptiveRouter).toBeDefined();
     expect(withoutRouter.adaptiveRouter).toBeUndefined();
   });
   ```

2. Run the test — observe FAILURE (`adaptiveRouter` not on the interface).
3. In `packages/orchestrator/src/workflow/execute-workflow.ts`, add to the `WorkflowEngineContext` interface (after `resolveStageBackend`, `execute-workflow.ts:39`) — a **narrow** surface so the engine never imports `AdaptiveRouter`/`orchestrator.ts` (layer-clean):

   ```ts
     /**
      * split-routing Phase 2: per-stage adaptive router. Present ⇒ each stage is
      * routed via `route(buildStageRequest(...))`; ABSENT ⇒ identity fallback via
      * `resolveStageBackend` (no `routing.policy`). Narrow surface only (route +
      * recordOutcome) so the engine stays off the orchestrator import cycle.
      */
     adaptiveRouter?: {
       route(
         req: RoutingRequest,
       ): Promise<{ decision: RoutingDecision; def: { name: string } }>;
       recordOutcome(coherenceUnit: string, tier: CapabilityTier, ok: boolean): void;
     };
   ```

   Add `RoutingDecision` to the `@harness-engineering/types` type import if not already present. Note: `def` is typed `{ name: string }` — the minimal shape `runStageSession` needs (`backend.name`), so the real `AdaptiveRouter.route()` return (`{ decision, def: BackendDef }`) structurally satisfies it (`BackendDef` has a `name`? — see step-4 note).

4. **Note on `def.name`:** `AdaptiveRouter.route()` returns `def: BackendDef`, and `BackendDef` variants do **not** carry a `name` field (the name is the map key). So the engine must take the backend **name from `decision.backendName`** (`orchestrator.ts:735`), NOT from `def`. Adjust the narrow surface `def` type to `{ type: string }` (or drop `def` from the surface entirely and read only `decision`). Simplest: type the surface return as `Promise<{ decision: RoutingDecision }>` and have the engine build `{ name: decision.backendName }` for `runStageSession`. Update the interface accordingly:

   ```ts
     adaptiveRouter?: {
       route(req: RoutingRequest): Promise<{ decision: RoutingDecision }>;
       recordOutcome(coherenceUnit: string, tier: CapabilityTier, ok: boolean): void;
     };
   ```

   Update the Task-4 test's fake to match (`route: async () => ({ decision: {...} })`).

5. Run the test — observe PASS.
6. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
7. Commit: `feat(orchestrator): add optional adaptiveRouter to WorkflowEngineContext (split-routing P2)`

### Task 5 (TDD): Wire the engine to route each stage (route vs identity fallback), populate `StageRun.decision`/`tier`

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

1. Append a test using a **fake** `adaptiveRouter` whose `route()` returns a `decision` keyed off the stage's `routingHint` (so we can assert the engine wrote `decision`/`tier` onto each `StageRun` and ran the resolved backend). Extend the existing `makeFakeCtx` (or add a `makeRoutedCtx`) so it accepts an optional `adaptiveRouter`:

   ```ts
   it('routes each stage via adaptiveRouter and writes decision+tier onto the StageRun (SC2 wiring)', async () => {
     const routeSpy = vi.fn(async (req: RoutingRequest) => {
       const tier = req.complexity?.level === 'complex' ? 'strong' : 'fast';
       return {
         decision: {
           backendName: `${tier}-backend`,
           tierRequired: tier,
         } as unknown as RoutingDecision,
       };
     });
     const { ctx, successCalls } = makeFakeCtx({
       sessionIds: ['s0', 's1'],
       adaptiveRouter: { route: routeSpy, recordOutcome: vi.fn() },
     });
     const strongStep = {
       skill: 'a',
       produces: 'a',
       routingHint: {
         complexity: { level: 'complex', confidence: 'high', signals: {}, source: 'static' },
       },
     };
     const fastStep = {
       skill: 'b',
       produces: 'b',
       routingHint: {
         complexity: { level: 'trivial', confidence: 'high', signals: {}, source: 'static' },
       },
     };
     await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [strongStep, fastStep] });

     expect(routeSpy).toHaveBeenCalledTimes(2);
     const runs = successCalls[0]!;
     expect(runs.map((r) => r.tier)).toEqual(['strong', 'fast']);
     expect(runs.map((r) => r.decision?.backendName)).toEqual(['strong-backend', 'fast-backend']);
   });
   ```

   Add an identity-fallback assertion in the same or a sibling test: a ctx with **no** `adaptiveRouter` writes **no** `decision`/`tier` and still succeeds (mirrors Phase-1 behavior):

   ```ts
   it('falls back to resolveStageBackend when adaptiveRouter is absent (no decision/tier)', async () => {
     const { ctx, successCalls } = makeFakeCtx({ sessionIds: ['s0', 's1'] });
     await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [step('a'), step('b')] });
     const runs = successCalls[0]!;
     for (const r of runs) {
       expect(r.decision).toBeUndefined();
       expect(r.tier).toBeUndefined();
     }
   });
   ```

   Extend `makeFakeCtx`'s options + returned `ctx` to accept `adaptiveRouter?` and pass it onto the context object.

2. Run — observe FAILURE (engine still uses only `resolveStageBackend`, never populates `decision`/`tier`).
3. In `packages/orchestrator/src/workflow/execute-workflow.ts`, replace the per-stage backend resolution in `executeWorkflow` (`execute-workflow.ts:164`). Currently:

   ```ts
   const backend = ctx.resolveStageBackend(step); // Phase 1 stub: identity single backend
   const run = await runStageSession(
     ctx,
     plan.coherenceUnit,
     index,
     0,
     step,
     backend,
     priorOutputs(runs)
   );
   ```

   Change to route-or-fallback, threading the decision onto the resulting `StageRun`:

   ```ts
   let run: StageRun;
   if (ctx.adaptiveRouter) {
     const req = buildStageRequest(step, plan.coherenceUnit, runs); // Phase 2: floor omitted
     const { decision } = await ctx.adaptiveRouter.route(req);
     const backend = { name: decision.backendName } as AgentBackend; // name-only; real def→runner is Phase 4
     run = await runStageSession(
       ctx,
       plan.coherenceUnit,
       index,
       0,
       step,
       backend,
       priorOutputs(runs)
     );
     run.decision = decision;
     if (decision.tierRequired !== undefined) run.tier = decision.tierRequired;
   } else {
     const backend = ctx.resolveStageBackend(step); // Phase-1 identity fallback (unchanged)
     run = await runStageSession(
       ctx,
       plan.coherenceUnit,
       index,
       0,
       step,
       backend,
       priorOutputs(runs)
     );
   }
   runs.push(run);
   ```

   Keep the whole body inside the Phase-1 `try` so SC5's single-terminal-exit still holds if `route()` throws. `exactOptionalPropertyTypes` ⇒ assign `run.tier` only when `tierRequired` is defined.

4. Run — observe PASS (both the routed and the fallback tests). Confirm the Phase-1 SC1/SC5 tests still pass (they supply no `adaptiveRouter` → the else-branch → unchanged behavior).
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
6. Commit: `feat(orchestrator): route each stage via adaptiveRouter, else identity fallback (split-routing P2)`

### Task 6 (TDD): Cumulative coherence-pinning — call `recordOutcome(unit, tier, true)` per stage

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

1. Append a test asserting the engine calls `recordOutcome(coherenceUnit, decision.tierRequired, true)` exactly once per stage with the stage's own tier (SC3-wiring):

   ```ts
   it('calls adaptiveRouter.recordOutcome(unit, tier, true) once per stage (SC3 wiring)', async () => {
     const recordSpy = vi.fn();
     const routeSpy = vi.fn(async (req: RoutingRequest) => ({
       decision: {
         backendName: 'b',
         tierRequired: req.complexity?.level === 'complex' ? 'strong' : 'fast',
       } as unknown as RoutingDecision,
     }));
     const { ctx } = makeFakeCtx({
       sessionIds: ['s0', 's1'],
       adaptiveRouter: { route: routeSpy, recordOutcome: recordSpy },
     });
     const strong = {
       skill: 'a',
       produces: 'a',
       routingHint: {
         complexity: { level: 'complex', confidence: 'high', signals: {}, source: 'static' },
       },
     };
     const fast = {
       skill: 'b',
       produces: 'b',
       routingHint: {
         complexity: { level: 'trivial', confidence: 'high', signals: {}, source: 'static' },
       },
     };
     await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [strong, fast] });

     expect(recordSpy).toHaveBeenCalledTimes(2);
     expect(recordSpy).toHaveBeenNthCalledWith(1, 'issue-1', 'strong', true);
     expect(recordSpy).toHaveBeenNthCalledWith(2, 'issue-1', 'fast', true);
   });
   ```

   Also assert: when `adaptiveRouter` is **absent**, `recordOutcome` is never called (covered by the identity-fallback test — add `expect(recordSpy).not.toHaveBeenCalled()` there if a spy is wired, else rely on the absent-router path having no router to call).

2. Run — observe FAILURE (engine does not yet call `recordOutcome`).
3. In `executeWorkflow`, inside the `if (ctx.adaptiveRouter)` branch, after `run.tier`/`run.decision` are set and **after** `runStageSession` returns, add the cumulative-floor feed (Phase 2: `ok` is always `true` — real gate/quality eval is Phase 3):

   ```ts
   // D8(b)/SC3: feed the CUMULATIVE unit floor. Phase 2 treats every stage as
   // ok=true (gate/quality evaluation is Phase 3). This wires recordOutcome + the
   // floor-read in route() so a LATER stage inherits a raised floor once Phase 3
   // reports real quality failures. The tier reported is THIS stage's own
   // resolved tier (decision.tierRequired).
   if (run.decision?.tierRequired !== undefined) {
     ctx.adaptiveRouter.recordOutcome(plan.coherenceUnit, run.decision.tierRequired, true);
   }
   ```

4. Run — observe PASS. Re-run the full file to confirm SC2-wiring + fallback tests still pass.
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
6. Commit: `feat(orchestrator): feed cumulative unit floor via recordOutcome per stage (split-routing P2)`

### Task 7 (TDD): SC2 + SC3 acceptance via a REAL `AdaptiveRouter` + `EscalationState`

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.test.ts`

This task proves SC2/SC3 against the **true** routing math (not a fake `route`), mirroring the `adaptive-router.test.ts` construction recipe (`:40-53,124-130`).

1. Append a `describe('split-routing P2 acceptance — real AdaptiveRouter')` block. Arrange helpers at the top of the block:

   ```ts
   import { BackendRouter } from '../agent/backend-router';
   import { buildCapabilityRegistry } from '../agent/capability-registry';
   import { AdaptiveRouter } from '../agent/adaptive-router';
   import { EscalationState } from '../agent/escalation-state';
   import type {
     BackendCapabilities,
     BackendDef,
     ComplexityVerdict,
     RoutingPolicy,
   } from '@harness-engineering/types';

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
     model: 'm',
     capabilities,
   });
   const verdict = (level: ComplexityVerdict['level']): ComplexityVerdict => ({
     level,
     confidence: 'high',
     signals: {},
     source: 'static',
   });
   // distinct backend per tier so SC2-b resolves to DIFFERENT backends
   const backends = {
     'fast-b': localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
     'std-b': localDef(cap({ tier: 'standard', costPer1kTokens: 3 })),
     'strong-b': localDef(cap({ tier: 'strong', costPer1kTokens: 10 })),
   };
   const policy: RoutingPolicy = {}; // default matrix; no budget clamp, no skill override
   function makeAdaptive(escalation?: EscalationState) {
     const router = new BackendRouter({ backends, routing: { default: 'fast-b' } });
     const registry = buildCapabilityRegistry(backends);
     const classify = vi.fn(() => verdict('moderate')); // must NOT be called when hint seeds complexity
     return {
       classify,
       adaptive: new AdaptiveRouter({
         router,
         registry,
         policy,
         classify,
         ...(escalation ? { escalation } : {}),
       }),
     };
   }
   ```

   Wrap the real `AdaptiveRouter` in the narrow ctx surface (`route`/`recordOutcome` delegate straight through).

2. **SC2 test** — deterministic distinct tiers + backends, `classify` never called:

   ```ts
   it('SC2: a strong-hinted and a fast-hinted stage in one unit resolve to different tiers/backends, deterministically', async () => {
     const { adaptive, classify } = makeAdaptive();
     const { ctx, successCalls } = makeFakeCtx({
       sessionIds: ['s0', 's1'],
       adaptiveRouter: {
         route: (req) => adaptive.route(req),
         recordOutcome: (u, t, ok) => adaptive.recordOutcome(u, t, ok),
       },
     });
     const strong = {
       skill: 'a',
       produces: 'a',
       routingHint: { complexity: verdict('complex') },
     };
     const fast = { skill: 'b', produces: 'b', routingHint: { complexity: verdict('trivial') } };
     await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [strong, fast] });

     const runs = successCalls[0]!;
     expect(runs[0]!.tier).toBe('strong');
     expect(runs[1]!.tier).toBe('fast');
     expect(runs[0]!.decision!.backendName).toBe('strong-b');
     expect(runs[1]!.decision!.backendName).toBe('fast-b');
     expect(runs[0]!.decision!.backendName).not.toBe(runs[1]!.decision!.backendName);
     // deterministic: live classification never ran (hint seeded req.complexity)
     expect(classify).not.toHaveBeenCalled();
   });
   ```

3. **SC3 test** — cumulative floor at the REAL threshold (2), not "one failure climbs". Drive exactly `threshold` failures against the shared `EscalationState`, then route a subsequent fast-hinted stage and assert it resolves `≥ standard`:

   ```ts
   it('SC3: after threshold (2) quality failures across stages, a later stage resolves at >= the raised tier (cumulative)', async () => {
     const escalation = new EscalationState(2); // real threshold semantics
     const { adaptive } = makeAdaptive(escalation);

     // Pre-climb: a fast-hinted route BEFORE any failure resolves 'fast'.
     const before = await adaptive.route(
       buildStageRequest(
         { skill: 'x', produces: 'x', routingHint: { complexity: verdict('trivial') } },
         'issue-1',
         []
       )
     );
     expect(before.decision.tierRequired).toBe('fast');

     // Drive exactly threshold (2) quality failures for the unit. The climb
     // (fast->standard) happens on the 2ND failure, not the 1st (escalation-state.ts:73).
     adaptive.recordOutcome('issue-1', 'fast', false); // failures=1, no climb yet
     const mid = await adaptive.route(
       buildStageRequest(
         { skill: 'y', produces: 'y', routingHint: { complexity: verdict('trivial') } },
         'issue-1',
         []
       )
     );
     expect(mid.decision.tierRequired).toBe('fast'); // 1 failure < threshold ⇒ NOT climbed
     adaptive.recordOutcome('issue-1', 'fast', false); // failures=2 == threshold ⇒ floor climbs to 'standard'

     // A SUBSEQUENT fast-hinted stage now inherits the raised floor.
     const after = await adaptive.route(
       buildStageRequest(
         { skill: 'z', produces: 'z', routingHint: { complexity: verdict('trivial') } },
         'issue-1',
         []
       )
     );
     expect(after.decision.tierRequired).toBe('standard'); // >= raised tier, despite a 'trivial' hint

     // The floor is unit-scoped: a DIFFERENT unit is unaffected (still 'fast').
     const otherUnit = await adaptive.route(
       buildStageRequest(
         { skill: 'z', produces: 'z', routingHint: { complexity: verdict('trivial') } },
         'issue-2',
         []
       )
     );
     expect(otherUnit.decision.tierRequired).toBe('fast');
   });
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/execute-workflow.test.ts` — observe all PASS. If SC3 shows a climb after **one** failure, the test (or an accidental `EscalationState` change) is wrong — the real semantics climb on the 2nd; do NOT weaken the assertion.
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
6. Commit: `test(orchestrator): SC2 deterministic distinct tiers + SC3 cumulative floor (split-routing P2)`

### Task 8: Re-assert Phase-1 SC1/SC5 + identity-fallback cleanliness

**Depends on:** Task 7 | **Files:** none (verification)

1. Run the full workflow test file and confirm the **Phase-1** SC1/SC5 tests (3-stage sequential, forced-throw single-terminal, emit-throws, never-writes-issue-session) pass **unchanged** — they supply a ctx with no `adaptiveRouter`, exercising the identity fallback:

   ```
   pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/execute-workflow.test.ts
   ```

   Expect every Phase-1 `it(...)` still green. If any Phase-1 test required a change beyond leaving `adaptiveRouter` absent, STOP — the fallback is not clean (Concern 2); reconsider the branch so the else-path is byte-equivalent to Phase 1.

2. Run the adjacent agent suite to confirm the real-router acceptance tests did not perturb it:
   ```
   pnpm --filter @harness-engineering/orchestrator exec vitest run src/agent src/types src/workflow
   ```
   Expect all PASS.
3. No commit (verification only), unless step 1 required a fallback fix — in which case commit under Task 5's scope message.

### Task 9: SC8 non-regression + full validate/check-deps

**Depends on:** Task 8 | **Files:** none (verification) | **Category:** integration

1. Confirm `AdaptiveRouter`/`BackendRouter`/`EscalationState`/`deriveRequiredTier` are byte-unchanged (AMR D2/SC8 — Phase 2 only CALLS them):

   ```
   git diff --stat 97776d30c -- \
     packages/orchestrator/src/agent/adaptive-router.ts \
     packages/orchestrator/src/agent/backend-router.ts \
     packages/orchestrator/src/agent/escalation-state.ts \
     packages/intelligence/src/complexity/derive-tier.ts
   ```

   Expect **empty output**. If non-empty, revert those files — they are out of scope.

2. Confirm `dispatchIssue`/`orchestrator.ts` unchanged (engine still not wired — Phase 4):

   ```
   git diff --stat 97776d30c -- packages/orchestrator/src/orchestrator.ts
   ```

   Expect **empty output**.

3. Confirm the types + orchestrator packages typecheck and the full suites pass:

   ```
   pnpm --filter @harness-engineering/types exec vitest run
   pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow src/types src/agent
   ```

   Expect all PASS; both packages typecheck clean.

4. Run: `node packages/cli/dist/bin/harness.js validate` (no NEW findings beyond the pre-existing dashboard-CSS design-token baseline) and `node packages/cli/dist/bin/harness.js check-deps` (expect `validation passed`).
5. Commit (only if step 1-2 required a revert): `chore(split-routing): confirm SC8 non-regression for Phase 2`

## Sequencing / Dependencies

Strict chain: Task 1 (StageRun type) → 2 → 3 (`buildStageRequest`) → 4 (ctx `adaptiveRouter` surface) → 5 (engine route/fallback wiring) → 6 (`recordOutcome` feed) → 7 (SC2/SC3 acceptance) → 8 (Phase-1 re-assert) → 9 (non-regression). Tasks 2-9 all touch `execute-workflow.ts`/`.test.ts`, so they cannot parallelize (file overlap). Task 1 is types-only and could interleave but the `StageRun.decision`/`tier` fields are consumed from Task 5 onward, so it stays first. Total ~38 min.

## Uncertainties

- **[ASSUMPTION]** The narrow `adaptiveRouter` context surface (`route`/`recordOutcome`) is sufficient for Phase 2's tests and for the Phase-4 orchestrator to satisfy by wrapping its real `AdaptiveRouter`. If Phase 4 finds it needs more of the router surface, that is a Phase-4 refinement, not a Phase-2 defect — the engine's routing/pinning logic is independent of who supplies `ctx.adaptiveRouter`.
- **[ASSUMPTION]** `def` is intentionally dropped from the narrow surface return (`route` returns `{ decision }` only); the engine derives the backend **name** from `decision.backendName` because `BackendDef` carries no `name` field (Concern 4). If a later phase needs the full `def` (e.g. for cost/capabilities on the `StageRun`), widen the surface then — Phase 2 needs only the name for recorder keying.
- **[DEFERRABLE]** The `floor?` parameter of `buildStageRequest` is plumbed but always `undefined` in Phase 2. Phase 3 supplies the bumped required floor on the engine retry (D8a) and threads it into the request. Phase 2 does not exercise it.
- **[DEFERRABLE — reported concern]** Real `BackendDef → AgentBackend` (backend factory) instantiation and real per-stage prompt rendering are Phase 4 (`dispatchIssue` supplies a real `makeRunner`). Phase 2's `ctx.makeRunner` is still test-injected; the routed backend is passed as a name-only `{ name }` shape (Concern 4).

## Harness Integration

- `harness validate` runs in every code task; `harness check-deps` in Task 9. Repo `validate` reports ~409 pre-existing dashboard-CSS design-token warnings (baseline noise, unrelated to types/orchestrator) — tasks assert "no NEW findings," not zero.
- CLI invoked as `node packages/cli/dist/bin/harness.js …` (the PATH `harness` is the global npm install, not this repo's source — per repo memory).
- No barrel change this phase: `RoutingDecision`/`CapabilityTier` are already exported from `packages/types/src/index.ts` (`:154,158`); `WorkflowExecutionPlan`/`StageRun` were barrel-exported in Phase 1.
- Plan committed at planning time (Phase 4 step 8 of harness-planning), on `spec/split-routing`.
