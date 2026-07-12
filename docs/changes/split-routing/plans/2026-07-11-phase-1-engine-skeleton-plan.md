# Plan: Split-Routing Phase 1 — Types + Engine Skeleton with Engine-Owned Per-Stage Session State

**Date:** 2026-07-11 | **Spec:** `docs/changes/split-routing/proposal.md` (rev-2) | **Tasks:** 10 | **Time:** ~40 min | **Integration Tier:** large | **Branch:** `spec/split-routing` (HEAD `55cfdc46d`)

## Goal

Build the C1-critical substrate: additive workflow types plus an `executeWorkflow` engine that runs a multi-stage workflow's stages sequentially on one worktree, where the engine itself drives `AgentRunner.runSession` per stage and owns per-stage session/recorder/abort/token state (never the issue-level fields), wrapped in a `try/finally` so every exit path drives exactly one terminal transition with no orphaned `running`/`claimed`.

## Scope (Phase 1 only)

**In scope:** types (`WorkflowStep` + `cognitiveMode`/`routingHint`, `WorkflowExecutionPlan`, `StageRun`); optional `RunningEntry` fields; `executeWorkflow` + `runStageSession` with engine-owned per-stage state; `try/finally` single-exit; prove SC1 + SC5 (orphan-on-throw).

**Out of scope (scope guards — do NOT do):**

- Per-stage routing via `AdaptiveRouter.route()` (Phase 2). Phase 1 stubs routing (single tier, identity).
- Failure / escalation / engine-retry / terminal-fail semantics, `recordOutcome` floor feed, per-stage deadline (Phase 3). Phase 1 uses a single attempt (no retry) and a placeholder terminal transition.
- `workflowFor` opt-in gate, `≥2`-stage validation, declarative producer, `dispatchIssue` branch wiring (Phase 4). Phase 1's engine is **not** yet reachable from `dispatchIssue` — it is invoked directly by tests. No change to `dispatchIssue`.
- Do NOT modify `BackendRouter` / `AdaptiveRouter` (AMR D2 / SC8).
- Do NOT change single-agent dispatch (`runAgentInBackgroundTask`, `emitWorkerExit`, `finalizeRoutingTerminal` stay byte-unchanged).

## Observable Truths (Acceptance Criteria)

Phase-1 slice of the spec's SC1 and SC5:

1. **[SC1-a]** When a 3-stage `WorkflowExecutionPlan` is executed, the engine shall run all 3 stages sequentially, in `plan.stages` order, on the single `workspacePath` it was given (verified: stages observe a shared, in-order run log).
2. **[SC1-b]** Each stage's `StageRun` shall carry its own `sessionId` (distinct per stage, sourced from that stage's `runSession` return) and its own `tokens` (`{ input, output, total }` accrued from that stage's events only) — per-stage cost is attributable.
3. **[SC1-c]** During execution the engine shall NOT write the issue-level `RunningEntry.session` field; per-stage session/abort live in `stageRuns[i]` (C1/D3). The issue-level `session` remains whatever it was before `executeWorkflow` was entered.
4. **[SC1-d]** The engine shall call `recorder.startRecording`/`finishRecording` with a per-stage attempt key derived from `(stageIndex, attempt)`, so N stages produce N distinct recordings under `streams/{issueId}/` with no clobbering (verified: N distinct `.jsonl` files / N manifest attempts).
5. **[SC5-a]** When all stages pass, `executeWorkflow` shall drive **exactly one** terminal success transition (`ctx.emitWorkflowSuccess`) — one running-delete, one claimed-delete — with no orphaned `running`/`claimed`.
6. **[SC5-b]** When the engine loop throws between stages (forced), the `try/finally` shall drive **exactly one** terminal transition (`ctx.finalizeWorkflowTerminal`), leaving **no orphaned `running`/`claimed`** for the coherence unit. **Regression-tested by forcing a throw between stages.**
7. **[SC8-slice]** `AdaptiveRouter`/`BackendRouter` are byte-unchanged; existing orchestrator tests pass unchanged; `harness validate` (scope: types + orchestrator) and `harness check-deps` pass.

## Grounding evidence (real `file:line`)

- `AgentRunner.runSession(_issue, workspacePath, prompt)` — `packages/orchestrator/src/agent/runner.ts:47-113`. **Ignores `_issue`** (underscore param), so it holds NO issue-level state; returns a `TurnResult` with `.sessionId` and `.usage`. Safe to drive directly per stage.
- `TurnResult { success, sessionId, usage, error? }` — `packages/types/src/orchestrator.ts:165-174`. The engine reads the generator's **return value** for `sessionId`/final usage; per-event `usage` for accrual.
- `runAgentInBackgroundTask` — `packages/orchestrator/src/orchestrator.ts:2135-2208`: sets the **issue-keyed** `this.abortControllers.set(issue.id, …)` (`:2150`) and consumes the generator with `for-await-of` (`:2156`) **discarding the return value** (`:2174` loop; return never captured), then calls the issue-level `emitWorkerExit` (`:2187`/`:2190`/`:2201`). Reusing it for stages would clobber the single issue abort + lose per-stage `sessionId`. The engine must NOT reuse it (D3).
- `dispatchIssue` writes issue-level `session` — `orchestrator.ts:2003-2033` (`this.state.running.set(issue.id, { …, session })`) and `recorder.startRecording(issue.id, …, attempt ?? 1, …)` at `:2036-2043`. The engine must NOT touch these.
- `StreamRecorder` is keyed by `(issueId, attempt)`: `startRecording(issueId, externalId, identifier, backend, attempt, title?)` `stream-recorder.ts:99-162`; `recordEvent(issueId, attempt, event)` `:164-188`; `finishRecording(issueId, attempt, outcome, stats)` `:190`; `streamPath(issueId, attempt) → streams/{issueId}/{attempt}.jsonl` `:386-387`; accumulators keyed `` `${issueId}:${attempt}` `` `:154`. **There is no `stageIndex` parameter.** The engine encodes a per-stage attempt via `stageAttemptKey(stageIndex, attempt)` so `(0,0)`, `(1,0)`, `(2,0)` map to distinct `attempt` integers → distinct files, no clobber. **[CONCERN — see below.]**
- Token accrual today: `accrueUsage` (`state-machine.ts:567-591`) reads `event.usage` and adds to `session.inputTokens/outputTokens/totalTokens`. The engine mirrors this per stage by summing `event.usage` off yielded events into `StageRun.tokens` (MockBackend surfaces a `usage` event at `mock.ts:52-57`; comment there confirms totals come from **events**, not `TurnResult.usage`).
- `emitWorkerExit` (issue-level) — `orchestrator.ts:2213-2254`: one `persistLaneSafe` + one `completionHandler.handleWorkerExit`. `finalizeRoutingTerminal` — `orchestrator.ts:2388-2394`: `running.delete` + `claimed.delete` + `persistLaneSafe('abandon')`. Phase-1 `emitWorkflowSuccess`/`finalizeWorkflowTerminal` are **thin engine-local shims over these existing patterns** (Phase 3 fills in `cleanWorkspace` + `needs-human`); Phase 1 only needs the single running/claimed-delete + one lane persist so SC5 holds.
- Orphan reconciliation only clears **claimed-not-running** and only when the issue left the candidate set — `state-machine.ts:288-303`. It does NOT clear an orphaned `running` entry. So an engine exit path that forgets to delete `running` leaks forever → SC5 is load-bearing and cannot lean on reconciliation.
- `MockBackend` — `packages/orchestrator/src/agent/backends/mock.ts:13-73`: implements `AgentBackend`, yields a `usage` event, returns `{ success, sessionId, usage }`. The Phase-1 tests build stage backends from small `MockBackend` subclasses/instances with distinct `sessionId`s.
- Types barrel export block — `packages/types/src/index.ts:18-25` (workflow re-exports).
- `RunningEntry` — `packages/orchestrator/src/types/internal.ts:44-60` (note: spec's `:98-125` refs are stale; real file is 125 lines, `RunningEntry` at 44). `LiveSession` at `:24-39`.

## Concerns (flag before/while implementing)

1. **[CONCERN — recorder has no stageIndex arg; must NOT modify StreamRecorder in Phase 1.]** D3 says recorder is "keyed by `(issueId, stageIndex, attempt)`" but the real `StreamRecorder` API (`stream-recorder.ts:99,164,190,386`) is keyed by `(issueId, attempt)` only, with `attempt: number`. **Resolution chosen (Phase 1, no recorder change):** the engine derives a synthetic integer `stageAttemptKey(stageIndex, attempt) = stageIndex * 1000 + attempt` and passes it as the recorder's `attempt` parameter. This yields distinct `streams/{issueId}/{key}.jsonl` files + distinct manifest attempt records per stage — satisfying SC1-d — **without touching `StreamRecorder`**. This keeps the recorder change out of Phase 1. **Report:** if a future phase wants first-class `(issueId, stageIndex, attempt)` keying (nicer manifest semantics), that is a StreamRecorder API change to schedule in Phase 3/4, not smuggle into Phase 1. Flagged so the reviewer sees the encoding is deliberate, not accidental.

2. **[CONCERN — engine owns abort, not the issue-level `this.abortControllers` map.]** `runAgentInBackgroundTask` registers `this.abortControllers.set(issue.id, …)` (`orchestrator.ts:2150`), which `stopIssue` uses. If the engine reused that single map entry per stage it would race `stopIssue` and clobber across stages (D3). **Resolution:** the engine holds a **per-stage `AbortController` inside `stageRuns[index]`** and never writes `this.abortControllers`. Consequence for Phase 1: `stopIssue` cannot yet abort an in-flight workflow stage — that unit-level stop wiring is **deferred to a later phase** (deadline/abort is Phase 3, D12). Phase 1 only needs the per-stage controller to _exist and be owned by the engine_; no external aborter reads it yet. This is a real behavioral gap, called out here rather than hidden.

3. **[CONCERN — `ctx` surface: engine needs recorder + a runner factory + state access without importing the Orchestrator class.]** The engine lives in a new `workflow/` module and must not import `orchestrator.ts` (would be a cycle). Phase 1 defines a **narrow `WorkflowEngineContext` interface** (recorder, logger, a `makeRunner(backend)` factory or an injected runner, `getState`/`setState`, and two callbacks `emitWorkflowSuccess`/`finalizeWorkflowTerminal`). The Orchestrator will implement it in Phase 4 when `dispatchIssue` wires the branch. Phase 1 tests supply a fake `WorkflowEngineContext`. This keeps the engine unit-testable and layer-clean.

## File Map

- MODIFY `packages/types/src/workflow.ts` (add `cognitiveMode`/`routingHint` to `WorkflowStep`; add `WorkflowExecutionPlan`, `StageRun`; import routing types)
- MODIFY `packages/types/src/index.ts` (barrel: export `WorkflowExecutionPlan`, `StageRun`)
- MODIFY `packages/orchestrator/src/types/internal.ts` (add optional `workflow?`, `currentStageIndex?`, `stageRuns?` to `RunningEntry`)
- CREATE `packages/orchestrator/src/workflow/execute-workflow.ts` (`WorkflowEngineContext`, `stageAttemptKey`, `runStageSession`, `executeWorkflow`)
- CREATE `packages/orchestrator/src/workflow/execute-workflow.test.ts` (SC1 + SC5 tests, incl. forced-throw)

## Skeleton

1. **Types foundation** (Tasks 1-3, ~12 min) — `WorkflowStep` fields, `WorkflowExecutionPlan`/`StageRun`, barrel, `RunningEntry` optionals.
2. **Engine context + per-stage key** (Task 4, ~4 min) — `WorkflowEngineContext` interface + `stageAttemptKey` helper (pure, unit-tested).
3. **`runStageSession` — the C1 core** (Tasks 5-6, ~10 min) — engine-owned per-stage session/recorder/abort/tokens; unit test proves per-stage `sessionId`+`tokens` and no issue-level writes.
4. **`executeWorkflow` loop + try/finally single-exit** (Tasks 7-8, ~10 min) — sequential order + exactly-one-terminal-exit incl. forced-throw (SC5).
5. **Integration/validate** (Tasks 9-10, ~6 min) — barrel regen + `harness validate`/`check-deps`; SC8 non-regression check.

_Skeleton approved: pending (standard rigor, 10 tasks ≥ 8 → present for approval before expanding to execution)._

## Tasks

### Task 1: Extend `WorkflowStep` with `cognitiveMode` and `routingHint` (no `model`)

**Depends on:** none | **Files:** `packages/types/src/workflow.ts`

1. In `packages/types/src/workflow.ts`, add an import at the top for the routing types used by the hint:
   ```ts
   import type { ComplexityVerdict, RoutingRisk } from './orchestrator';
   ```
2. Extend the existing `WorkflowStep` interface (currently `workflow.ts:4-13`) by appending — **do NOT add a `model` field** (dropped as YAGNI per spec S2; a zero-consumer field is the anti-pattern this spec criticizes):
   ```ts
     /** Drives the per-stage RoutingUseCase (Phase 2 consumer). */
     cognitiveMode?: string;
     /**
      * Deterministic routing hint (S3): when present, Phase 2 seeds
      * RoutingRequest.complexity/risk so a fixture's `strong` and `fast`
      * stages resolve differently without live text classification.
      * No runtime consumer in Phase 1 (types are additive).
      */
     routingHint?: { complexity?: ComplexityVerdict; risk?: RoutingRisk };
   ```
3. Run: `pnpm --filter @harness-engineering/types typecheck` (or `pnpm --filter @harness-engineering/types build`) — observe it compiles (imports resolve).
4. Run: `node packages/cli/dist/bin/harness.js validate` — observe no NEW failures beyond the pre-existing dashboard CSS design-token baseline.
5. Commit: `feat(types): add cognitiveMode + routingHint to WorkflowStep (split-routing P1)`

### Task 2 (TDD): Add `WorkflowExecutionPlan` and `StageRun` types + a compile-time shape test

**Depends on:** Task 1 | **Files:** `packages/types/src/workflow.ts`, `packages/types/src/workflow.test.ts`

1. Write a type-level test. If `packages/types/src/workflow.test.ts` exists, append; else create it:

   ```ts
   import { describe, it, expect } from 'vitest';
   import type { WorkflowExecutionPlan, StageRun } from './workflow';

   describe('split-routing Phase 1 types', () => {
     it('WorkflowExecutionPlan + StageRun accept the C1 per-stage shape', () => {
       const run: StageRun = {
         index: 0,
         step: { skill: 's', produces: 'a' },
         sessionId: 'sess-0',
         tokens: { input: 10, output: 5, total: 15 },
         outcome: 'pass',
         attempt: 0,
         durationMs: 1,
       };
       const plan: WorkflowExecutionPlan = {
         coherenceUnit: 'issue-1',
         stages: [run.step, run.step],
       };
       expect(plan.stages).toHaveLength(2);
       expect(run.tokens?.total).toBe(15);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/types exec vitest run src/workflow.test.ts` — observe FAILURE (types not defined yet).
3. In `packages/types/src/workflow.ts`, after the existing `Workflow` interface, add:

   ```ts
   /** A resolved plan the stage-execution engine runs (split-routing). */
   export interface WorkflowExecutionPlan {
     /** One coherence unit across all stages (= issue.id). */
     coherenceUnit: string;
     /** Ordered stages; the engine runs them sequentially on one worktree. */
     stages: WorkflowStep[];
   }

   /** Per-stage execution record — carries per-stage session + cost (C1/D3). */
   export interface StageRun {
     index: number;
     step: WorkflowStep;
     /** C1: this stage's own session id — NOT the issue's. */
     sessionId?: string;
     /** C1: per-stage token cost, so split-routing cost is attributable. */
     tokens?: { input: number; output: number; total: number };
     outcome?: 'pass' | 'fail' | 'error';
     /** 0 or 1 (Phase 3 engine retry cap); always 0 in Phase 1. */
     attempt?: number;
     durationMs?: number;
   }
   ```

   Note: `decision?: RoutingDecision` and `tier?: CapabilityTier` from the spec's `StageRun` are **deferred to Phase 2** (routing) — Phase 1 needs no routing fields. Add them in Phase 2 to keep this diff scoped.

4. Run: `pnpm --filter @harness-engineering/types exec vitest run src/workflow.test.ts` — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
6. Commit: `feat(types): add WorkflowExecutionPlan + StageRun (split-routing P1)`

### Task 3: Barrel-export the new types

**Depends on:** Task 2 | **Files:** `packages/types/src/index.ts` | **Category:** integration

1. In `packages/types/src/index.ts`, extend the workflow re-export block (`index.ts:18-25`) to add `WorkflowExecutionPlan` and `StageRun`:
   ```ts
   export type {
     WorkflowStep,
     Workflow,
     StepOutcome,
     WorkflowStepResult,
     WorkflowResult,
     WorkflowExecutionPlan,
     StageRun,
   } from './workflow';
   ```
2. Run: `pnpm generate:barrels` (regenerate if any generated barrel exists) — if it reports no changes or the file is hand-maintained, skip. Then `pnpm --filter @harness-engineering/types build`.
3. Verify the export resolves from the package entry:
   ```
   pnpm --filter @harness-engineering/orchestrator exec node -e "const t=require('@harness-engineering/types'); console.log('ok')"
   ```
   (Type-only exports won't appear at runtime; the check is that the import path resolves + build passes.)
4. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
5. Commit: `feat(types): barrel-export WorkflowExecutionPlan + StageRun (split-routing P1)`

### Task 4 (TDD): Add optional workflow fields to `RunningEntry`

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/types/internal.ts`, `packages/orchestrator/src/types/internal.test.ts`

1. Write/append a shape test at `packages/orchestrator/src/types/internal.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import type { RunningEntry } from './internal';

   describe('RunningEntry workflow fields (split-routing P1)', () => {
     it('accepts optional workflow/currentStageIndex/stageRuns; non-workflow entries omit them', () => {
       const nonWorkflow = { issueId: 'i', workflow: undefined } as Partial<RunningEntry>;
       const workflowEntry = {
         issueId: 'i',
         currentStageIndex: 1,
         stageRuns: [{ index: 0, step: { skill: 's', produces: 'a' } }],
       } as Partial<RunningEntry>;
       expect(nonWorkflow.workflow).toBeUndefined();
       expect(workflowEntry.stageRuns).toHaveLength(1);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/types/internal.test.ts` — observe FAILURE (fields not on type).
3. In `packages/orchestrator/src/types/internal.ts`, add to the top imports:
   ```ts
   import type { WorkflowExecutionPlan, StageRun } from '@harness-engineering/types';
   ```
   and append to the `RunningEntry` interface (after `lastRoutedTier?`, `internal.ts:59`) — all optional so non-workflow entries are unchanged (D3/D5/D11):
   ```ts
     /** split-routing: the plan this unit is running staged, if any. Engine-owned. */
     workflow?: WorkflowExecutionPlan;
     /** split-routing: the stage index currently executing. Engine-owned. */
     currentStageIndex?: number;
     /**
      * split-routing: per-stage runs. The per-stage session/abort live HERE
      * (C1), never in the issue-level `session` field above.
      */
     stageRuns?: StageRun[];
   ```
4. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/types/internal.test.ts` — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
6. Commit: `feat(orchestrator): add optional workflow fields to RunningEntry (split-routing P1)`

### Task 5 (TDD): Define `WorkflowEngineContext` + `stageAttemptKey` helper

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

1. Create the test `packages/orchestrator/src/workflow/execute-workflow.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { stageAttemptKey } from './execute-workflow';

   describe('stageAttemptKey (split-routing P1)', () => {
     it('produces distinct recorder attempt keys per (stageIndex, attempt) so streams do not clobber', () => {
       const keys = [
         stageAttemptKey(0, 0),
         stageAttemptKey(1, 0),
         stageAttemptKey(2, 0),
         stageAttemptKey(0, 1),
       ];
       expect(new Set(keys).size).toBe(4);
       // encoding is monotonic-per-stage and leaves room for the Phase-3 retry attempt
       expect(stageAttemptKey(0, 0)).toBe(0);
       expect(stageAttemptKey(1, 0)).toBe(1000);
       expect(stageAttemptKey(0, 1)).toBe(1);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/execute-workflow.test.ts` — observe FAILURE (module missing).
3. Create `packages/orchestrator/src/workflow/execute-workflow.ts` with the context interface + helper (no engine yet):

   ```ts
   import type {
     AgentBackend,
     AgentEvent,
     WorkflowExecutionPlan,
     StageRun,
   } from '@harness-engineering/types';
   import type { StreamRecorder } from '../core/stream-recorder';
   import type { StructuredLogger } from '../logging/logger';

   /**
    * Narrow surface the stage-execution engine needs. The Orchestrator will
    * implement this in Phase 4 when dispatchIssue wires the branch; the engine
    * must NOT import orchestrator.ts (layer cycle). Phase 1 tests inject a fake.
    */
   export interface WorkflowEngineContext {
     recorder: StreamRecorder;
     logger: StructuredLogger;
     /** issueId of the coherence unit — used for recorder keys + terminal transitions. */
     issueId: string;
     identifier: string;
     externalId: string | null;
     workspacePath: string;
     /** Build a runner for a stage's routed backend. Phase 1: single stubbed backend. */
     makeRunner(backend: AgentBackend): {
       runSession: (
         issue: unknown,
         ws: string,
         prompt: string
       ) => AsyncGenerator<
         AgentEvent,
         {
           sessionId: string;
           usage: { inputTokens: number; outputTokens: number; totalTokens: number };
         },
         void
       >;
     };
     /** Phase 1 stub: resolve the single backend for a stage (Phase 2 replaces with route()). */
     resolveStageBackend(step: WorkflowExecutionPlan['stages'][number]): AgentBackend;
     /** Terminal success — exactly one running/claimed delete + one lane persist (D6). */
     emitWorkflowSuccess(unit: string, runs: StageRun[]): Promise<void>;
     /** Terminal failure/safety-net — exactly one running/claimed delete + one lane persist (D6/I1). */
     finalizeWorkflowTerminal(
       unit: string,
       runs: StageRun[],
       failingStep?: WorkflowExecutionPlan['stages'][number],
       err?: unknown
     ): Promise<void>;
   }

   /**
    * Derive a StreamRecorder attempt key from (stageIndex, attempt). The recorder
    * is keyed by (issueId, attempt) only (stream-recorder.ts:99,164,190,386) — it
    * has NO stageIndex parameter — so we encode the stage into the attempt integer
    * to keep N stages' recordings from clobbering, WITHOUT modifying StreamRecorder.
    * attempt is 0 in Phase 1; Phase 3 uses 0|1 for the engine retry cap.
    */
   export function stageAttemptKey(stageIndex: number, attempt: number): number {
     return stageIndex * 1000 + attempt;
   }
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/execute-workflow.test.ts` — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
6. Commit: `feat(orchestrator): add WorkflowEngineContext + stageAttemptKey (split-routing P1)`

### Task 6 (TDD): Implement `runStageSession` — engine-owned per-stage session/recorder/abort/tokens (C1 core)

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

1. Append a test that drives one stage through a fake backend yielding a `usage` event and returning a distinct `sessionId`, asserting the `StageRun` captures per-stage `sessionId` + `tokens`, and that the recorder was called with the `stageAttemptKey`:
   ```ts
   import { runStageSession } from './execute-workflow';
   // build a fake WorkflowEngineContext with a recorder spy (record start/finish attempt args)
   // and a makeRunner whose runSession yields { type:'usage', usage:{inputTokens:100,outputTokens:50,totalTokens:150} }
   // then returns { sessionId: `sess-${stageIndex}`, usage:{...} }.
   it('captures per-stage sessionId + tokens and records under the stage attempt key (SC1-b/-d)', async () => {
     // ...arrange fake ctx with startRecording/finishRecording spies...
     const run = await runStageSession(
       ctx,
       'issue-1',
       /*index*/ 1,
       /*attempt*/ 0,
       step,
       backend,
       /*priorOutputs*/ {}
     );
     expect(run.sessionId).toBe('sess-1');
     expect(run.tokens).toEqual({ input: 100, output: 50, total: 150 });
     expect(startRecordingSpy).toHaveBeenCalledWith(
       'issue-1',
       null,
       expect.any(String),
       expect.any(String),
       1000,
       expect.anything()
     );
     expect(finishRecordingSpy).toHaveBeenCalledWith('issue-1', 1000, 'normal', expect.anything());
   });
   ```
2. Run the test — observe FAILURE (`runStageSession` undefined).
3. Implement `runStageSession` in `execute-workflow.ts`. It drives `runSession` **directly**, owns a per-stage `AbortController` (held locally / to be stored in `stageRuns[index]` by the loop), accrues `event.usage` into per-stage totals, and captures the return value's `sessionId`. It calls `recorder.startRecording`/`recordEvent`/`finishRecording` with `stageAttemptKey(index, attempt)` — **never** the issue-level `session` field or `this.abortControllers`:
   ```ts
   export async function runStageSession(
     ctx: WorkflowEngineContext,
     unit: string,
     index: number,
     attempt: number,
     step: WorkflowExecutionPlan['stages'][number],
     backend: AgentBackend,
     _priorOutputs: Record<string, unknown>
   ): Promise<StageRun> {
     const key = stageAttemptKey(index, attempt);
     const abort = new AbortController(); // C1: per-stage abort, NOT ctx-level abortControllers
     const startedAt = Date.now();
     let input = 0,
       output = 0,
       total = 0;
     ctx.recorder.startRecording(
       ctx.issueId,
       ctx.externalId,
       ctx.identifier,
       backend.name,
       key,
       step.skill
     );
     const runner = ctx.makeRunner(backend);
     // Phase 1: prompt is a stub derived from the step; Phase 2/4 render real per-stage prompts.
     const gen = runner.runSession(undefined, ctx.workspacePath, step.skill);
     let ret: {
       sessionId: string;
       usage: { inputTokens: number; outputTokens: number; totalTokens: number };
     };
     while (true) {
       const n = await gen.next();
       if (n.done) {
         ret = n.value;
         break;
       }
       const ev = n.value as AgentEvent;
       ctx.recorder.recordEvent(ctx.issueId, key, ev);
       if (ev.usage) {
         input += ev.usage.inputTokens;
         output += ev.usage.outputTokens;
         total += ev.usage.totalTokens;
       }
       if (abort.signal.aborted) break;
     }
     ctx.recorder.finishRecording(ctx.issueId, key, 'normal', {
       inputTokens: input,
       outputTokens: output,
       turnCount: 0,
     });
     return {
       index,
       step,
       sessionId: ret!.sessionId,
       tokens: { input, output, total },
       outcome: 'pass', // Phase 1: no gates/routing — every stage passes (Phase 3 adds gate eval)
       attempt,
       durationMs: Date.now() - startedAt,
     };
   }
   ```
   Add `import type { AgentBackend } from '@harness-engineering/types';` if not already imported. Note: prompt rendering + real gate/pass evaluation are Phase 3/4; Phase 1 proves the per-stage state ownership only.
4. Run the test — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
6. Commit: `feat(orchestrator): runStageSession owns per-stage session/recorder/tokens (C1/split-routing P1)`

### Task 7 (TDD): Implement `executeWorkflow` sequential loop — SC1 (order + per-stage state)

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.ts`, `packages/orchestrator/src/workflow/execute-workflow.test.ts`

1. Append a test: a 3-stage plan, backends returning `sess-0`/`sess-1`/`sess-2` and distinct usage; assert (a) stages ran in order (record a `runOrder` array in the fake `makeRunner`), (b) `emitWorkflowSuccess` called exactly once with 3 `StageRun`s each having its own `sessionId` + `tokens`, (c) `finalizeWorkflowTerminal` NOT called, (d) all stages ran on the same `ctx.workspacePath`:
   ```ts
   it('runs 3 stages in order on one worktree, each with its own sessionId+tokens, one success exit (SC1)', async () => {
     const { ctx, runOrder, successCalls, terminalCalls } = makeCtx(['sess-0', 'sess-1', 'sess-2']);
     const plan = { coherenceUnit: 'issue-1', stages: [step('a'), step('b'), step('c')] };
     await executeWorkflow(ctx, plan);
     expect(runOrder).toEqual([0, 1, 2]);
     expect(successCalls).toHaveLength(1);
     expect(terminalCalls).toHaveLength(0);
     const runs = successCalls[0];
     expect(runs.map((r: any) => r.sessionId)).toEqual(['sess-0', 'sess-1', 'sess-2']);
     expect(new Set(runs.map((r: any) => r.tokens.total)).size).toBeGreaterThan(0);
   });
   ```
2. Run — observe FAILURE (`executeWorkflow` undefined).
3. Implement `executeWorkflow` (Phase 1: single attempt, no retry/routing; stores per-stage runs into `RunningEntry.stageRuns` via ctx if wired, but Phase 1 keeps the runs local and hands them to the terminal callbacks):

   ```ts
   export async function executeWorkflow(
     ctx: WorkflowEngineContext,
     plan: WorkflowExecutionPlan
   ): Promise<void> {
     const runs: StageRun[] = [];
     try {
       for (const [index, step] of plan.stages.entries()) {
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
         runs.push(run);
         // Phase 1 has no gates → runs never fail; Phase 3 adds: if (run.outcome !== 'pass') return finalizeWorkflowTerminal(...)
       }
       return await ctx.emitWorkflowSuccess(plan.coherenceUnit, runs); // D6: one success exit
     } catch (err) {
       // I1 safety net: any throw in the loop → exactly one terminal transition, no orphan
       return await ctx.finalizeWorkflowTerminal(plan.coherenceUnit, runs, undefined, err);
     }
   }

   function priorOutputs(_runs: StageRun[]): Record<string, unknown> {
     // Phase 1 stub; Phase 2/D4 threads produces→expects across the shared worktree.
     return {};
   }
   ```

4. Run — observe PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
6. Commit: `feat(orchestrator): executeWorkflow sequential loop, one success exit (SC1/split-routing P1)`

### Task 8 (TDD): SC5 — forced throw between stages drives exactly one terminal transition, no orphan

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.test.ts`

1. Append the SC5 regression test. The fake `ctx.resolveStageBackend` (or `makeRunner`) is rigged to **throw on stage index 1**. Wire the fake `emitWorkflowSuccess`/`finalizeWorkflowTerminal` over a tiny in-memory `state` with `running: Set` + `claimed: Set` seeded with `'issue-1'`, so the test can assert no orphan remains:
   ```ts
   it('a throw between stages → exactly one finalizeWorkflowTerminal, no orphaned running/claimed (SC5)', async () => {
     const running = new Set(['issue-1']);
     const claimed = new Set(['issue-1']);
     const terminalCalls: any[] = [];
     const successCalls: any[] = [];
     const ctx = makeThrowingCtx({
       throwAtIndex: 1,
       onSuccess: (u, r) => {
         successCalls.push(r);
         running.delete(u);
         claimed.delete(u);
       },
       onTerminal: (u, r) => {
         terminalCalls.push(r);
         running.delete(u);
         claimed.delete(u);
       },
     });
     const plan = { coherenceUnit: 'issue-1', stages: [step('a'), step('b'), step('c')] };
     await expect(executeWorkflow(ctx, plan)).resolves.toBeUndefined(); // engine swallows into terminal, does not rethrow
     expect(successCalls).toHaveLength(0);
     expect(terminalCalls).toHaveLength(1); // exactly one terminal transition
     expect(running.has('issue-1')).toBe(false); // no orphaned running (reconciliation would NOT clear this — state-machine.ts:288-303)
     expect(claimed.has('issue-1')).toBe(false); // no orphaned claimed
   });
   ```
2. Run — observe it PASSES against the Task-7 implementation (the `try/finally`/catch already routes the throw to `finalizeWorkflowTerminal`). If it FAILS (e.g. the throw escapes), fix `executeWorkflow` so the catch is total and never rethrows — the whole body must be inside the `try`.
3. Add a second assertion case: `emitWorkflowSuccess` itself throwing must NOT leave an orphan either (the success path is inside the `try`, so its throw also falls to the terminal catch). Assert `terminalCalls` length is 1 and no orphan.
4. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/execute-workflow.test.ts` — observe all PASS.
5. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
6. Commit: `test(orchestrator): SC5 forced-throw single-terminal-exit + no orphan (split-routing P1)`

### Task 9: SC1-c guard — assert the engine never writes the issue-level `session`

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/workflow/execute-workflow.test.ts`

1. Append a test proving C1's negative invariant: give the fake `ctx` a `running` map holding a `RunningEntry`-like object with a sentinel `session` value; run a 2-stage `executeWorkflow`; assert the issue-level `session` sentinel is **unchanged** after execution (the engine only touches per-stage state), and that per-stage `sessionId`s are distinct from the issue-level sentinel:
   ```ts
   it('never mutates the issue-level RunningEntry.session (C1/SC1-c)', async () => {
     const sentinel = { sessionId: 'ISSUE-LEVEL-DO-NOT-TOUCH' };
     const { ctx, running } = makeCtxWithRunning('issue-1', sentinel, ['sess-0', 'sess-1']);
     await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [step('a'), step('b')] });
     expect(running.get('issue-1').session).toBe(sentinel);
     expect(running.get('issue-1').session.sessionId).toBe('ISSUE-LEVEL-DO-NOT-TOUCH');
   });
   ```
2. Run — observe PASS (Phase-1 engine has no code path writing `entry.session`; the fake `ctx` surface intentionally exposes no setter for it).
3. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/execute-workflow.test.ts` — all PASS.
4. Run: `node packages/cli/dist/bin/harness.js validate` — no new failures.
5. Commit: `test(orchestrator): assert engine never writes issue-level session (C1/split-routing P1)`

### Task 10: Non-regression + full validate/check-deps (SC8 slice)

**Depends on:** Task 9 | **Files:** none (verification) | **Category:** integration

1. Confirm `AdaptiveRouter`/`BackendRouter` are byte-unchanged:
   ```
   git diff --stat 55cfdc46d -- packages/orchestrator/src/agent/adaptive-router.ts packages/orchestrator/src/agent/backend-router.ts
   ```
   Expect **empty output** (no changes). If non-empty, revert those files — they are out of scope (AMR D2/SC8).
2. Confirm `dispatchIssue`, `runAgentInBackgroundTask`, `emitWorkerExit`, `finalizeRoutingTerminal` are unchanged:
   ```
   git diff --stat 55cfdc46d -- packages/orchestrator/src/orchestrator.ts
   ```
   Expect **empty output** — Phase 1 does not wire the engine into `dispatchIssue`.
3. Run the orchestrator + types test suites:
   ```
   pnpm --filter @harness-engineering/types exec vitest run
   pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow src/types src/agent
   ```
   Expect all PASS (new workflow tests + unchanged agent/type tests).
4. Run: `node packages/cli/dist/bin/harness.js validate` (no new failures beyond the pre-existing dashboard-CSS baseline) and `node packages/cli/dist/bin/harness.js check-deps` (expect `validation passed`).
5. Commit (if step 1-2 required any revert; otherwise no commit): `chore(split-routing): confirm SC8 non-regression for Phase 1`

## Sequencing / Dependencies

Strict chain: Task 1 → 2 → 3 (types + barrel) → 4 (RunningEntry, needs barrel-exported types) → 5 (context + key) → 6 (`runStageSession`) → 7 (`executeWorkflow` loop) → 8 (SC5 throw) → 9 (SC1-c guard) → 10 (non-regression). All share `execute-workflow.ts`/`.test.ts` after Task 5, so they cannot parallelize (file overlap). Tasks 1-4 could theoretically interleave but the barrel/type dependency keeps them ordered. Total ~40 min.

## Uncertainties

- **[ASSUMPTION]** `pnpm generate:barrels` either regenerates or is a no-op for `packages/types` (the workflow re-export block in `index.ts` is hand-maintained — Task 3 edits it directly and treats `generate:barrels` as best-effort). If a generated barrel exists and conflicts, Task 3 step 2 catches it.
- **[ASSUMPTION]** The `WorkflowEngineContext` surface (Task 5) is right for Phase 1's tests; the **real** Orchestrator implementation is Phase 4 (`dispatchIssue` branch). If Phase 4 finds the surface insufficient, that is a Phase-4 refinement, not a Phase-1 defect — the engine's logic (loop, per-stage ownership, try/finally) is independent of who supplies `ctx`.
- **[DEFERRABLE]** Real per-stage prompt rendering (`renderer.render`), `produces→expects` artifact threading (D4), and gate/pass evaluation are Phase 2/3 — Phase 1 stubs the prompt (`step.skill`) and marks every stage `pass`.
- **[DEFERRABLE — reported concern]** `stopIssue` cannot abort an in-flight workflow stage in Phase 1 (per-stage `AbortController` is engine-local, not in `this.abortControllers`). Unit-level stop/deadline wiring is Phase 3 (D12).

## Harness Integration

- `harness validate` runs in every task; `harness check-deps` in Task 10. Note: repo `validate` currently reports ~409 pre-existing dashboard-CSS design-token warnings (baseline noise, unrelated to types/orchestrator) — tasks assert "no NEW failures," not zero.
- CLI invoked as `node packages/cli/dist/bin/harness.js …` (the PATH `harness` is the global npm install, not this repo's source — per repo memory).
- Plan committed at planning time (Phase 4 step 8).
