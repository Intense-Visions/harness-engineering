# Plan: On-Demand Maintenance Pipeline — Phase 1 (Run mode for `TaskRunner`)

**Date:** 2026-06-27 | **Spec:** `docs/changes/maintenance-pipeline/proposal.md` | **Tasks:** 5 | **Time:** ~22 min | **Integration Tier:** medium

## Goal

Thread a `mode: 'report' | 'fix'` parameter (default `'fix'`) through the existing
`TaskRunner.run` so the same executor serves both the cron scheduler (fix) and the
future CLI (report); in `report` mode, mechanical-AI and pure-AI tasks compute/record
findings but never dispatch a fix agent or open a PR. This realizes decision D4
("one executor, two callers") and leaves the scheduler call site unchanged.

## Scope

Phase 1 ONLY. Out of scope (later phases): overdue computation / `selectTasks`,
`excludeFromHumanSweep`, the CLI `run` subcommand, the skill wrapper, docs/guides.

## Observable Truths (Acceptance Criteria)

1. `TaskRunner.run` accepts a third positional arg `mode: RunMode = 'fix'`; the
   public type `RunMode = 'report' | 'fix'` is exported from
   `@harness-engineering/orchestrator` (root barrel), next to `RunOrigin`.
2. When a `mechanical-ai` task is run with `mode: 'report'` and the check reports
   `findings > 0`, the system shall record `result.findings` equal to that count,
   set `status: 'no-issues'`, leave `prUrl` null, and NOT call
   `agentDispatcher.dispatch` nor `prManager.ensureBranch`.
3. When a `pure-ai` task is run with `mode: 'report'`, the system shall NOT call
   `agentDispatcher.dispatch` nor `prManager.ensureBranch`, returning
   `status: 'no-issues'`, `findings: 0`.
4. When `run` is called WITHOUT a `mode` argument (or with `'fix'`), behavior is the
   current behavior verbatim: mechanical-AI dispatches on findings, pure-AI always
   dispatches. (Existing `tests/maintenance/task-runner.test.ts` stays green.)
5. The scheduler call site `packages/orchestrator/src/orchestrator.ts:794`
   (`await taskRunner.run(task)`) is unchanged and existing
   `tests/maintenance/scheduler.test.ts` stays green.
6. An ADR records D4 ("single maintenance executor, two callers (cron + CLI) via
   run mode") under `docs/knowledge/decisions/`.

## Grounding (verified against the worktree)

- `packages/orchestrator/src/maintenance/task-runner.ts`
  - `async run(task, origin: RunOrigin = 'cron'): Promise<RunResult>` at **line 173**.
  - Switch dispatches to `runMechanicalAI` (**307**), `runPureAI` (**432**),
    `runReportOnly` (**497**), `runHousekeeping` (**565**).
  - Mechanical no-dispatch early-return at **line 347**:
    `if (check.findings === 0 || wakeAgentExplicitlyFalse) { ... status: 'no-issues' ... }`.
    Report mode reuses exactly this skip path.
  - `import type { TaskDefinition, RunResult, RunOrigin } from './types';` at line 2.
- `packages/orchestrator/src/maintenance/types.ts` — `RunOrigin` at line 28,
  `TaskDefinition` at line 57, `RunResult` at line 101. Add `RunMode` near `RunOrigin`.
- Scheduler call site is in `orchestrator.ts:794` (NOT `scheduler.ts`); default
  `'fix'` keeps it unchanged.
- Test conventions: `packages/orchestrator/tests/maintenance/task-runner.test.ts`
  — mock factories `createMockCheckRunner` / `createMockAgentDispatcher` /
  `createMockPRManager`, `createRunnerOptions(overrides)`, `ARCH_TASK` const
  (mechanical-ai) at line 63; pure-ai `DEAD_CODE_TASK` defined inside the
  `describe('pure-ai tasks')` block (line 179) — so report-mode tests define their
  own local task consts.
- `report-only` already never dispatches; `housekeeping` is excluded from the human
  sweep at the Phase 2 selection layer — neither is modified in this phase.

## File Map

- MODIFY `packages/orchestrator/src/maintenance/types.ts` (add `RunMode`)
- MODIFY `packages/orchestrator/src/index.ts` (export `RunMode`)
- MODIFY `packages/orchestrator/src/maintenance/task-runner.ts` (thread `mode`)
- MODIFY `packages/orchestrator/tests/maintenance/task-runner.test.ts` (new tests)
- CREATE `docs/knowledge/decisions/0049-single-maintenance-executor-run-mode.md`

## Uncertainties

- [DEFERRABLE] `housekeeping` in report mode is NOT guarded in this phase — its
  git-mutating tasks (`main-sync`, etc.) are kept out of the human/report path by the
  Phase 2 `excludeFromHumanSweep` selection layer, not by the executor. Documented in
  the ADR's "report-mode safety contract" as a concern; revisit if a future caller
  passes a housekeeping task in report mode.
- [ASSUMPTION] `pure-ai` report mode short-circuits before `fixSkill`/`branch`
  validation (report mode uses neither). A misconfigured pure-ai task therefore does
  not surface a `failure` in report mode — acceptable since report mode never
  dispatches. Stated in the ADR.

## Skeleton

_Not produced — task count (5) is below the standard-rigor skeleton threshold (8)._

## Tasks

### Task 1: Add `RunMode` type and barrel export

**Depends on:** none | **Files:** `packages/orchestrator/src/maintenance/types.ts`, `packages/orchestrator/src/index.ts`

Type-only change; verified by build/typecheck (no runtime test needed for a type alias).

1. In `packages/orchestrator/src/maintenance/types.ts`, immediately AFTER the
   `RunOrigin` union (ends at line 32, the closing of the `{ kind: 'chain'; ... }`
   member), add:

   ```ts
   /**
    * Run mode for a maintenance task (on-demand pipeline, D4).
    *
    * - 'fix'    — current cron behavior: mechanical-ai dispatches on findings,
    *              pure-ai always dispatches, PRs may be opened. Default.
    * - 'report' — read-only sweep: run the check step, record findings, and take
    *              the no-dispatch branch — never dispatch a fix agent or open a PR.
    */
   export type RunMode = 'report' | 'fix';
   ```

2. In `packages/orchestrator/src/index.ts` line 67, extend the existing re-export to
   include `RunMode` alongside `RunOrigin`:

   ```ts
   export type { TaskDefinition, TaskType, RunOrigin, RunMode } from './maintenance/types';
   ```

3. Typecheck/build: `pnpm --filter @harness-engineering/orchestrator build`
4. Run: `harness validate`
5. Commit: `feat(maintenance): add RunMode type for on-demand run mode (D4)`

### Task 2: Thread `mode` through `run` + report mode for mechanical-AI (TDD)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/task-runner.test.ts`, `packages/orchestrator/src/maintenance/task-runner.ts`

1. Add a new `describe` block to
   `packages/orchestrator/tests/maintenance/task-runner.test.ts` (place it after the
   existing top-level `describe('TaskRunner', ...)` block closes, or as a nested
   block at the end inside it — keep it top-level for clarity):

   ```ts
   describe('TaskRunner run mode (D4)', () => {
     const MECH_TASK: TaskDefinition = {
       id: 'arch-violations',
       type: 'mechanical-ai',
       description: 'Detect and fix architecture violations',
       schedule: '0 2 * * *',
       branch: 'harness-maint/arch-fixes',
       checkCommand: ['check-arch'],
       fixSkill: 'harness-arch-fix',
     };

     it('mechanical-ai: report mode records findings but never dispatches', async () => {
       const checkRunner = createMockCheckRunner({ findings: 5, passed: false });
       const agentDispatcher = createMockAgentDispatcher();
       const prManager = createMockPRManager();
       const runner = new TaskRunner(
         createRunnerOptions({ checkRunner, agentDispatcher, prManager })
       );

       const result = await runner.run(MECH_TASK, 'cli', 'report');

       expect(result.findings).toBe(5);
       expect(result.status).toBe('no-issues');
       expect(result.prUrl).toBeNull();
       expect(checkRunner.run).toHaveBeenCalledWith(['check-arch'], '/test/project');
       expect(agentDispatcher.dispatch).not.toHaveBeenCalled();
       expect(prManager.ensureBranch).not.toHaveBeenCalled();
     });

     it('mechanical-ai: omitting mode defaults to fix and still dispatches', async () => {
       const checkRunner = createMockCheckRunner({ findings: 5, passed: false });
       const agentDispatcher = createMockAgentDispatcher({ producedCommits: true, fixed: 3 });
       const runner = new TaskRunner(createRunnerOptions({ checkRunner, agentDispatcher }));

       const result = await runner.run(MECH_TASK); // no mode arg -> 'fix'

       expect(result.status).toBe('success');
       expect(agentDispatcher.dispatch).toHaveBeenCalled();
     });
   });
   ```

2. Run the test — observe the report-mode test FAIL (dispatch is called):
   `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/task-runner.test.ts`
3. In `packages/orchestrator/src/maintenance/task-runner.ts`:
   - Line 2: extend the import to include `RunMode`:
     ```ts
     import type { TaskDefinition, RunResult, RunOrigin, RunMode } from './types';
     ```
   - Change the `run` signature (line 173) to:
     ```ts
     async run(
       task: TaskDefinition,
       origin: RunOrigin = 'cron',
       mode: RunMode = 'fix'
     ): Promise<RunResult> {
     ```
   - In the `switch`, pass `mode` to the mechanical-ai path (line 180):
     ```ts
     case 'mechanical-ai': {
       const out = await this.runMechanicalAI(task, startedAt, mode);
       result = out.result;
       captured = out.captured;
       break;
     }
     ```
   - Change `runMechanicalAI` signature (line 307) to accept `mode`:
     ```ts
     private async runMechanicalAI(
       task: TaskDefinition,
       startedAt: string,
       mode: RunMode = 'fix'
     ): Promise<RunOutcome> {
     ```
   - Extend the no-dispatch early-return condition (line 347) to force the skip path
     in report mode:
     ```ts
     if (check.findings === 0 || wakeAgentExplicitlyFalse || mode === 'report') {
     ```
4. Run the test — observe PASS:
   `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/task-runner.test.ts`
5. Run: `harness validate`
6. Commit: `feat(maintenance): thread report mode through mechanical-ai path (D4)`

### Task 3: Report mode for pure-AI (TDD)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/tests/maintenance/task-runner.test.ts`, `packages/orchestrator/src/maintenance/task-runner.ts`

1. Add two tests inside the `describe('TaskRunner run mode (D4)', ...)` block created
   in Task 2:

   ```ts
   const PURE_TASK: TaskDefinition = {
     id: 'dead-code',
     type: 'pure-ai',
     description: 'Find and remove dead code',
     schedule: '0 2 * * 0',
     branch: 'harness-maint/dead-code',
     fixSkill: 'harness-codebase-cleanup',
   };

   it('pure-ai: report mode never dispatches and opens no PR', async () => {
     const agentDispatcher = createMockAgentDispatcher({ producedCommits: true, fixed: 2 });
     const prManager = createMockPRManager();
     const runner = new TaskRunner(createRunnerOptions({ agentDispatcher, prManager }));

     const result = await runner.run(PURE_TASK, 'cli', 'report');

     expect(result.status).toBe('no-issues');
     expect(result.findings).toBe(0);
     expect(result.prUrl).toBeNull();
     expect(agentDispatcher.dispatch).not.toHaveBeenCalled();
     expect(prManager.ensureBranch).not.toHaveBeenCalled();
   });

   it('pure-ai: omitting mode defaults to fix and still dispatches', async () => {
     const agentDispatcher = createMockAgentDispatcher({ producedCommits: true, fixed: 2 });
     const runner = new TaskRunner(createRunnerOptions({ agentDispatcher }));

     const result = await runner.run(PURE_TASK); // no mode arg -> 'fix'

     expect(result.status).toBe('success');
     expect(agentDispatcher.dispatch).toHaveBeenCalled();
   });
   ```

2. Run the test — observe the report-mode pure-ai test FAIL (dispatch is called):
   `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/task-runner.test.ts`
3. In `packages/orchestrator/src/maintenance/task-runner.ts`:
   - Pass `mode` to the pure-ai path in the `switch` (line 185-186):
     ```ts
     case 'pure-ai':
       result = await this.runPureAI(task, startedAt, mode);
       break;
     ```
   - Change `runPureAI` signature (line 432) to accept `mode`:
     ```ts
     private async runPureAI(
       task: TaskDefinition,
       startedAt: string,
       mode: RunMode = 'fix'
     ): Promise<RunResult> {
     ```
   - As the FIRST statement inside `runPureAI` (before the `fixSkill`/`branch`
     validation), add the report-mode short-circuit:
     ```ts
     if (mode === 'report') {
       // Report mode: pure-ai has no check step and never dispatches.
       return {
         taskId: task.id,
         startedAt,
         completedAt: new Date().toISOString(),
         status: 'no-issues',
         findings: 0,
         fixed: 0,
         prUrl: null,
         prUpdated: false,
       };
     }
     ```
4. Run the test — observe PASS:
   `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/task-runner.test.ts`
5. Run: `harness validate`
6. Commit: `feat(maintenance): add report mode short-circuit for pure-ai path (D4)`

### Task 4: Regression — confirm scheduler path and full suite green

**Depends on:** Task 3 | **Files:** none (verification only)

`[checkpoint:human-verify]` — Confirm the unchanged-scheduler invariant before moving on.

1. Confirm the scheduler call site is unchanged (still `await taskRunner.run(task)`):
   `grep -n "taskRunner.run(task)" packages/orchestrator/src/orchestrator.ts`
   (expect the single hit at line 794, with no `mode` argument).
2. Run the scheduler suite — observe GREEN (spec requirement):
   `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/scheduler.test.ts`
3. Run the full maintenance task-runner suites — observe GREEN:
   `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/task-runner.test.ts tests/maintenance/task-runner.report-only-status.test.ts`
4. Run: `harness validate`
5. No commit (verification only). If any suite is red, return to the relevant task.

### Task 5: Write ADR for D4 (single executor, two callers)

**Depends on:** Task 4 | **Files:** `docs/knowledge/decisions/0049-single-maintenance-executor-run-mode.md` | **Category:** integration

`[checkpoint:human-verify]` — Architectural record; human reviews the decision text before commit.

1. Create `docs/knowledge/decisions/0049-single-maintenance-executor-run-mode.md`
   following the numbered ADR convention in that directory (next number after 0048):

   ```markdown
   # 0049 — Single maintenance executor, two callers, via a run mode

   - **Status:** Accepted
   - **Date:** 2026-06-27
   - **Spec:** docs/changes/maintenance-pipeline/proposal.md (D4)

   ## Context

   The maintenance subsystem already separates per-task execution (`TaskRunner`)
   from scheduling (`MaintenanceScheduler`). The on-demand pipeline needs a
   human-invoked, report-first path that runs the SAME registered tasks without an
   orchestrator/gateway. The alternative — a second executor for the CLI — would
   create a parallel definition of "how a maintenance task runs" that drifts from
   the cron path.

   ## Decision

   Thread a `RunMode = 'report' | 'fix'` parameter through the existing
   `TaskRunner.run(task, origin, mode = 'fix')`. There is exactly one executor with
   two callers: the cron scheduler (`'fix'`) and the future CLI (`'report'`).
   `'fix'` is the default, so the scheduler call site is unchanged.

   - `'report'`: mechanical-ai runs its check and reuses the existing no-dispatch
     skip path (records findings, status `no-issues`, no PR); pure-ai short-circuits
     to a no-dispatch result. Never dispatches a fix agent or opens a PR.
   - `'fix'`: current behavior verbatim.

   ## Report-mode safety contract

   Report mode assumes a task's check step is side-effect-free (or writes only to
   its own `.harness/maintenance/<id>/` output dir). `housekeeping` tasks
   (git-mutating, e.g. `main-sync`) are NOT guarded by the executor in report mode;
   they are kept out of the human/report path by the Phase 2 `excludeFromHumanSweep`
   selection layer. A `pure-ai` report run short-circuits before `fixSkill`/`branch`
   validation, so a misconfigured pure-ai task does not surface as a failure in
   report mode (report mode uses neither field).

   ## Consequences

   - No parallel executor; the registry stays the single source of truth.
   - Future maintenance checks must honor the side-effect-free check contract or set
     `excludeFromHumanSweep` (added in Phase 2).
   ```

2. Run: `harness validate`
3. Commit: `docs(maintenance): ADR 0049 single executor run mode (D4)`

## Sequencing

1 (types) -> 2 (mechanical) -> 3 (pure-ai) -> 4 (regression checkpoint) -> 5 (ADR).
Strictly linear: Task 2's signature change is a prerequisite for Task 3's switch edit.
Each task ends in a commit (or, for Task 4, a verification gate) so a concurrent
HEAD reset loses at most one task.

## Traceability

| Observable Truth                  | Task(s) |
| --------------------------------- | ------- |
| 1 (RunMode type + barrel)         | 1       |
| 2 (mechanical report no-dispatch) | 2       |
| 3 (pure-ai report no-dispatch)    | 3       |
| 4 (default fix verbatim)          | 2, 3    |
| 5 (scheduler unchanged + green)   | 4       |
| 6 (ADR for D4)                    | 5       |
