# Plan: Split-Routing Phase 3 — Separated Failure Mechanisms + Terminal Semantics

**Date:** 2026-07-11 | **Spec:** `docs/changes/split-routing/proposal.md` (rev-2), Phase 3 | **Tasks:** 14 | **Time:** ~52 min | **Integration Tier:** medium
**Branch:** `spec/split-routing` | **Builds on:** HEAD `85008f773` (Phase 1+2) | **Session:** `changes--split-routing--proposal`

## Goal

Make workflow-stage failures real: a `pass-required` stage derives pass/fail from the runner's `TurnResult.success`, is retried exactly once by the engine at an engine-computed bumped tier, feeds the cumulative unit floor, and — if the retry also fails or a stage errors/times out — the unit terminally fails to a human via `finalizeWorkflowTerminal` (+`cleanWorkspace`), all while preserving the D6/SC5 single-exit invariant and leaving `AdaptiveRouter`/`BackendRouter`/`escalation-state`/`derive-tier` byte-unchanged.

## Observable Truths (Acceptance Criteria)

Each maps to spec SCs; EARS framing where behavioral.

1. **[SC6-a]** _When_ a `pass-required` stage's `runStageSession` returns `passed:false`, _the engine shall_ retry it exactly once (`attempt` 0→1) at a floor `= nextTier(attempt-0 decision.tierRequired)`, and _if_ the retry also returns `passed:false`, _the engine shall_ mark the `StageRun.outcome = 'fail'` and stop the loop (no 3rd attempt).
2. **[SC6-a]** _When_ a stage terminally fails (`outcome:'fail'`), _the engine shall_ call `finalizeWorkflowTerminal(unit, runs, failingStep)` **exactly once**, which runs running/claimed delete + `persistLaneSafe('abandon')` + one `needs-human` escalation + `cleanWorkspace`.
3. **[SC6-a]** _While_ a `pass-required` stage is retried, _the engine shall_ call `recordOutcome(unit, tier, false)` once per quality failure (independent of the engine's own retry decision) so the cumulative unit floor climbs per `EscalationState.threshold`.
4. **[SC6-c]** _If_ a stage's `gate` is `advisory` (or absent), _the engine shall not_ fail the unit regardless of `passed`; the stage's `StageRun.outcome = 'pass'` and the loop continues.
5. **[SC6-b / D10]** _If_ a runner throws mid-stage (transport/runner error), _the engine shall_ set `StageRun.outcome = 'error'` and go terminal via `finalizeWorkflowTerminal` **without** re-entering `enqueueRetry` / re-running from stage 0 / calling `ensureWorkspace` (prior-stage artifacts on the shared worktree are not wiped).
6. **[SC7 / D12]** _When_ a stage exceeds its configurable per-stage wall-clock deadline, _the engine shall_ treat it as a stage failure (→ truth 1's D8 retry path), not an unbounded hang; the aborted generator's `finally { stopSession }` runs.
7. **[carry-forward a]** _When_ the engine aborts/deadlines a stage, _the engine shall_ call `gen.return()` on the runner generator so `runner.ts:108-110`'s `finally { await stopSession }` runs (no session leak).
8. **[carry-forward b]** `stageAttemptKey` asserts `attempt < 1000` (collision-freedom invariant); a call with `attempt >= 1000` throws.
9. **[SC1/SC5]** The single-exit invariant holds with the new terminal paths: for every exit (all-pass, stage `fail`, stage `error`, deadline, or a throw in the loop) there is **exactly one** terminal transition and no orphaned `running`/`claimed`.
10. **[SC8]** `AdaptiveRouter`, `BackendRouter`, `escalation-state.ts`, `derive-tier.ts` are byte-unchanged; `orchestrator.ts` is unchanged in Phase 3 (the engine context is still test-injected — real wiring is Phase 4).

## File Map

- **MODIFY** `packages/orchestrator/src/workflow/execute-workflow.ts` — add gate eval, `runStageWithRetry`, `nextTier`, deadline wrapper, `gen.return()` cleanup, terminal branches; widen the `makeRunner().runSession` return + `WorkflowEngineContext` (add `nextTier`? no — local; add `stageDeadlineMs`).
- **MODIFY** `packages/orchestrator/src/workflow/execute-workflow.test.ts` — SC6/SC7 tests + carry-forward tests; adapt the Phase-1/2 fake runner to return `passed`.
- **MODIFY** `packages/types/src/workflow.ts` — `WorkflowStep` already has `gate`; no change expected. (Confirm; only touch if a field is missing.)
- **CREATE** `docs/knowledge/decisions/NNNN-mid-workflow-error-is-terminal.md` — ADR for D10 (integration task).
- **CREATE** `docs/knowledge/decisions/NNNN-separated-failure-mechanisms.md` — ADR for D8 (integration task).

**NOT touched (scope guards):** `adaptive-router.ts`, `backend-router.ts`, `escalation-state.ts`, `derive-tier.ts`, `orchestrator.ts`, `dispatchIssue`, `workflowFor`, the producer.

## Skeleton (thorough-equivalent; task count 14 ≥ 8 → skeleton required)

1. **Gate-eval seam** — widen the runner-return surface to carry `passed`; derive `StageRun.outcome` from `gate` + `passed` (~3 tasks, ~11 min)
2. **`nextTier` + engine retry (D8a)** — pure helper on `TIER_RANK`/`RANK_TIER`; `runStageWithRetry` with cap=1 at the bumped floor (~3 tasks, ~13 min)
3. **Floor feed separation (D8b) + terminal trigger (D8c)** — `recordOutcome(...,false)` per failure independent of retry; `fail`→terminal exactly once (~2 tasks, ~8 min)
4. **D10 mid-workflow error = terminal** — catch stage throw → `outcome:'error'` → terminal, no worktree wipe (~1 task, ~4 min)
5. **D12 per-stage deadline + carry-forward cleanup** — deadline wrapper; `gen.return()` on abort/timeout; `stageAttemptKey` assert (~3 tasks, ~11 min)
6. **`finalizeWorkflowTerminal` semantics + integration/ADRs** — assert `cleanWorkspace` in the terminal contract; ADRs (~2 tasks, ~5 min)

**Estimated total:** 14 tasks, ~52 min.
_Skeleton approved: PENDING — see sign-off request at end._

## Uncertainties

- **[BLOCKING — needs decision] D8(a) floor plumbing seam.** The spec says the engine passes the bumped tier "as the stage's required floor into `buildStageRequest`/`route()`". But `route()` derives its floor **solely** from `escalation.floorFor(coherenceUnit)` (`adaptive-router.ts:122-123`) and `RoutingRequest` has **no `floor` field** (`orchestrator.ts:400-412`). `deriveRequiredTier(complexity, risk, policy, spend, escalationFloor)` takes the floor as a hard `max` (`derive-tier.ts:148`). So there is no compose-only seam to inject a **one-shot, retry-scoped** engine floor without either:
  - **(A)** adding an optional `floor?: CapabilityTier` to `RoutingRequest` (types) + one `Math.max(req.floor, escalationFloor)` line in `route()` — this **edits AMR `route()`**, which the scope guard restricts ("only CALL them"). It is a ~2-line additive change, not an internals rewrite, and is arguably the cleanest.
  - **(B)** compose-only: the engine, on retry, resolves the tier itself (`nextTier(attempt0.decision.tierRequired)`) and **selects the backend for that tier without going through `route()`** for the bump — e.g. call `route()` for the decision, then if the returned `tierRequired < bumpedFloor`, the engine overrides `StageRun.tier`/backend selection using a narrow tier→backend resolver it already has. This keeps `route()` untouched but means the retry's backend is engine-chosen, not router-chosen — a semantic divergence from "route at a bumped floor."
  - **(C)** feed the bump through `EscalationState`: call `recordOutcome` enough to climb — **explicitly forbidden by D8** ("does NOT rely on `recordOutcome`'s threshold climb"; threshold=2 won't climb on one failure).

  **Recommendation:** **(A)** — a minimal additive `floor?` on `RoutingRequest` + a single `Math.max` in `route()`. It is the seam the spec's pseudocode assumes (`buildStageRequest(step, unit, prior, floor)` already threads a `_floor` param, execute-workflow.ts:95), it keeps the retry router-driven (SC-faithful), and "byte-unchanged" in SC8 names `AdaptiveRouter`/`BackendRouter` **classes' routing logic** — an additive optional-field honor is not a logic change to tier derivation. **This needs your explicit sign-off** because it technically touches `route()`. If you reject (A), I default to (B) and document the engine-chosen-backend divergence.

- **[ASSUMPTION] Gate-eval source.** v1 derives `passed` from the runner's own `TurnResult.success` (spec §Phase-3 scope item 1 confirms: "v1 uses the runner's own success"). Richer gate eval (running verify/review on the artifact) is a follow-up. The current `WorkflowEngineContext.makeRunner().runSession` return (`{sessionId, usage}`, execute-workflow.ts:29-39) **drops `success`** — Phase 3 must widen it to `{sessionId, usage, success}` to expose the signal. If this widening is wrong (e.g. `success` should come from a separate gate call), Task 1 needs redesign.

- **[ASSUMPTION] `finalizeWorkflowTerminal` reuse.** It is **already a context method** on `WorkflowEngineContext` (execute-workflow.ts:60-65) — Phase 3 only defines its **contract** (running/claimed delete + `persistLaneSafe('abandon')` + `needs-human` + `cleanWorkspace`) via tests against the injected fake; the real orchestrator implementation is Phase 4. It **cannot** call `finalizeRoutingTerminal` directly (that is a private orchestrator method, `orchestrator.ts:2388`, and lacks `cleanWorkspace` + `needs-human`; `escalateRoutingToHuman` is the needs-human piece). So it is a **workflow-specific variant that reuses the pattern** (delete+abandon), not a direct reuse. Phase 3 asserts the contract on the fake; Phase 4 wires the real composition. This resolves the task's flagged question.

- **[DEFERRABLE] Deadline default value.** `stageDeadlineMs` default (proposal says "configurable"). Seed `120_000` (mirrors `maintenance.ts:80` / runner request timeout) as the engine default; per-stage/config override is Phase 4 (`WorkflowConfig`). Not blocking decomposition.

- **[DEFERRABLE] Stall-detection bypass (D12).** "Issue-grain stall detection (`state-machine.ts:736`) is bypassed for workflow units." This is an **orchestrator-side** concern (the running-entry liveness check) — it belongs to Phase 4 wiring (`dispatchIssue`/reconciliation), not the engine module. Phase 3 owns per-stage liveness **inside** the engine (the deadline). Note it in handoff for Phase 4; do not implement here (would touch `state-machine.ts`, out of scope).

---

## Tasks

### Task 1: Widen the runner-return surface to carry `success` (gate-eval seam)

**Depends on:** none | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

The real `AgentRunner.runSession` returns `TurnResult` (`runner.ts:51,112`) which carries `success: boolean` (`types/src/orchestrator.ts:165-167`). The Phase-1 engine context surface dropped it (`execute-workflow.ts:29-39`). Add `success: boolean` to the `makeRunner().runSession` generator return type so the engine can read the quality signal.

1. In `execute-workflow.ts`, update the `WorkflowEngineContext.makeRunner` return generator's return-value type (currently `{ sessionId; usage }`) to add `success: boolean`:
   ```ts
   ) => AsyncGenerator<
     AgentEvent,
     {
       sessionId: string;
       success: boolean; // Phase 3: the runner's TurnResult.success — quality signal for gate eval
       usage: { inputTokens: number; outputTokens: number; totalTokens: number };
     },
     void
   >;
   ```
2. In `execute-workflow.test.ts`, update the `makeFakeCtx` `runSession` return (`line ~103`) to include `success`: add an opt `successPerStage?: boolean[]` (default `true`) and return `{ sessionId: ..., success: opts.successPerStage?.[index] ?? true, usage }`. Update the local `ret` type annotations in `runStageSession` accordingly.
3. Run: `pnpm --filter @harness-engineering/orchestrator test -- execute-workflow` — observe existing tests still pass (default `success:true` keeps Phase-1/2 green).
4. Run: `node packages/cli/dist/bin/harness.js validate` (expect baseline 409, zero new).
5. Commit: `feat(orchestrator): expose runner success on workflow stage-runner surface`

### Task 2 (TDD): Derive `StageRun.outcome` from `gate` + `passed`

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

`runStageSession` hardcodes `outcome:'pass'` (execute-workflow.ts:188). Make it derive from the gate: `pass-required` + `!success` → `'fail'`; `advisory`/absent → always `'pass'`.

1. In `execute-workflow.test.ts`, add a `describe('runStageSession — gate eval (SC6-c / P3)')` with:
   - a `pass-required` step + fake `success:false` → `run.outcome === 'fail'`
   - a `pass-required` step + `success:true` → `run.outcome === 'pass'`
   - an `advisory` step + `success:false` → `run.outcome === 'pass'` (advisory never fails)
   - a step with **no** `gate` + `success:false` → `run.outcome === 'pass'` (default is advisory-like: only `pass-required` gates)
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- execute-workflow` — observe the new tests FAIL (still hardcoded `pass`).
3. In `runStageSession`, capture `success` from the generator return (`ret?.success`), then replace the hardcoded outcome:
   ```ts
   const passed = ret?.success ?? false;
   const outcome: StageRun['outcome'] = step.gate === 'pass-required' && !passed ? 'fail' : 'pass';
   ```
   Assign `outcome` into the `run` object (replace `outcome: 'pass'`). Keep the aborted-run path (`ret` unset) yielding `passed=false` → a `pass-required` stage with no return is a `'fail'` (this is the deadline path, Task 11).
4. Run the same test command — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): derive stage outcome from gate + runner success`

### Task 3 (TDD): `executeWorkflow` acts on a stage `fail`/`error` → terminal

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

The Phase-1/2 loop has a comment placeholder (`execute-workflow.ts:257-258`) where a non-pass outcome should terminate. Wire it: after `runs.push(run)`, if `run.outcome !== 'pass'`, call `finalizeWorkflowTerminal(unit, runs, step)` and `return` (D8c/D10). (Retry lives in Task 6 — here a single failing stage goes straight terminal so the branch exists and is tested; Task 6 inserts the retry before this becomes terminal.)

1. In `execute-workflow.test.ts`, add `describe('executeWorkflow — terminal on stage fail (SC6 / P3)')`:
   - a 2-stage plan, stage 0 `pass-required` with fake `success:false` → `terminalCalls` length 1, `successCalls` length 0, `runOrder` is `[0]` (stage 1 never runs), and the `failingStep` passed to `finalizeWorkflowTerminal` is stage 0's step.
   - Extend the fake `finalizeWorkflowTerminal` capture to record `failingStep` (add a `terminalFailingSteps` array).
2. Run test — observe FAIL (loop currently never terminates on outcome).
3. In `executeWorkflow`, after `runs.push(run);` replace the placeholder comment with:
   ```ts
   if (run.outcome !== 'pass') {
     return await ctx.finalizeWorkflowTerminal(plan.coherenceUnit, runs, step);
   }
   ```
4. Run test — observe PASS. Also re-run the full `execute-workflow` suite — SC1/SC5/SC2/SC3 still green (all their stages are `success:true`/no `pass-required` gate → `pass`).
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): terminate workflow on non-pass stage outcome`

### Task 4 (TDD): `nextTier` pure helper

**Depends on:** none | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

Add a pure `nextTier(t: CapabilityTier): CapabilityTier` that bumps one step and clamps at `strong`, built on `TIER_RANK`/`RANK_TIER` **imported from `@harness-engineering/intelligence`** (already used by `escalation-state.ts:6`). Do NOT re-implement the tables (SC8: derive-tier byte-unchanged).

1. In `execute-workflow.test.ts`, add `describe('nextTier (D8a / P3)')`: `nextTier('fast') === 'standard'`, `nextTier('standard') === 'strong'`, `nextTier('strong') === 'strong'` (clamp).
2. Run test — observe FAIL (no export).
3. In `execute-workflow.ts`, add the import `import { TIER_RANK, RANK_TIER } from '@harness-engineering/intelligence';` and:
   ```ts
   /** D8(a): bump one capability tier, clamped at `strong`. Pure; reuses the
    *  guarded TIER_RANK/RANK_TIER tables (never re-implements them — SC8). */
   export function nextTier(t: CapabilityTier): CapabilityTier {
     const next = Math.min(TIER_RANK[t] + 1, TIER_RANK.strong);
     return RANK_TIER[next]!;
   }
   ```
4. Run: `node packages/cli/dist/bin/harness.js check-deps` — confirm the orchestrator→intelligence import is allowed (it already is; escalation-state uses it). Then run the test — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): add nextTier tier-bump helper for engine retry`

### Task 5 [checkpoint:decision]: Resolve the D8(a) floor-plumbing seam

**Depends on:** Task 4 | **Files:** (decision only — no code)

**This is the BLOCKING uncertainty.** Before writing `runStageWithRetry` (Task 6), confirm how the engine's one-shot bumped floor reaches the router. See the Uncertainties section: option (A) add `RoutingRequest.floor?` + one `Math.max` in `route()`; option (B) compose-only engine-chosen backend on retry; (C) is forbidden by D8.

**Recommendation: (A).** Pause and present options (A)/(B) to the human. On decision:

- **If (A):** Task 6 threads `floor` into `buildStageRequest` (the `_floor` param already exists, execute-workflow.ts:95) → sub-task 6a adds `floor?: CapabilityTier` to `RoutingRequest` (types) and a `Math.max(TIER_RANK[req.floor], ...)` into `route()`'s `escalationFloor` line. This is the ONLY task that touches `route()`; it must be a **separate atomic commit** so SC8's byte-unchanged scope is auditable.
- **If (B):** Task 6 keeps `route()` untouched; on retry the engine computes `bumped = nextTier(prior.tier)` and, if `decision.tierRequired`'s rank `< bumped`'s rank, overrides `run.tier = bumped` and selects the backend via the existing name-only surface (documented divergence: retry backend is engine-chosen).

Record the choice in `state.json` decisions and the handoff. Do not proceed to Task 6 until decided.

### Task 6 (TDD): `runStageWithRetry` — engine retry cap = 1 at the bumped floor (D8a)

**Depends on:** Task 5, Task 3 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

Extract the per-stage routing+run into `runStageWithRetry(ctx, unit, step, index, prior)` that loops `attempt 0..1`: attempt 0 routes normally; on a `pass-required` failure it retries **once** at `floor = nextTier(attempt-0 decision.tierRequired)` (threaded per the Task-5 decision); a 2nd failure returns `outcome:'fail'`. Move the existing route/fallback/`runStageSession` body from `executeWorkflow`'s loop into this function; `executeWorkflow` calls it and keeps the terminal branch from Task 3.

1. In `execute-workflow.test.ts`, add `describe('runStageWithRetry — engine retry cap=1 (SC6-a / D8a)')`:
   - `pass-required` stage, fake `success:false` on attempt 0 then `success:true` on attempt 1 → `run.outcome === 'pass'`, `run.attempt === 1`, and the attempt-1 route request carried the bumped floor (assert via a `routeSpy` capturing `req.floor` [option A] or `run.tier` bumped [option B]).
   - `pass-required` stage, `success:false` on both attempts → `run.outcome === 'fail'`, `run.attempt === 1`, exactly **2** `runSession` invocations (no 3rd).
   - `advisory` stage, `success:false` → `run.outcome === 'pass'`, `run.attempt === 0` (no retry).
   - Extend the fake to vary `success` per (stage, attempt) — key `successPerStage` by attempt too, e.g. `successByAttempt?: Record<number, boolean[]>`.
2. Run test — observe FAIL (no retry loop yet).
3. Implement `runStageWithRetry` (mirror the spec pseudocode, execute-workflow.ts:124-143): loop `for (let attempt = 0; attempt <= 1; attempt++)`, compute `floor` (attempt 0 → undefined; attempt 1 → `nextTier(prior decision.tierRequired)`), route with the floor, run the stage, and branch on `pass-required` + `!passed`. Recompose `executeWorkflow`'s loop to `const run = await runStageWithRetry(...)`.
4. Run test — observe PASS; re-run full suite (SC1/2/3/5 green).
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): engine-owned per-stage retry cap=1 at bumped tier (D8a)`
   _(If option A: precede with a separate commit `feat(types): optional RoutingRequest.floor honored by route()` for the `route()` edit, so SC8 scope is auditable.)_

### Task 7 (TDD): Separate the floor feed (D8b) from the retry decision

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

Phase 2 calls `recordOutcome(unit, tier, true)` per stage. Phase 3: on each **quality failure** call `recordOutcome(unit, decision.tierRequired, false)` — **once per failed attempt**, driving the cumulative floor **independently** of the engine's own retry (D8b, the C3 fix). A pass still records `true`.

1. In `execute-workflow.test.ts`, add to a `describe('runStageWithRetry — floor feed (SC6 / D8b)')`:
   - `pass-required` stage failing both attempts → `recordOutcome` called with `ok:false` **twice** (once per attempt), with each attempt's own tier; and NOT driven by the retry (the retry fires regardless of whether `recordOutcome` returned a climb).
   - a passing stage → `recordOutcome(..., true)` once.
2. Run test — observe FAIL (Phase-2 only records `true`).
3. In `runStageWithRetry`, after each `runStageSession`, compute `ok = step.gate !== 'pass-required' || passed` and call `ctx.adaptiveRouter?.recordOutcome(unit, decision.tierRequired, ok)` (guard `tierRequired !== undefined`). Ensure this call is **inside** the attempt loop and unconditional on quality — never gated by the retry branch.
4. Run test — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): feed cumulative floor on each quality failure, independent of retry (D8b)`

### Task 8 (TDD): D10 — mid-workflow runner error is terminal (no worktree wipe)

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

A runner **throw** (transport error) inside `runStageSession` must set `outcome:'error'` and go terminal via `finalizeWorkflowTerminal` — NOT rethrow into a retry, NOT re-run from stage 0. (The existing top-level `catch` is the I1 safety net; D10 wants the error attributed to the failing stage with `outcome:'error'` and its `failingStep`, so wrap the stage call.)

1. In `execute-workflow.test.ts`, add `describe('executeWorkflow — mid-workflow error is terminal (SC6-b / D10)')`:
   - 3-stage plan, `throwAtIndex:1` → `terminalCalls` length 1, `successCalls` length 0, `runOrder` is `[0,1]` (stage 2 never runs), the terminal `runs` includes stage 0's completed `StageRun` (prior artifact preserved — assert `runs[0].outcome === 'pass'` present in the terminal payload), and the failing `StageRun` for index 1 carries `outcome:'error'`.
   - Assert `ensureWorkspace` is never re-called: the fake ctx has no such method, and `runOrder` proving no restart-from-0 (stage 0 ran once) is the observable proof.
2. Run test — observe FAIL (current top-level catch passes `undefined` failingStep + `err`, and does not set the stage `outcome:'error'` on a per-stage record).
3. In `runStageWithRetry` (or `executeWorkflow`'s loop), wrap the `runStageSession` call in `try/catch`; on catch, build a `StageRun` with `outcome:'error'`, push it, and signal terminal (return an error-outcome run so the loop's `outcome !== 'pass'` branch calls `finalizeWorkflowTerminal(unit, runs, step)`). Keep the top-level `catch` as the last-resort I1 net (e.g. a throw from `finalizeWorkflowTerminal` itself).
4. Run test — observe PASS; re-run the SC5 throw tests (still exactly one terminal).
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): mid-workflow runner error terminates without worktree wipe (D10)`

### Task 9 (TDD): `stageAttemptKey` collision-freedom assert (carry-forward b)

**Depends on:** none | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

`stageAttemptKey(index, attempt) = index*1000 + attempt` (execute-workflow.ts:75-77) is collision-free only while `attempt < 1000`. Add an invariant guard.

1. In `execute-workflow.test.ts` `describe('stageAttemptKey')`, add: `expect(() => stageAttemptKey(0, 1000)).toThrow()` and confirm `stageAttemptKey(0, 999)` does not throw.
2. Run test — observe FAIL.
3. In `stageAttemptKey`, add at the top: `if (attempt < 0 || attempt >= 1000) throw new RangeError(\`stageAttemptKey: attempt must be 0..999 (got ${attempt})\`);` (also guard negative for safety). Update the JSDoc to state the invariant.
4. Run test — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `fix(orchestrator): assert stageAttemptKey attempt<1000 collision invariant`

### Task 10 (TDD): `gen.return()` on abort so the runner's stopSession finally runs (carry-forward a)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

`runStageSession`'s drain loop currently `break`s on `abort.signal.aborted` **without** calling `gen.return()` (execute-workflow.ts:173-176), so the runner's `finally { await stopSession }` (runner.ts:108-110) never runs → session leak. Call `gen.return()` when the loop exits early via abort.

1. In `execute-workflow.test.ts`, add `describe('runStageSession — abort cleanup (carry-forward a)')`: a fake runner whose `runSession` generator has a `finally` that flips a `stopped` flag; drive an abort mid-drain (expose the per-stage abort — see Task 11's deadline wiring, or add a test hook: the fake yields a sentinel event that the test aborts on). Assert `stopped === true` after `runStageSession` resolves (proving `gen.return()` ran the generator's finally).
2. Run test — observe FAIL (no `gen.return()`).
3. In `runStageSession`, replace the bare `if (abort.signal.aborted) break;` with:
   ```ts
   if (abort.signal.aborted) {
     await gen.return(undefined as never); // run the runner's finally { stopSession } (runner.ts:108-110)
     break;
   }
   ```
   Also call `await gen.return(...)` in the deadline path (Task 11) — keep a single helper if both paths share it.
4. Run test — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `fix(orchestrator): call gen.return() on stage abort so runner stopSession runs`

### Task 11 (TDD): D12 — per-stage wall-clock deadline → stage failure

**Depends on:** Task 10, Task 6 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

Add a configurable `stageDeadlineMs` (context field, default `120_000`) that wraps `runStageSession`: if the stage does not finish within the deadline, fire the per-stage `abort` (triggering Task 10's `gen.return()` cleanup) and treat the stage as `passed:false` → feeds D8 (retry once → terminal). Use fake timers.

1. Add `stageDeadlineMs?: number` to `WorkflowEngineContext` (optional; default `120_000` in the engine).
2. In `execute-workflow.test.ts`, add `describe('per-stage deadline (SC7 / D12)')` using `vi.useFakeTimers()`:
   - a `pass-required` stage whose fake `runSession` never returns (awaits a promise that never resolves, but yields nothing); advance timers past `stageDeadlineMs` → the stage's `run.outcome` becomes `'fail'` (via the retry path both attempts time out → terminal), `terminalCalls` length 1, and the generator's `finally`-flag is set (deadline aborted → `gen.return()`), proving no unbounded hang.
   - a stage that returns **before** the deadline → normal path, no abort.
3. Run test — observe FAIL (no deadline).
4. In `runStageSession`, wrap the drain in a deadline: create a timer `setTimeout(() => abort.abort(), ctx.stageDeadlineMs ?? 120_000)`; clear it on normal completion; on abort the existing Task-10 cleanup runs and `ret` stays unset → `passed=false`. Ensure the timer is always cleared (finally) so it never leaks. A timed-out stage returns a `StageRun` with `passed:false` so `runStageWithRetry` treats it as a quality failure (D8).
5. Run test — observe PASS.
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `feat(orchestrator): per-stage wall-clock deadline → stage failure (D12)`

### Task 12 (TDD): `finalizeWorkflowTerminal` contract — asserts `cleanWorkspace` + one `needs-human`

**Depends on:** Task 8, Task 3 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.test.ts`

`finalizeWorkflowTerminal` is a context method (real impl is Phase 4). Phase 3 pins its **contract** via the injected fake so Phase 4 has an executable spec: on terminal it must (a) delete running+claimed, (b) `persistLaneSafe('abandon')`, (c) queue exactly one `needs-human`, (d) run `cleanWorkspace` (S5 — no worktree leak) — and be called **exactly once** per unit for every failing path.

1. In `execute-workflow.test.ts`, add `describe('finalizeWorkflowTerminal contract (SC6 / SC5 / S5)')`: build a ctx whose `finalizeWorkflowTerminal` fake records ordered side-effect calls (`running.delete`, `claimed.delete`, `persistLaneSafe('abandon')`, `needsHuman++`, `cleanWorkspace++`). Assert across three failing drivers — stage `fail` (Task 3/6), stage `error` (Task 8), deadline (Task 11) — each yields **exactly one** terminal call, running/claimed both cleared, `needsHuman === 1`, `cleanWorkspace === 1`.
2. Run — observe PASS (this is a spec-locking test against the fake; no engine change needed if Tasks 3/6/8/11 route all failing paths through the single terminal branch). If any driver double-calls or skips, fix the engine branch that leaks.
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Commit: `test(orchestrator): pin finalizeWorkflowTerminal contract (needs-human + cleanWorkspace, S5)`

### Task 13: Re-assert SC1/SC5/SC8 non-regression sweep

**Depends on:** Task 12 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.test.ts`

Prove the Phase-3 terminal paths did not break the single-exit invariant or the routers.

1. Run the full workflow + agent + types suites: `pnpm --filter @harness-engineering/orchestrator test -- workflow` and `pnpm --filter @harness-engineering/types test`. Confirm all green (SC1/SC2/SC3/SC5 Phase-1/2 tests unchanged in behavior).
2. **SC8 byte-check:** `git diff 85008f773 -- packages/orchestrator/src/agent/adaptive-router.ts packages/orchestrator/src/agent/backend-router.ts packages/orchestrator/src/agent/escalation-state.ts packages/intelligence/src/complexity/derive-tier.ts packages/orchestrator/src/orchestrator.ts` — expect **empty** UNLESS Task 5 chose option (A), in which case ONLY `adaptive-router.ts` (the `Math.max` line) + `types/src/orchestrator.ts` (the `floor?` field) differ, and nothing else. Document the exact diff in the commit body.
3. If any unexpected file differs, STOP and reconcile before committing.
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `test(orchestrator): SC1/SC5/SC8 non-regression sweep for Phase 3`

### Task 14: ADRs for D8 and D10 (integration)

**Depends on:** Task 13 | **Files:** `docs/knowledge/decisions/` | **Category:** integration

Spec §Integration Points → Architectural Decisions names D8 and D10 as ADR-worthy. Write both.

1. Find the next ADR number: `ls docs/knowledge/decisions/ | grep -oE '^[0-9]+' | sort -n | tail -1` (increment).
2. Create `docs/knowledge/decisions/NNNN-separated-failure-mechanisms.md` (D8): context (rev-1 C3 bug conflated engine retry with `recordOutcome` climb), decision (three separated mechanisms: engine retry cap=1 at bumped tier; independent floor feed; terminal trigger), consequences, links to the spec + this plan.
3. Create `docs/knowledge/decisions/(NNNN+1)-mid-workflow-error-is-terminal.md` (D10): context (whole-issue retry re-runs from stage 0 → `ensureWorkspace` wipes the shared worktree, destroying prior-stage artifacts), decision (mid-workflow error terminates via `finalizeWorkflowTerminal`), consequences (stage-local retry-in-place is a follow-up).
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `docs(split-routing): ADRs for separated failure mechanisms (D8) + mid-workflow-terminal (D10)`

---

## Sequencing Notes

- **Parallelizable:** Tasks 1, 4, 9 have no cross-dependencies (different concerns: runner surface, tier helper, key assert) and can run in any order. Task 5 (decision checkpoint) gates Task 6, which gates 7/8/11. Task 10 gates 11.
- **Critical path:** 1 → 2 → 3 → (5 decision) → 6 → {7, 8} → 11 → 12 → 13 → 14.
- **The one router-touching change** (Task 5 option A) is isolated to its own commit inside Task 6 so SC8's audit is a clean single-file diff.

## Success Criteria (trace)

Every observable truth traces to tasks: T1-2 (gate eval → truths 1,4), T4-6 (nextTier + retry → truth 1), T7 (floor feed → truth 3), T3+T8 (terminal + D10 → truths 2,5), T9 (assert → truth 8), T10 (gen.return → truth 7), T11 (deadline → truth 6), T12 (terminal contract → truths 2,9), T13 (SC1/5/8 → truths 9,10), T14 (ADRs → integration).
