# Plan: Split-Routing Phase 4 — Opt-in Gate + Real Producer + `dispatchIssue` Wiring

**Date:** 2026-07-11 | **Spec:** `docs/changes/split-routing/proposal.md` (rev-2), Phase 4 | **Tasks:** 16 | **Time:** ~68 min | **Integration Tier:** large
**Branch:** `spec/split-routing` | **Builds on:** HEAD `b9120cbbb` (Phases 1–3) | **Session:** `changes--split-routing--proposal`

## Goal

Make the tested workflow stage-execution engine LIVE inside `dispatchIssue` — behind a doubly-opt-in `≥2`-stage gate driven by a real declarative producer, backed by a real `WorkflowEngineContext` composed from the orchestrator's own machinery — while guaranteeing that with no `≥2`-stage workflow declared, `dispatchIssue` is behaviorally identical to today (SC4) and every router stays byte-behaviorally unchanged (SC8).

## Observable Truths (Acceptance Criteria)

EARS framing where behavioral; each maps to a spec SC.

1. **[SC4 — THE critical guarantee]** _If_ no `≥2`-stage workflow is declared for a unit, _then_ `dispatchIssue` shall take the existing single-agent path **unchanged**: `workflowFor(issue)` returns `undefined` as a pure predicate with **zero** side effects (no `ensureWorkspace`, no claim, no route, no state mutation), and the resulting dispatch is byte-behaviorally identical to `b9120cbbb`.
2. **[SC4 / D13]** _If_ a declared workflow has exactly **1** stage, _then_ `workflowFor` shall return `undefined` → the unit takes the single-agent path.
3. **[SC4 / D13]** _If_ a declared workflow has **0** stages, _then_ config validation shall **reject** it with a clear error (the unit never dispatches with an empty workflow).
4. **[SC2 — end-to-end]** _When_ a unit declares a 2-stage workflow with distinct `routingHint`s and `routing.policy` is set, _then_ `dispatchIssue` shall enter `executeWorkflow` through the **real** `WorkflowEngineContext`, and the two stages shall route to two different tiers/backends through the real `AdaptiveRouter`, producing one completion.
5. **[SC5]** For **every** exit path of a real workflow unit (all-pass, stage terminal-fail, deadline, or a throw inside the engine loop), the real context shall drive **exactly one** claim, one lane transition, one terminal transition, with **no orphaned `running`/`claimed`** — the same single-unit invariants the Phase-1 fake context guaranteed structurally.
6. **[D11]** _When_ a workflow unit is re-dispatched after a mid-workflow process death, _then_ it shall re-run **from stage 0 on a fresh worktree** (`ensureWorkspace` wipes+recreates per attempt) — no persisted stage cursor.
7. **[D7]** An operator/caller shall be able to **declare** a staged workflow for a unit through a real, usable API surface (a `workflows` map keyed by matcher in orchestrator config, parsed by the existing loader/validator), not a throwaway test fixture.
8. **[D12]** Issue-grain stall detection (`orchestrator.ts:1407` / `state-machine.ts:736`) shall be **bypassed** for workflow units — a workflow unit's liveness is per-stage (the engine's deadline owns it), so `detectStalledIssues` must skip entries whose `RunningEntry.workflow` is set.
9. **[carry-forward, Phase-1 review #1]** The real `WorkflowEngineContext.makeRunner().runSession` seam shall be typed against the runner's `TurnResult` (Phase 3 re-exposed `success`), confirmed self-documenting.
10. **[stageDeadlineMs config]** A `stageDeadlineMs` config override shall thread into `WorkflowEngineContext.stageDeadlineMs`; absent ⇒ the engine default (`DEFAULT_STAGE_DEADLINE_MS = 120_000`).
11. **[SC8]** `AdaptiveRouter`, `BackendRouter`, `escalation-state.ts`, `derive-tier.ts` are byte-unchanged; the `dispatchIssue` **non-workflow path** is byte-behaviorally unchanged vs `b9120cbbb`.
12. **[SC1/SC5/SC6/SC7 re-assert]** SC1 (per-stage session/tokens), SC5 (single-exit), SC6 (retry→terminal, D10 no-wipe), SC7 (deadline) hold through the **real** context, not just the fake.

## File Map

- **MODIFY** `packages/types/src/orchestrator.ts` — add `workflows?` to `WorkflowConfig` (the orchestrator config; NOT the staged plan) + a `StagedWorkflowDecl` shape (matcher + stages) + optional `stageDeadlineMs`. Additive, optional.
- **MODIFY** `packages/orchestrator/src/workflow/schema.ts` — Zod schema for the `workflows` decl + the **0-stage validation error** (D13).
- **MODIFY** `packages/orchestrator/src/workflow/config.ts` — wire the workflows schema into `validateWorkflowConfig`.
- **CREATE** `packages/orchestrator/src/workflow/workflow-for.ts` — the pure `workflowFor(issue, config)` predicate (`≥2`-stage gate, D5/D13).
- **CREATE** `packages/orchestrator/src/workflow/workflow-for.test.ts` — SC4/D13 predicate tests.
- **CREATE** `packages/orchestrator/src/workflow/orchestrator-context.ts` — `buildWorkflowContext(orchestrator-internals): WorkflowEngineContext` real-seam composition (Task 4 — the trickiest).
- **CREATE** `packages/orchestrator/src/workflow/orchestrator-context.test.ts` — real-context seam-mapping + single-exit-invariant tests.
- **MODIFY** `packages/orchestrator/src/orchestrator.ts` — the `dispatchIssue` branch (after workspace + claim), the real `emitWorkflowSuccess`/`finalizeWorkflowTerminal` composition, the `stageDeadlineMs` override, and the stall-detection bypass (`:1407`).
- **MODIFY** `packages/orchestrator/src/core/stall-detector.ts` — skip entries with `entry.workflow` set (D12).
- **MODIFY** `packages/orchestrator/src/core/stall-detector.test.ts` — bypass test.
- **MODIFY** `packages/orchestrator/src/orchestrator.workflow-dispatch.test.ts` (**CREATE**) — SC2 end-to-end + D11 restart-from-0 + SC4 identity dispatch tests.
- **MODIFY** `packages/orchestrator/src/index.ts` — export `workflowFor`, `buildWorkflowContext`, and re-export new types via `pnpm generate:barrels`.
- **CREATE** `docs/knowledge/decisions/0067-split-routing-homed-in-orchestrator.md` — D9 ADR.
- **CREATE** `docs/knowledge/decisions/0068-per-stage-session-ownership.md` — D3 ADR.
- **MODIFY** `AGENTS.md` — orchestrator staged-dispatch section.
- **MODIFY** `docs/changes/adaptive-model-routing/proposal.md` — "Deferred follow-ups" Phase 4b → landed.

**NOT touched (scope guards, SC8):** `adaptive-router.ts`, `backend-router.ts`, `escalation-state.ts`, `derive-tier.ts`, the `worker_exit` reducer (`state-machine.ts:445-475`), `execute-workflow.ts` engine logic (context is now real-implemented, not re-written), the non-workflow branches of `dispatchIssue` (`:1919-2078`).

## Skeleton (thorough — Large-tier final phase touching the live state machine; approval required)

1. **Types + producer surface + 0-stage validation** — `WorkflowConfig.workflows` decl, Zod schema, 0-stage error (D7/D13) (~3 tasks, ~13 min)
2. **`workflowFor` pure predicate** — `≥2`-stage gate, no side effects (D5/D13) (~2 tasks, ~9 min)
3. **The real `WorkflowEngineContext`** — `buildWorkflowContext` mapping every fake seam to real orchestrator code; real `emitWorkflowSuccess`/`finalizeWorkflowTerminal` composition (~4 tasks, ~22 min) **[RISKIEST]**
4. **`dispatchIssue` wiring** — the branch after workspace+claim; `stageDeadlineMs` override (~2 tasks, ~11 min) **[RISKIEST]**
5. **Stall-detection bypass (D12)** — `detectStalledIssues` skips `entry.workflow` (~1 task, ~4 min)
6. **End-to-end + regression proofs** — SC2 2-stage-two-tier through the real context; D11 restart-from-0; SC4 byte-identical-when-off; SC1/5/6/7 re-assert (~2 tasks, ~9 min)
7. **Barrels + docs + ADRs (integration)** — export surface, AGENTS.md, AMR deferred→landed, D9 + D3 ADRs (~2 tasks, ~... )

**Estimated total:** 16 tasks, ~68 min.
_Skeleton approved: PENDING — see sign-off request at end._

## Uncertainties

- **[ASSUMPTION — the producer surface] Where the declaration lives.** D7 says "a workflow field on the dispatch input / a workflow config file parsed by the existing loader." There is a **naming collision**: `WorkflowConfig` (`types/orchestrator.ts:933`) is the ORCHESTRATOR config (tracker/polling/agent/…), not a staged plan. The existing loader (`workflow/loader.ts`) parses `harness.orchestrator.md` frontmatter into that `WorkflowConfig`. **Assumption:** the producer is a new optional `workflows?: StagedWorkflowDecl[]` on `WorkflowConfig`, each decl a `{ match: { skill? / labels? / identifierPrefix? }, stages: WorkflowStep[] }`, parsed+validated by the existing `validateWorkflowConfig`. `workflowFor(issue, config)` matches the issue against `config.workflows` and returns the first `≥2`-stage plan. This is minimal-but-real (an operator edits config, no code) and reuses the loader. **If** the intended surface is instead a field on the in-memory dispatch `Issue`/input, Task 1 + Task 4-wiring change (the predicate reads `issue.workflow` instead of `config.workflows`) — but the config route is the only one the "existing loader" clause fits, so proceed with it. Confirm at sign-off.

- **[ASSUMPTION — matcher grain] How a workflow binds to a unit.** v1 matches on `identifierPrefix` and/or `labels` (both already on `Issue`). Richer matchers (spec-attached, cognitiveMode) are follow-ups. Not blocking.

- **[RESOLVED — `finalizeWorkflowTerminal` real composition] (Phase-3 handoff).** It reuses the `finalizeRoutingTerminal` pattern (`orchestrator.ts:2388-2394`: `running.delete` + `claimed.delete` + `persistLaneSafe('abandon')`) **plus** `escalateRoutingToHuman`-style `needs-human` **plus** `cleanWorkspaceWithGuard` (S5). It must NOT call `finalizeRoutingTerminal` verbatim (that lacks needs-human + cleanWorkspace). Composed fresh in Task 6.

- **[RESOLVED — `emitWorkflowSuccess` real composition] the SC5 hazard.** The success settle must reproduce the `worker_exit`/`reason==='normal'` reducer (`state-machine.ts:457,467-474`: `running.delete` → `completed.set` → `claimed.delete` → `cleanWorkspace` effect) **WITHOUT** calling `emitWorkerExit`/`handleWorkerExit`. Reason (SC5 risk, flagged in Task 5): `handleWorkerExit` (`completion/handler.ts:46-52`) fires the **issue-keyed** `finishRecording(issueId, attempt)` and `recordAmrOutcome` — but the engine already ran **per-stage** `finishRecording(issueId, stageAttemptKey(i,a))` recorders and per-stage `recordOutcome`. Routing success through `emitWorkerExit` would (a) finish a recording that was never started at the issue-attempt key, and (b) double-feed escalation. So `emitWorkflowSuccess` composes the settle directly: `running.delete` + `completed.set` + `claimed.delete` + `cleanWorkspaceWithGuard` + `persistLaneSafe('success')` + one `state_change` emit. **This is the one place the real context must reproduce reducer semantics by hand; Task 7 pins it against the reducer's exact sequence.**

- **[DEFERRABLE] Per-stage prompt rendering.** The engine's `runStageSession` uses `step.skill` as a stub prompt (`execute-workflow.ts:194`). Real per-stage prompt rendering (via `this.renderer`) is threaded through `makeRunner`/context in Task 5 but a minimal `skill`-name prompt is acceptable for v1 SC2 (routing is what SC2 proves, not prompt fidelity). Note for a follow-up.

---

## Tasks

### Task 1 (TDD): Add the `workflows` producer decl to `WorkflowConfig` (types)

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`, `packages/types/src/orchestrator.test.ts` (or nearest types test)

Add the declarative producer surface (D7). It is additive + optional so all existing configs are byte-valid (SC4/adopter-portability).

1. In `packages/types/src/orchestrator.ts`, near `interface WorkflowConfig` (`:933`), add:
   ```ts
   /** split-routing D7: an operator declaration binding a staged workflow to units. */
   export interface StagedWorkflowDecl {
     /** Human label for logs/telemetry. */
     name: string;
     /** Match units by identifier prefix and/or labels (v1 matchers). */
     match: { identifierPrefix?: string; labels?: string[] };
     /** Ordered stages; workflowFor only returns a plan for length >= 2 (D13). */
     stages: WorkflowStep[];
     /** D12 override; absent ⇒ engine default DEFAULT_STAGE_DEADLINE_MS. */
     stageDeadlineMs?: number;
   }
   ```
   Import `WorkflowStep` from `./workflow` if not already in scope. Then add to `WorkflowConfig.agent` (or top-level `WorkflowConfig`, matching where optional blocks live) an optional field:
   ```ts
   /** split-routing D7: declarative staged workflows (opt-in; absent ⇒ single dispatch). */
   workflows?: StagedWorkflowDecl[];
   ```
2. In the types test, add a compile-level assertion that a `WorkflowConfig` with **no** `workflows` field still type-checks (proves additive/optional), and one with a valid `workflows` array does too.
3. Run: `pnpm --filter @harness-engineering/types test` — observe green.
4. Run: `pnpm --filter @harness-engineering/types typecheck` and `node packages/cli/dist/bin/harness.js validate` (expect baseline 409, zero new).
5. Commit: `feat(types): declarative staged-workflow producer decl on WorkflowConfig (D7)`

### Task 2 (TDD): Zod schema for `workflows` + 0-stage validation error (D13)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/workflow/schema.ts`, `packages/orchestrator/src/workflow/schema.test.ts`

A declared **0-stage** workflow is a validation ERROR (D13). A 1-stage workflow is schema-VALID (it just falls back to single dispatch via `workflowFor`, not a config error).

1. In `schema.test.ts`, add `describe('StagedWorkflowDecl schema (D7/D13)')`:
   - a decl with `stages: []` → `parse` FAILS with a message naming "at least 1 stage" (0-stage is a config error).
   - a decl with `stages: [oneStep]` → parse SUCCEEDS (1-stage is valid config; single-dispatch fallback is `workflowFor`'s job, not validation).
   - a decl with 2 valid steps + a `match.identifierPrefix` → parse SUCCEEDS.
   - a step missing `skill` → parse FAILS.
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- workflow/schema` — observe FAIL (no schema yet).
3. In `schema.ts`, add:
   ```ts
   export const WorkflowStepSchema = z
     .object({
       skill: z.string().min(1),
       produces: z.string().min(1),
       expects: z.string().min(1).optional(),
       gate: z.enum(['pass-required', 'advisory']).optional(),
       cognitiveMode: z.string().min(1).optional(),
       routingHint: z
         .object({ complexity: z.any().optional(), risk: z.any().optional() })
         .optional(),
     })
     .strict();
   export const StagedWorkflowDeclSchema = z
     .object({
       name: z.string().min(1),
       match: z
         .object({
           identifierPrefix: z.string().min(1).optional(),
           labels: z.array(z.string().min(1)).optional(),
         })
         .strict(),
       // D13: 0-stage is a validation error; 1-stage is valid (single-dispatch fallback).
       stages: z.array(WorkflowStepSchema).min(1, 'a workflow must declare at least 1 stage (D13)'),
       stageDeadlineMs: z.number().int().positive().optional(),
     })
     .strict();
   ```
   (Note the D13 nuance encoded in the plan: `.min(1)` rejects 0-stage at schema; the `≥2` gate lives in `workflowFor`, not the schema — a 1-stage decl is legal config.)
4. Run the test — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): Zod schema for staged-workflow decl; 0-stage is a validation error (D13)`

### Task 3 (TDD): Wire `workflows` validation into `validateWorkflowConfig`

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/workflow/config.ts`, `packages/orchestrator/src/workflow/config.test.ts`

`validateWorkflowConfig` (`config.ts:152`) is hand-rolled per-section. Add a `workflows` validation pass that runs `StagedWorkflowDeclSchema` over each entry and returns the 0-stage error through the existing `Result` channel.

1. In `config.test.ts`, add: a full config (via `getDefaultConfig()`) with `workflows: [{ name, match, stages: [] }]` → `validateWorkflowConfig` returns `Err` naming "at least 1 stage". A config with a valid 2-stage decl → returns `Ok`. A config with **no** `workflows` → `Ok` (unchanged; SC4).
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- workflow/config` — observe FAIL.
3. In `config.ts`, import `StagedWorkflowDeclSchema` from `./schema.js`; after the modern-backends block (before the final `return Ok`), add:
   ```ts
   if (c.workflows !== undefined) {
     const parsed = z.array(StagedWorkflowDeclSchema).safeParse(c.workflows);
     if (!parsed.success) return Err(new Error(`workflows: ${parsed.error.message}`));
   }
   ```
4. Run the test — observe PASS. Re-run the full `workflow/config` suite (existing configs unchanged → still Ok).
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): validate declarative workflows in validateWorkflowConfig (D13)`

### Task 4 (TDD): `workflowFor(issue, config)` — pure `≥2`-stage predicate (D5/D13)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/workflow/workflow-for.ts` (CREATE), `packages/orchestrator/src/workflow/workflow-for.test.ts` (CREATE)

The doubly-opt-in gate. A **pure** predicate: match `issue` against `config.workflows`, return a `WorkflowExecutionPlan` only for the first matching decl with `stages.length >= 2`; `undefined` otherwise. **No side effects** (SC4).

1. In `workflow-for.test.ts`, add `describe('workflowFor (SC4 / D5 / D13)')`:
   - no `config.workflows` → `undefined`.
   - a matching decl with **2** stages → returns `{ coherenceUnit: issue.id, stages }` (plan).
   - a matching decl with **1** stage → `undefined` (single dispatch, D13).
   - a decl that does NOT match the issue (wrong `identifierPrefix`) → `undefined`.
   - a matching decl by `labels` (issue carries the label) → returns the plan.
   - **purity:** call `workflowFor` with a frozen `issue` + frozen `config`; assert it neither throws nor mutates (deep-equal before/after) and returns the same value on a second call.
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- workflow-for` — observe FAIL (no module).
3. In `workflow-for.ts`:
   ```ts
   import type { Issue, WorkflowConfig, WorkflowExecutionPlan } from '@harness-engineering/types';
   /** D5/D13: pure predicate — a WorkflowExecutionPlan iff a matching decl declares >= 2 stages. */
   export function workflowFor(
     issue: Issue,
     config: WorkflowConfig
   ): WorkflowExecutionPlan | undefined {
     const decls = config.workflows;
     if (!decls || decls.length === 0) return undefined;
     for (const d of decls) {
       const prefixOk =
         d.match.identifierPrefix === undefined ||
         issue.identifier.startsWith(d.match.identifierPrefix);
       const labelsOk =
         d.match.labels === undefined || d.match.labels.every((l) => issue.labels.includes(l));
       if (!prefixOk || !labelsOk) continue;
       if (d.stages.length < 2) return undefined; // D13: 1-stage → single dispatch
       return { coherenceUnit: issue.id, stages: d.stages };
     }
     return undefined;
   }
   ```
4. Run the test — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js check-deps` (orchestrator→types is allowed) and `validate`.
6. Commit: `feat(orchestrator): workflowFor pure >=2-stage opt-in predicate (D5/D13)`

### Task 5 [checkpoint:human-verify] (TDD): Real `WorkflowEngineContext` — runner + workspace + router seams

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/workflow/orchestrator-context.ts` (CREATE), `packages/orchestrator/src/workflow/orchestrator-context.test.ts` (CREATE)

**RISKIEST TASK (part 1 of 2).** Build `buildWorkflowContext(deps): WorkflowEngineContext` mapping each fake seam (`execute-workflow.ts:37-95`) to real orchestrator code. This task covers the **non-terminal** seams (runner, workspace, router, recorder); Task 6 adds the two terminal seams. Because the engine must NOT import `orchestrator.ts` (layer cycle — the context surface exists precisely for this), the context is built from a **dependency bag** the orchestrator passes in, not from `this`.

Seam → real-code mapping (each cited):

- `recorder` → `this.recorder` (the orchestrator's `StreamRecorder`, `orchestrator.ts:759`).
- `logger` → `this.logger`.
- `issueId/identifier/externalId` → `issue.id/identifier/externalId`.
- `workspacePath` → the **single** `ensureWorkspace(issue.identifier)` result from `dispatchIssue` (`orchestrator.ts:1856`), reused across all stages (one worktree per unit).
- `stageDeadlineMs` → `decl.stageDeadlineMs ?? this.config...` (Task 8 threads the override; here accept it as a dep).
- **`makeRunner(backend)`** → `(backend) => new AgentRunner(backend, { maxTurns: this.config.agent.maxTurns })` (`orchestrator.ts:2075-2077`, `runner.ts:39`). Its `runSession(issue, ws, prompt)` returns `AsyncGenerator<AgentEvent, TurnResult, void>` (`runner.ts:47-51`) — the seam is **already typed against `TurnResult`** (`success/sessionId/usage`, `execute-workflow.ts:55-69`), satisfying carry-forward #9. Add a code comment citing `runner.ts:112` (`return lastResult: TurnResult`).
- **`resolveStageBackend(step)`** (identity fallback) → materialize via `this.backendFactory.forUseCase(buildStageUseCase(step))` (`orchestrator.ts:2065-2066`); when `backendFactory === null` fall back to a name-only `AgentBackend` from `config.agent.routing.default`.
- **`adaptiveRouter`** → present **iff** `this.adaptiveRouter !== null` (constructed only when `routing.policy` set, `orchestrator.ts:698`). Pass a narrow `{ route, recordOutcome }` surface bound to `this.adaptiveRouter.route/recordOutcome`. When `null` ⇒ omit the field (identity fallback, D5).
- **`makeRunner` for a routed decision** → the engine derives the backend name from `decision.backendName` (`execute-workflow.ts:320`); the context's `makeRunner` must translate that name to a real backend via `this.backendFactory.forUseCase(useCase, { invocationOverride: decision.backendName })` (mirrors `orchestrator.ts:2062-2064`). Thread this by having `makeRunner` accept the name-only `AgentBackend` and re-materialize (documented: same emit shape as the AMR dispatch swap).

1. In `orchestrator-context.test.ts`, add `describe('buildWorkflowContext — real seams (SC1/carry-forward)')`:
   - `makeRunner(backend)` returns an object whose `runSession` is an async generator (construct with a MockBackend-backed `AgentRunner`), and its return value carries `{ sessionId, success, usage }` (TurnResult shape) — assert the seam type by running one stage against a mock and reading `run.sessionId`/`run.tokens`.
   - `adaptiveRouter` is **present** when a non-null router dep is passed, **absent** when `null` (D5 identity fallback).
   - `resolveStageBackend(step)` returns an `AgentBackend` with a `name`.
   - drive `runStageSession(ctx, ...)` (imported from `execute-workflow.ts`) with the real context + a MockBackend and assert SC1: `run.tokens` accrues, `run.sessionId` is the stage's own, and the recorder got `startRecording`/`finishRecording` at `stageAttemptKey(index, attempt)` (spy the injected recorder).
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- orchestrator-context` — observe FAIL (no module).
3. Implement `buildWorkflowContext(deps: { recorder; logger; issue; workspacePath; maxTurns; backendFactory; adaptiveRouter; routingDefault; stageDeadlineMs? }): Omit<WorkflowEngineContext, 'emitWorkflowSuccess' | 'finalizeWorkflowTerminal'>` returning the non-terminal seams above (terminal seams are Task 6; keep the return type an `Omit` so the compiler forces Task 6 to complete it). Add `buildStageUseCase(step)` locally (kind:'skill', skillName:step.skill, cognitiveMode?).
4. Run the test — observe PASS.
5. **[checkpoint:human-verify]** Pause: show the seam→`file:line` mapping table and the `orchestrator-context.ts` diff. Confirm each fake seam maps to the intended real code before Task 6 wires the terminal transitions (the SC5-critical part).
6. Run: `node packages/cli/dist/bin/harness.js check-deps` (assert **no** new orchestrator→orchestrator cycle; the context module may import `agent/runner`, `agent/adaptive-router` types, `core/stream-recorder` — all same-layer) and `validate`.
7. Commit: `feat(orchestrator): real WorkflowEngineContext runner/workspace/router seams (D1/D3)`

### Task 6 [checkpoint:human-verify] (TDD): Real `emitWorkflowSuccess` + `finalizeWorkflowTerminal` — the single-exit terminal seams

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/workflow/orchestrator-context.ts`, `packages/orchestrator/src/workflow/orchestrator-context.test.ts`

**RISKIEST TASK (part 2 of 2) — the SC5 core.** Complete the context with the two terminal seams, composed to drive **exactly one** terminal transition each, reproducing reducer semantics WITHOUT re-entering `emitWorkerExit`/`handleWorkerExit` (see the RESOLVED uncertainty — that path double-fires the issue-keyed recorder + escalation the engine already owns per-stage).

- **`emitWorkflowSuccess(unit, runs)`** reproduces `worker_exit`/normal (`state-machine.ts:457,467-474`): `state.running.delete(unit)` → `state.completed.set(unit, Date.now())` → `state.claimed.delete(unit)` → `cleanWorkspaceWithGuard(identifier, unit)` (the effect the reducer pushes, `state-machine.ts:470-474`) → `persistLaneSafe(unit, 'success')` → one `emit('state_change')`. It aggregates `runs` into a completion record for telemetry (best-effort). **No** `emitWorkerExit`, **no** issue-attempt `finishRecording`, **no** `recordAmrOutcome` (the engine already recorded per-stage).
- **`finalizeWorkflowTerminal(unit, runs, failingStep?, err?)`** reproduces the `finalizeRoutingTerminal` pattern (`orchestrator.ts:2388-2394`) **plus** the needs-human + cleanWorkspace the Phase-3 contract pinned: `state.running.delete(unit)` → `state.claimed.delete(unit)` → `persistLaneSafe(unit, 'abandon')` → **one** `needs-human` via the `escalateRoutingToHuman`-style queue push (`orchestrator.ts:2301-2316`) → `cleanWorkspaceWithGuard` (S5) → one `emit('state_change')`. It must never rethrow (I1 safety net calls it from the engine `catch`).

These seams are passed to `buildWorkflowContext` as **dep callbacks** the orchestrator supplies (so the module never imports `orchestrator.ts`): `deps.settleSuccess(unit, runs)` and `deps.settleTerminal(unit, runs, step?, err?)`. The orchestrator binds them to private methods in Task 7.

1. In `orchestrator-context.test.ts`, add `describe('terminal seams — single exit (SC5)')` with an **in-test fake state** (a `{ running: Map, claimed: Set, completed: Map }` + spied `persistLaneSafe`/`cleanWorkspace`/`needsHumanPush`):
   - `emitWorkflowSuccess` deletes running, sets completed, deletes claimed, calls cleanWorkspace once, persists `'success'` once, emits once — **exactly once each**, in that order.
   - `finalizeWorkflowTerminal` deletes running+claimed, persists `'abandon'` once, pushes exactly **one** needs-human, calls cleanWorkspace once — for a `fail`, an `error`, and an `err`-carrying (I1) call.
   - drive full `executeWorkflow(ctx, plan)` (real context over the fake state) for: all-pass (→ exactly one success settle, zero terminal), stage-fail (→ zero success, exactly one terminal), and a forced throw between stages (→ exactly one terminal, no orphaned running/claimed). **This is the SC5 proof through the REAL context.**
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- orchestrator-context` — observe FAIL.
3. Implement the two seams as thin wrappers over the injected `deps.settleSuccess`/`deps.settleTerminal`, and change `buildWorkflowContext`'s return type from the Task-5 `Omit` to the full `WorkflowEngineContext`.
4. Run the test — observe PASS.
5. **[checkpoint:human-verify]** Pause: show the two settle sequences side-by-side with `state-machine.ts:457-474` (success) and `orchestrator.ts:2388-2394` + `2301-2316` (terminal). Confirm the success path does NOT route through `emitWorkerExit` (the SC5 double-fire hazard) before wiring into live dispatch.
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `feat(orchestrator): real workflow terminal seams — one success/terminal exit, no emitWorkerExit double-fire (D6/SC5)`

### Task 7 (TDD): Orchestrator private `settleWorkflowSuccess` / `settleWorkflowTerminal` methods

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/orchestrator.workflow-dispatch.test.ts` (CREATE)

Add the two private methods the context's dep callbacks bind to, on the real `Orchestrator`. They own `this.state`/`this.persistLaneSafe`/`this.cleanWorkspaceWithGuard`/`this.interactionQueue`.

1. In `orchestrator.workflow-dispatch.test.ts`, construct an `Orchestrator` with a `workflows` config + MockBackend override, seed a `running`+`claimed` entry, and call `(orch as any).settleWorkflowSuccess(unit, runs)` → assert running removed, completed set, claimed released, `persistLaneSafe` got `'success'`. Then `settleWorkflowTerminal(unit, runs)` on a fresh entry → running+claimed removed, `'abandon'` persisted, exactly one interaction queued.
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- workflow-dispatch` — observe FAIL.
3. In `orchestrator.ts`, add `private async settleWorkflowSuccess(unit, runs)` and `private async settleWorkflowTerminal(unit, runs, failingStep?, err?)` implementing the two sequences from Task 6 (reusing `this.persistLaneSafe`, `this.cleanWorkspaceWithGuard`, `this.interactionQueue.push`, `this.emit('state_change', this.getSnapshot())`). Model `settleWorkflowSuccess` on the reducer at `state-machine.ts:457-474`; model `settleWorkflowTerminal` on `finalizeRoutingTerminal` (`:2388-2394`) + `escalateRoutingToHuman` (`:2301-2316`) + `cleanWorkspaceWithGuard`.
4. Run the test — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): private settleWorkflowSuccess/Terminal reproduce reducer settle for workflow units`

### Task 8 (TDD): Wire the `executeWorkflow` branch into `dispatchIssue`

**Depends on:** Task 7, Task 4 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/orchestrator.workflow-dispatch.test.ts`

**RISKIEST — the live-wiring point.** After workspace + claim, before the single-agent backend materialization (`orchestrator.ts:2002`), branch on `workflowFor`. The branch must sit **after** `ensureWorkspace` (`:1856`) so the workflow reuses the one worktree (D11/assumptions), and after the claim, so SC5's "one claim" holds. Everything below the branch (the single-agent path `:1919-2078`) is **untouched** when `plan === undefined` (SC4).

**SC4 GUARD (must verify):** `workflowFor(issue, this.config)` is called with the already-in-hand `issue`+`config` — it triggers **no** side effect. If `undefined`, control falls through to the **unchanged** existing code. The branch is a single `if (plan) { ... return; }` inserted at `:2002` (after workspace, before the `LiveSession`/routing block), so the non-workflow path's byte-behavior is preserved.

1. In `orchestrator.workflow-dispatch.test.ts`:
   - **SC4 identity:** a config with **no** `workflows` (or a non-matching one) → dispatching an issue takes the single-agent path: assert `runAgentInBackgroundTask` is invoked exactly as today (spy it), and `executeWorkflow` is NOT called. Also a **1-stage** decl → single path (D13).
   - **workflow entry:** a matching 2-stage decl → `executeWorkflow` is entered via the real context; assert two stages ran (two per-stage recorder keys) and exactly one `settleWorkflowSuccess`.
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- workflow-dispatch` — observe FAIL.
3. In `dispatchIssue`, after the workspace/hook/scan block and immediately before `// 4. Render prompt` (`orchestrator.ts:1919`), insert:
   ```ts
   // split-routing Phase 4 (D5/D13): doubly-opt-in staged dispatch. workflowFor is a
   // pure predicate — undefined ⇒ fall through to the UNCHANGED single-agent path (SC4).
   const workflowPlan = workflowFor(issue, this.config);
   if (workflowPlan) {
     const matched = this.config.workflows?.find(/* same match as workflowFor */);
     const ctx = buildWorkflowContext({
       recorder: this.recorder,
       logger: this.logger,
       issue,
       workspacePath,
       maxTurns: this.config.agent.maxTurns,
       backendFactory: this.backendFactory,
       adaptiveRouter: this.adaptiveRouter,
       routingDefault: this.config.agent.routing?.default,
       ...(matched?.stageDeadlineMs !== undefined
         ? { stageDeadlineMs: matched.stageDeadlineMs }
         : {}),
       settleSuccess: (u, r) => this.settleWorkflowSuccess(u, r),
       settleTerminal: (u, r, s, e) => this.settleWorkflowTerminal(u, r, s, e),
     });
     // record the plan on the running entry (D11 in-memory cursor; stall bypass reads it)
     const entry = this.state.running.get(issue.id);
     if (entry)
       this.state.running.set(issue.id, { ...entry, workflow: workflowPlan, workspacePath });
     void executeWorkflow(ctx, workflowPlan); // fire-and-forget like runAgentInBackgroundTask
     return;
   }
   ```
   (Place the `stageDeadlineMs` conditional spread per `exactOptionalPropertyTypes`.)
4. Run the test — observe PASS. Re-run the **full** orchestrator dispatch suite to confirm the non-workflow path is unchanged.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): wire workflowFor + executeWorkflow branch into dispatchIssue (D5)`

### Task 9 (TDD): Bypass issue-grain stall detection for workflow units (D12)

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/core/stall-detector.ts`, `packages/orchestrator/src/core/stall-detector.test.ts`

A workflow unit's liveness is per-stage (the engine's deadline owns it, D12). The issue-grain `detectStalledIssues` (`stall-detector.ts:16`) — which the orchestrator loop drives at `orchestrator.ts:1407` — must SKIP entries whose `RunningEntry.workflow` is set, else a long multi-stage unit is falsely stalled+retried (which would wipe the worktree).

1. In `stall-detector.test.ts`, add: a running entry that is stale by `stallTimeoutMs` but has `workflow` set → NOT returned by `detectStalledIssues`. A stale entry WITHOUT `workflow` → still returned (unchanged).
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- stall-detector` — observe FAIL.
3. In `detectStalledIssues`, inside the loop after `const reference = ...`, add: `if (entry.workflow) continue; // D12: workflow units own per-stage liveness (engine deadline)`.
4. Run the test — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `fix(orchestrator): bypass issue-grain stall detection for workflow units (D12)`

### Task 10 (TDD): SC2 end-to-end — 2-stage workflow routes two stages to two tiers

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/orchestrator.workflow-dispatch.test.ts`

Prove the whole path: a declared 2-stage workflow with distinct `routingHint`s, `routing.policy` set (so `adaptiveRouter !== null`), routes stage 0 and stage 1 to **different** tiers/backends through the REAL `AdaptiveRouter` in the REAL context, producing one completion.

1. Construct an `Orchestrator` with `agent.backends` (a `fast` and a `strong` backend), `agent.routing.policy` set, and `workflows: [{ name, match: { identifierPrefix }, stages: [stepStrongHint, stepFastHint] }]`. Dispatch a matching issue.
2. Assert: two per-stage recorder recordings exist at `stageAttemptKey(0,0)` and `stageAttemptKey(1,0)`; the two `StageRun.decision.backendName`/`tier` differ (strong vs fast — S3 deterministic hints); exactly one `settleWorkflowSuccess`; `running`/`claimed` empty afterward; `completed` has the unit.
3. Run: `pnpm --filter @harness-engineering/orchestrator test -- workflow-dispatch` — iterate to green.
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `test(orchestrator): SC2 end-to-end — two stages route to two tiers through real context`

### Task 11 (TDD): D11 restart-from-0 regression + SC5/SC6/SC7 re-assert through real context

**Depends on:** Task 10 | **Files:** `packages/orchestrator/src/orchestrator.workflow-dispatch.test.ts`

1. **D11 restart-from-0:** dispatch a 2-stage workflow, let it complete; **re-dispatch** the same unit (simulating a process-restart re-pickup) → assert `ensureWorkspace(identifier)` was called again (fresh worktree — spy the workspace manager) and the workflow re-ran from stage 0 (recorder saw `stageAttemptKey(0,0)` a second time), NOT from a persisted cursor.
2. **SC5 through real context:** force a throw inside a stage (a MockBackend that throws) → exactly one `settleWorkflowTerminal`, no orphaned `running`/`claimed`.
3. **SC6/SC7 re-assert:** a `pass-required` stage failing both attempts → one terminal + one needs-human; a stage exceeding `stageDeadlineMs` (fake timers, small override via the decl) → treated as stage failure → terminal. (These re-exercise the Phase-3 engine logic through the REAL context, confirming Task 5/6 seams don't regress it.)
4. Run: `pnpm --filter @harness-engineering/orchestrator test -- workflow-dispatch` — iterate to green.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `test(orchestrator): D11 restart-from-0 + SC5/SC6/SC7 through the real workflow context`

### Task 12: SC4/SC8 byte-behavior non-regression sweep

**Depends on:** Task 11 | **Files:** (verification only; no source change)

Prove the non-workflow path and the routers are unchanged.

1. **SC8 byte-check:** `git diff b9120cbbb -- packages/orchestrator/src/agent/adaptive-router.ts packages/orchestrator/src/agent/backend-router.ts packages/orchestrator/src/agent/escalation-state.ts packages/intelligence/src/complexity/derive-tier.ts` → expect **empty**.
2. **`worker_exit` reducer unchanged:** `git diff b9120cbbb -- packages/orchestrator/src/core/state-machine.ts` → expect only the (none) — the reducer must be untouched (the settle is reproduced in orchestrator methods, not by editing the reducer). If the diff is non-empty, STOP and reconcile.
3. **SC4 dispatch-path check:** run the full existing orchestrator dispatch + AMR test suites (`pnpm --filter @harness-engineering/orchestrator test`) → all green, confirming the single-agent path is behaviorally identical. Confirm the only `dispatchIssue` diff vs `b9120cbbb` is the additive `if (workflowPlan) { ... return; }` block (a single guarded early-return; the fall-through code is byte-identical).
4. Run: `node packages/cli/dist/bin/harness.js validate` (expect baseline 409, zero new).
5. Commit: `test(orchestrator): SC4/SC8 non-regression sweep for Phase 4 wiring`

### Task 13: Barrel exports for the new surface (integration)

**Depends on:** Task 12 | **Files:** `packages/orchestrator/src/index.ts`, `packages/types/src/index.ts` (via generator) | **Category:** integration

1. Export `workflowFor` (from `./workflow/workflow-for`) and `buildWorkflowContext` (from `./workflow/orchestrator-context`) from `packages/orchestrator/src/index.ts`. Ensure `StagedWorkflowDecl` re-exports from `@harness-engineering/types` (Task 1 added it under `./orchestrator`; confirm `types/src/index.ts` surfaces it).
2. Run: `pnpm generate:barrels` (regenerate barrels; per repo memory, curated core barrels need allowlist edits — orchestrator/types barrels are export-based, so the generator picks these up).
3. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` + `node packages/cli/dist/bin/harness.js validate`.
4. Commit: `chore(orchestrator): export workflowFor + buildWorkflowContext + StagedWorkflowDecl`

### Task 14: D9 + D3 ADRs (integration)

**Depends on:** Task 13 | **Files:** `docs/knowledge/decisions/` | **Category:** integration

Spec §Integration Points → Architectural Decisions names D9 (orchestrator homing) and D3 (engine owns per-stage session state) as ADR-worthy; D8/D10 already landed (0065/0066).

1. Next ADR number: `ls docs/knowledge/decisions/ | grep -oE '^[0-9]+' | sort -n | tail -1` → 0066, so use **0067**, **0068**.
2. Create `docs/knowledge/decisions/0067-split-routing-homed-in-orchestrator.md` (D9): context (`core/review` dimension agents are synchronous heuristics with no model, `fan-out.ts:22-45`; `core` cannot import `orchestrator` per the layer rule), decision (split-routing is homed in the orchestrator where AMR lives; the workflow engine is the orchestrator-side path to staged review later), consequences, links to the spec + this plan.
3. Create `docs/knowledge/decisions/0068-per-stage-session-ownership.md` (D3): context (rev-1 keyed session/recorder/abort 1:1 to the issue → N stages clobber recordings, lose per-stage tokens, race the single abort), decision (the engine owns per-stage session/recorder/abort/tokens keyed by `stageAttemptKey(index, attempt)`; the issue-level `RunningEntry.session` is never written by a stage), consequences (per-stage cost attributable; the real context in Task 5/6 preserves this by NOT routing through `emitWorkerExit`).
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `docs(split-routing): ADRs for orchestrator-homing (D9) + per-stage session ownership (D3)`

### Task 15: AGENTS.md orchestrator staged-dispatch section (integration)

**Depends on:** Task 14 | **Files:** `AGENTS.md` | **Category:** integration

1. In `AGENTS.md`'s orchestrator section, add a "Staged dispatch (split-routing)" subsection: doubly-opt-in (`≥2`-stage workflow declared in `agent.workflows` + `routing.policy` set); each stage routes independently via `AdaptiveRouter` with a shared coherence unit; per-stage cost captured; behaviorally identical single-dispatch when off. Reference the spec + ADRs 0065/0066/0067/0068.
2. Run: `node packages/cli/dist/bin/harness.js validate`
3. Commit: `docs(agents): document orchestrator staged dispatch (split-routing)`

### Task 16: Mark AMR "Deferred follow-ups" 4b as landed (integration)

**Depends on:** Task 15 | **Files:** `docs/changes/adaptive-model-routing/proposal.md` | **Category:** integration

1. In `docs/changes/adaptive-model-routing/proposal.md` "Deferred follow-ups" (`:328`), update the "Phase 4b — split-routing (D6/SC4)" bullet (`:333`) from "Deferred" to **landed**, linking `docs/changes/split-routing/proposal.md` and the four phase plans. Note the workflow stage-execution consumer now exists and reads per-stage routing.
2. Run: `node packages/cli/dist/bin/harness.js validate`
3. Commit: `docs(amr): mark split-routing (Phase 4b) as landed`

---

## Sequencing Notes

- **Parallelizable:** Tasks 1→2→3 (types→schema→config) are a chain; Task 4 (`workflowFor`) depends only on Task 1 and can run alongside 2/3. Tasks 5→6 (the real context) are a strict chain and are the critical path. Tasks 9 (stall bypass) depends only on Task 8. Docs/ADRs (13–16) are a tail chain after 12.
- **Critical path:** 1 → 4 → 5 → 6 → 7 → 8 → {9, 10} → 11 → 12 → 13 → 14 → 15 → 16.
- **The two `[checkpoint:human-verify]` gates** (Task 5, Task 6) bracket the riskiest work — the seam-mapping and the terminal-settle composition — so the SC5 single-exit invariant and the SC4-critical no-`emitWorkerExit` decision are human-confirmed before live wiring (Task 8).

## Success Criteria (trace)

- **SC4 (critical):** truths 1–3 → Task 4 (pure predicate + `≥2` gate), Task 2/3 (0-stage error), Task 8 (additive early-return branch), Task 12 (byte-behavior sweep).
- **SC2 end-to-end:** truth 4 → Task 5/6 (real context) + Task 10 (two-tier proof).
- **SC5 single-exit through real context:** truth 5 → Task 6 (terminal seams) + Task 11 (throw/fail proofs).
- **D11 restart-from-0:** truth 6 → Task 11.
- **D7 producer:** truth 7 → Tasks 1–3.
- **D12 stall bypass:** truth 8 → Task 9.
- **Carry-forward TurnResult typing:** truth 9 → Task 5.
- **stageDeadlineMs override:** truth 10 → Task 5/8.
- **SC8 + non-workflow byte-identity:** truth 11 → Task 12.
- **SC1/5/6/7 re-assert:** truth 12 → Task 11.

## Concerns / Risks (flagged for sign-off)

1. **[SC4 — highest] The `dispatchIssue` early-return placement (Task 8).** The branch is inserted after `ensureWorkspace`+claim and before the routing/`LiveSession` block. This is additive (`if (plan) { … return; }`) and the fall-through is byte-identical — but it DOES edit `dispatchIssue`. The risk to SC4 is if the branch's `workflowFor` call or the branch body accidentally runs on the non-workflow path. Mitigation: `workflowFor` is a pure predicate returning `undefined` for the common case, and Task 12 asserts the single-agent suites are green + the diff is a single guarded early-return. **This is the one place Phase 4 must touch the live dispatch path; the risk is contained to an additive guard, not a rewrite.**

2. **[SC5 — the subtle one] `emitWorkflowSuccess` must NOT go through `emitWorkerExit` (Task 6).** Routing workflow success through `emitWorkerExit`/`handleWorkerExit` would fire the **issue-keyed** `finishRecording(issueId, attempt)` (`completion/handler.ts:46-52`) — but the engine already ran **per-stage** recorders keyed by `stageAttemptKey` — and would double-feed `recordAmrOutcome`. So the success settle is reproduced by hand from the `worker_exit` reducer (`state-machine.ts:457-474`). This means Phase 4 has **one** hand-reproduced reducer sequence; if the reducer's success semantics change later, `settleWorkflowSuccess` must track it. Task 12 step 2 asserts the reducer itself is untouched to keep the two in sync at land-time. Flagged as a maintenance coupling, not a break.

3. **[Layer cycle] The real context must not import `orchestrator.ts`.** `buildWorkflowContext` takes a dependency bag (recorder/logger/factory/router/settle-callbacks), so the module imports only same-layer siblings (`agent/runner`, `agent/adaptive-router` types, `core/stream-recorder`) — never `orchestrator.ts`. Task 5 step 6 runs `check-deps` to assert no new cycle.

4. **[producer surface assumption]** The producer is `WorkflowConfig.workflows` (config-file declared), resolving the `WorkflowConfig` naming collision by adding an optional field, not by repurposing the orchestrator config. If sign-off prefers a dispatch-input field instead, Tasks 1 + 4 + 8 shift (predicate reads `issue.workflow`); flagged in Uncertainties.
