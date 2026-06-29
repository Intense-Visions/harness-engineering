# Plan: Maintenance Pipeline — Phase 3 (CLI `run` subcommand)

**Date:** 2026-06-27 | **Spec:** docs/changes/maintenance-pipeline/proposal.md (Technical Design "CLI surface", Decisions D2/D4, Success Criteria 1,2,3,6,8,9) | **Tasks:** 9 | **Time:** ~40 min | **Integration Tier:** medium

## Goal

Implement the deferred `harness maintenance run [taskId...]` subcommand: an infra-free, report-first on-demand sweep that selects overdue (or named/all) sweep-eligible tasks via `selectTasks`, runs them through the existing `TaskRunner` in `report` mode (parallel) or `fix` mode (sequential), writes a consolidated, sorted, machine-readable report to `.harness/maintenance/last-run-summary.json`, and returns CI-friendly exit codes — all without constructing an orchestrator, gateway, or `ClaimManager`.

## Scope

Phase 3 ONLY. The `TaskRunner` run mode (Phase 1) and `selectTasks` + `excludeFromHumanSweep` (Phase 2) are already shipped and barrel-exported. This phase wires the CLI surface on top of them. NOT in scope: the `harness-maintenance-pipeline` skill (Phase 4), docs/knowledge guides beyond the one ADR this phase owns (Phase 5), and any real AI-fix dispatch implementation (does not exist anywhere in the repo — see Grounding).

## Grounding (verified against actual code)

- **The orchestrator's own `AgentDispatcher` is a STUB.** `Orchestrator.createMaintenanceTaskRunner` (`packages/orchestrator/src/orchestrator.ts:686-699`) wires an `agentDispatcher` that logs "skill dispatch integration pending" and returns `{ producedCommits: false, fixed: 0 }`. A repo-wide search for a non-stub dispatch (`producedCommits: true` outside tests/dist) returns nothing. **There is no real fix-agent dispatch anywhere in the codebase.** Consequence for `--fix` scoping is documented in the Decisions section below.
- **`checkRunner` and `commandExecutor` are pure `child_process.execFile` wrappers** (`orchestrator.ts:662-683` and `:701-721`) — zero orchestrator infra, trivially reconstructable in the CLI. `checkRunner.run(command, cwd)` runs the check CLI and heuristically extracts a findings count; `commandExecutor.exec(command, cwd)` captures stdout.
- **Report mode never touches the dispatcher, prManager, or commandExecutor.** In `task-runner.ts`: mechanical-ai (`:355`) and pure-ai (`:457`) take the no-dispatch early-return under `mode === 'report'`; housekeeping (`:612`) returns `status: 'skipped'` under `mode === 'report'` before `commandExecutor`. So a CLI report-mode `TaskRunner` only needs a real `checkRunner` (+ optional `checkScriptRunner` for custom `checkScript` tasks) and an `outputStore`; `agentDispatcher`/`commandExecutor` can be no-op stubs (typed but uncalled), and `prManager` is omitted (the code guards every use with `if (this.prManager)`).
- **History is `RunResult[]` from `MaintenanceReporter`.** `MaintenanceReporter` (`packages/orchestrator/src/maintenance/reporter.ts`) reads `.harness/maintenance/history.json` via `.load()` and returns `RunResult[]` via `.getHistory(limit, offset)` (`:56-97`); `.record(result)` (`:84`) appends + persists. This is exactly the `history: RunResult[]` shape `selectTasks` consumes (`overdue.ts:128-144`). The CLI reads history through this class — no bespoke JSON parsing.
- **`selectTasks(tasks, history, { mode, ids?, now })`** is barrel-exported (`packages/orchestrator/src/index.ts:71`). `mode: 'overdue'|'all'|'ids'`. It filters `excludeFromHumanSweep !== true` in ALL modes and, for `ids`, silently drops named-but-excluded ids (`overdue.ts:133-143`). `now` is injected — deterministic.
- **Task resolution path already exists in `maintenance.ts`.** `loadMaintenanceConfig(cwd)` (`packages/cli/src/commands/maintenance.ts:29-38`, returns `null` when no `harness.orchestrator.md`) and `mergeResolvedTasks(config)` (`:40-46`) produce the resolved `TaskDefinition[]` (built-ins + customTasks, honoring `enabled:false` and schedule overrides). Phase 3 REUSES these — they must be exported from the module or the new code imports them. (They are currently file-local `function`s; this plan promotes the two needed by the new file to named exports.)
- **The `run` subcommand attaches to the existing builder.** `createMaintenanceCommand()` (`maintenance.ts:141-181`) is already wired via `_registry.ts:48,139`. Phase 3 adds a third `.command('run')` — no `_registry.ts` change.
- **Exit codes already exist with the right values.** `ExitCode` (`packages/cli/src/utils/errors.ts:4-11`): `SUCCESS=0`, `VALIDATION_FAILED=1`, `ERROR=2`. These map exactly onto the spec's `0` = completed, `1` = a task failed to execute, `2` = invalid invocation.
- **Testability pattern: extract a pure runner, thin-wrap the action.** `runScanConfig(cwd, opts): Promise<{ exitCode, results }>` (`packages/cli/src/commands/scan-config.ts`, tested in `packages/cli/tests/commands/scan-config.test.ts`) is the house pattern — the `.action()` calls `process.exit(result.exitCode)`; tests call the runner directly against a temp dir and assert `exitCode`. Phase 3 follows it verbatim with `runMaintenanceRun(cwd, opts, deps?)`.
- **Barrel gap.** At the orchestrator package root (`packages/orchestrator/src/index.ts`) `TaskRunner`, `TaskRunnerOptions`, the runner DI interfaces (`CheckCommandRunner`/`AgentDispatcher`/`CommandExecutor`/`PRLifecycleManager`), `RunResult`, `MaintenanceReporter`/`MaintenanceReporterOptions`, and `CheckScriptRunner` are NOT exported (only `maintenance/index.ts` exports some). Task 1 closes this gap. (`RunMode`, `selectTasks`, `TaskSelectionFilter`, `TaskDefinition`, `TaskOutputStore`, `BUILT_IN_TASKS` ARE already exported at root.)
- **No `p-limit` dependency.** Concurrency is hand-rolled with `Promise.allSettled` (pattern at `packages/cli/src/commands/update.ts:444`). Phase 3 adds a tiny bounded-concurrency map util (Task 5).
- **Test command:** `pnpm --filter @harness-engineering/cli exec vitest run <path>` (CLI) and `pnpm --filter @harness-engineering/orchestrator exec vitest run <path>` (orchestrator barrel test).

## Decisions (this phase)

- **D-P3-1 — `--fix` is threaded but dispatch is a documented no-op (parity with the scheduler).** Because the only `AgentDispatcher` in the entire repo is the orchestrator's stub, the CLI cannot construct real fix-agent dispatch in this phase — there is nothing to construct. `--fix` therefore: (a) threads `mode: 'fix'` into the SAME `TaskRunner`, reproducing the scheduler's per-type branching exactly (Success Criterion 4 = "reproduces the scheduler's behavior", which is the stub), (b) uses the same logging stub dispatcher, (c) constructs **no `PRManager`** (so no git mutation, no branch creation: `task-runner.ts` guards every PR/branch op with `if (this.prManager)`), and (d) prints a one-line warning: `--fix: AI fix-agent dispatch is not yet wired (executor dispatcher is a stub repo-wide); checks ran, no PRs were opened.` This is the honest, buildable scope. A real dispatcher is a separate future change; this phase leaves the `mode` seam ready for it.
- **D-P3-2 — Report mode runs PARALLEL under the cap; `--fix` mode runs SEQUENTIAL (effective concurrency 1).** Report checks are read-mostly and side-effect-confined to each task's own output dir, so they parallelize under `--concurrency` (default `min(cpus-2, 8)`, floor 1). `--fix` forces concurrency 1 regardless of `--concurrency`, pre-empting the duplicate-dispatch / worktree-collapse hazards the moment a real dispatcher lands (cheap insurance; today dispatch is a no-op anyway).
- **D-P3-3 — Explicitly-named excluded/unknown ids are exit-2 (invalid invocation), not silent drops.** `selectTasks(ids)` silently drops excluded ids, which is right for the _library_, but a _user_ who types `--only main-sync` or `--only typo` made a mistake. The CLI validates requested ids (positional + `--only`) against the resolved set BEFORE selection: an unknown id or a known-but-`excludeFromHumanSweep` id → warn + exit 2. `--skip` unknown ids warn only (skipping a non-existent task is harmless; exit 0).
- **D-P3-4 — The CLI records each run into `history.json` via `MaintenanceReporter.record`.** Keeps `history.json` the single source of truth so the next `overdue` computation reflects this sweep (Success Criterion 2 across invocations). Report-mode runs return `success`/`no-issues` (satisfying per `isSatisfyingRun`), correctly marking a task current even when it had findings — findings are tracked separately in the summary.
- **D-P3-5 — `now` is injected at the CLI boundary** (`runMaintenanceRun` deps default `new Date()`); `selectTasks` stays pure. Tests inject a fixed `now`.

## Observable Truths (Acceptance Criteria)

1. `harness maintenance run` with no args selects only sweep-eligible OVERDUE tasks (via `selectTasks` mode `overdue` over `history.json`), runs them in report mode, opens no PRs, and exits 0. (Spec SC1)
2. When nothing is overdue, it prints "All maintenance current." and exits 0. (Spec SC2)
3. `--all` selects every sweep-eligible task; `--only a,b` / positional `a b` select that eligible subset; `--skip a` removes ids post-selection; the four excluded housekeeping/backfill ids never run in any path. (Spec SC3)
4. `--fix` threads `mode: 'fix'` into the same `TaskRunner` (reproducing scheduler per-type behavior), constructs no `PRManager`, prints the dispatch-stub warning, and runs tasks sequentially. (Spec SC4 + D-P3-1/2)
5. The same `TaskRunner` class executes both the cron scheduler and the CLI — the CLI imports `TaskRunner` from `@harness-engineering/orchestrator`; no second execution path is introduced. (Spec SC5)
6. A CLI integration test invokes `runMaintenanceRun` in a temp fixture with real deps and a trivial custom report-only task, constructing NO orchestrator/gateway/`ClaimManager`, and it completes and writes `.harness/maintenance/last-run-summary.json`. (Spec SC6)
7. Flag/selection resolution and exit-code derivation are unit-tested deterministically under an injected `now` and injected fake `TaskRunner`/history/tasks — no real check execution: overdue default, `--all`, `--only`, `--skip`, unknown id → exit 2, named excluded id → exit 2, bad `--concurrency` → exit 2, `--all` + ids → exit 2, a task `status:'failure'` → exit 1, findings-only → exit 0. (Spec SC9)
8. The consolidated report is written to `.harness/maintenance/last-run-summary.json` and rendered as a console table (`task | status | findings | summary`) sorted findings-first with an "N overdue but now current" footer; `--json` emits the same object to stdout. (Spec SC8)
9. Exit code is `0` on completion (findings are NOT failures), `1` iff at least one task `status === 'failure'`, `2` on invalid invocation. (Spec SC9)
10. `pnpm --filter @harness-engineering/cli exec vitest run` (new tests) and `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/barrel-exports.test.ts` pass; `harness validate` passes (modulo the pre-existing, unrelated dashboard design-token baseline noted under Risks).

## File Map

- MODIFY `packages/orchestrator/src/index.ts` — barrel-export `TaskRunner`, `TaskRunnerOptions`, `CheckCommandRunner`, `AgentDispatcher`, `AgentDispatchResult`, `CommandExecutor`, `PRLifecycleManager`, `RunResult`, `MaintenanceReporter`, `MaintenanceReporterOptions`, `CheckScriptRunner`.
- CREATE `packages/orchestrator/tests/maintenance/barrel-exports.test.ts` — assert the new symbols import at the package root.
- MODIFY `packages/cli/src/commands/maintenance.ts` — promote `loadMaintenanceConfig` + `mergeResolvedTasks` to named exports; add `.command('run')` to `createMaintenanceCommand()`; thin action wrapping `runMaintenanceRun`.
- CREATE `packages/cli/src/commands/maintenance-run.ts` — the pure runner + DI builders (TaskRunner factory, history loader, selection resolution, aggregation/render, exit-code derivation, `runMaintenanceRun`).
- CREATE `packages/cli/src/utils/concurrency.ts` — `mapWithConcurrency(items, limit, fn)`.
- CREATE `packages/cli/tests/utils/concurrency.test.ts`
- CREATE `packages/cli/tests/commands/maintenance-run-selection.test.ts` — pure selection/exit-code/aggregation tests (fake deps).
- CREATE `packages/cli/tests/commands/maintenance-run-integration.test.ts` — real-deps fixture test (SC6).
- CREATE `docs/knowledge/decisions/0050-report-first-on-demand-maintenance.md` — ADR for D2.

## Skeleton

1. Foundation — orchestrator barrel exports + CLI task-resolution exports (~1 task, ~4 min)
2. Concurrency util (~1 task, ~4 min)
3. Infra-free TaskRunner factory + history loader (~1 task, ~6 min)
4. Selection/flag resolution (pure) (~1 task, ~5 min)
5. Report aggregation + render + exit codes (pure) (~1 task, ~5 min)
6. `runMaintenanceRun` orchestration with DI (~1 task, ~6 min)
7. Wire `.command('run')` action (~1 task, ~4 min)
8. Real-deps integration test (SC6) (~1 task, ~4 min)
9. ADR for D2 + AGENTS.md command list (~1 task, ~2 min)

**Estimated total:** 9 tasks, ~40 minutes. _Skeleton approval: pending human sign-off of this plan._

---

## Tasks

### Task 1: Barrel-export TaskRunner, RunResult, MaintenanceReporter, CheckScriptRunner from the orchestrator root

**Depends on:** none | **Files:** `packages/orchestrator/src/index.ts`, `packages/orchestrator/tests/maintenance/barrel-exports.test.ts` | **Category:** integration

1. Create `packages/orchestrator/tests/maintenance/barrel-exports.test.ts`:
   ```ts
   import { describe, it, expect } from 'vitest';
   import * as orch from '../../src/index';
   describe('orchestrator barrel — Phase 3 CLI surface', () => {
     it('exports the maintenance executor + reporter + check-script runner', () => {
       expect(typeof orch.TaskRunner).toBe('function');
       expect(typeof orch.MaintenanceReporter).toBe('function');
       expect(typeof orch.CheckScriptRunner).toBe('function');
       expect(typeof orch.selectTasks).toBe('function'); // already present, guard against regression
     });
   });
   ```
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/barrel-exports.test.ts` — observe failure (`TaskRunner`/`MaintenanceReporter`/`CheckScriptRunner` undefined).
3. In `packages/orchestrator/src/index.ts`, after the existing maintenance exports (around line 72), add:
   ```ts
   // On-demand maintenance pipeline (Phase 3) — CLI `run` subcommand surface.
   export { TaskRunner } from './maintenance/task-runner';
   export type {
     TaskRunnerOptions,
     CheckCommandRunner,
     CheckCommandResult,
     AgentDispatcher,
     AgentDispatchResult,
     CommandExecutor,
     CommandExecResult,
     PRLifecycleManager,
   } from './maintenance/task-runner';
   export type { RunResult } from './maintenance/types';
   export { MaintenanceReporter } from './maintenance/reporter';
   export type { MaintenanceReporterOptions } from './maintenance/reporter';
   export { CheckScriptRunner } from './maintenance/check-script-runner';
   ```
4. Run the test from step 2 — observe pass.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): export TaskRunner/Reporter/CheckScriptRunner for CLI maintenance run`

### Task 2: Promote `loadMaintenanceConfig` + `mergeResolvedTasks` to named exports

**Depends on:** none | **Files:** `packages/cli/src/commands/maintenance.ts`

1. In `packages/cli/src/commands/maintenance.ts`, change `async function loadMaintenanceConfig(` → `export async function loadMaintenanceConfig(` and `function mergeResolvedTasks(` → `export function mergeResolvedTasks(`. Leave all behavior identical (the `list` action still calls them).
2. Run the existing maintenance-adjacent CLI tests to confirm no regression: `pnpm --filter @harness-engineering/cli exec vitest run src/commands/maintenance.ts` (no test file yet → run the whole suite quickly is heavier; instead just typecheck): `pnpm --filter @harness-engineering/cli exec tsc --noEmit`.
3. Run: `harness validate`
4. Commit: `refactor(cli): export maintenance task-resolution helpers for run subcommand`

_Note: trivial export-only change; no new test (covered transitively by Task 6/8 which import these). TDD does not apply to a visibility change with no new behavior._

### Task 3: Bounded-concurrency map utility

**Depends on:** none | **Files:** `packages/cli/src/utils/concurrency.ts`, `packages/cli/tests/utils/concurrency.test.ts`

1. Create `packages/cli/tests/utils/concurrency.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { mapWithConcurrency } from '../../src/utils/concurrency';

   describe('mapWithConcurrency', () => {
     it('preserves input order in the results array', async () => {
       const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10);
       expect(out).toEqual([10, 20, 30, 40]);
     });
     it('never exceeds the concurrency cap', async () => {
       let active = 0;
       let peak = 0;
       await mapWithConcurrency([...Array(10).keys()], 3, async () => {
         active++;
         peak = Math.max(peak, active);
         await new Promise((r) => setTimeout(r, 5));
         active--;
       });
       expect(peak).toBeLessThanOrEqual(3);
     });
     it('runs sequentially when limit is 1', async () => {
       const order: number[] = [];
       await mapWithConcurrency([1, 2, 3], 1, async (n) => {
         order.push(n);
         await new Promise((r) => setTimeout(r, 1));
       });
       expect(order).toEqual([1, 2, 3]);
     });
     it('does not reject the batch when one task throws (caller maps errors)', async () => {
       const out = await mapWithConcurrency([1, 2], 2, async (n) => {
         if (n === 1) throw new Error('boom');
         return n;
       });
       expect(out[1]).toBe(2);
       expect(out[0]).toBeInstanceOf(Error);
     });
   });
   ```

   _Contract: results are returned in input order; a task that throws yields its `Error` in that slot (the runner converts these to `status:'failure'` RunResults, so the batch never sinks)._

2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/utils/concurrency.test.ts` — observe failure.
3. Create `packages/cli/src/utils/concurrency.ts`:
   ```ts
   /**
    * Map over `items` with at most `limit` concurrent invocations of `fn`.
    * Results are returned in input order. If `fn` rejects, the rejection's
    * Error is placed in that slot rather than rejecting the whole batch, so a
    * single failing task cannot sink a maintenance sweep.
    */
   export async function mapWithConcurrency<T, R>(
     items: readonly T[],
     limit: number,
     fn: (item: T, index: number) => Promise<R>
   ): Promise<(R | Error)[]> {
     const cap = Math.max(1, Math.floor(limit) || 1);
     const results: (R | Error)[] = new Array(items.length);
     let next = 0;
     async function worker(): Promise<void> {
       while (next < items.length) {
         const i = next++;
         try {
           results[i] = await fn(items[i] as T, i);
         } catch (err) {
           results[i] = err instanceof Error ? err : new Error(String(err));
         }
       }
     }
     const workers = Array.from({ length: Math.min(cap, items.length) }, () => worker());
     await Promise.all(workers);
     return results;
   }
   ```
4. Run the test from step 2 — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): add bounded-concurrency map utility`

### Task 4: Infra-free TaskRunner factory + history loader (`maintenance-run.ts` part 1)

**Depends on:** Task 1, Task 3 | **Files:** `packages/cli/src/commands/maintenance-run.ts`, `packages/cli/tests/commands/maintenance-run-selection.test.ts` (scaffold)

1. Create `packages/cli/tests/commands/maintenance-run-selection.test.ts` with the factory/history tests (more cases added in Task 5/6):

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { buildTaskRunner, loadRunHistory } from '../../src/commands/maintenance-run';

   function tmp(): string {
     return fs.mkdtempSync(path.join(os.tmpdir(), 'maint-run-'));
   }

   describe('buildTaskRunner', () => {
     it('builds a report-mode runner whose agent dispatcher throws if ever called', async () => {
       const dir = tmp();
       const runner = buildTaskRunner(dir, {} as never, 'report');
       expect(runner).toBeDefined();
       // report-mode dispatcher must never be invoked; assert it is a guard stub
       // by reaching into the constructed deps is not possible, so we assert the
       // runner type instead and rely on integration test (Task 8) for behavior.
       expect(typeof runner.run).toBe('function');
     });
   });

   describe('loadRunHistory', () => {
     it('returns [] when history.json is absent', async () => {
       expect(await loadRunHistory(tmp())).toEqual([]);
     });
     it('reads RunResult[] from .harness/maintenance/history.json', async () => {
       const dir = tmp();
       const mdir = path.join(dir, '.harness', 'maintenance');
       fs.mkdirSync(mdir, { recursive: true });
       fs.writeFileSync(
         path.join(mdir, 'history.json'),
         JSON.stringify([
           {
             taskId: 'doc-drift',
             startedAt: '2026-01-01T00:00:00.000Z',
             completedAt: '2026-01-01T00:01:00.000Z',
             status: 'success',
             findings: 0,
             fixed: 0,
             prUrl: null,
             prUpdated: false,
           },
         ])
       );
       const h = await loadRunHistory(dir);
       expect(h).toHaveLength(1);
       expect(h[0]!.taskId).toBe('doc-drift');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/maintenance-run-selection.test.ts` — observe failure (module missing).
3. Create `packages/cli/src/commands/maintenance-run.ts` with the DI builders:

   ```ts
   import * as path from 'node:path';
   import { execFile } from 'node:child_process';
   import { promisify } from 'node:util';
   import {
     TaskRunner,
     TaskOutputStore,
     MaintenanceReporter,
     CheckScriptRunner,
     type CheckCommandRunner,
     type AgentDispatcher,
     type CommandExecutor,
     type RunResult,
     type RunMode,
   } from '@harness-engineering/orchestrator';
   import type { MaintenanceConfig } from '@harness-engineering/types';

   const execFileAsync = promisify(execFile);

   /** Real check runner — pure child_process, no orchestrator infra. Mirrors
    * Orchestrator.createMaintenanceTaskRunner's checkRunner (orchestrator.ts:662). */
   function createCheckRunner(): CheckCommandRunner {
     return {
       run: async (command, cwd) => {
         const [cmd, ...args] = command;
         if (!cmd) return { passed: true, findings: 0, output: '' };
         try {
           const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 120_000 });
           const m = stdout.match(/(\d+)\s+(?:finding|issue|violation|error)/i);
           const findings = m ? parseInt(m[1]!, 10) : 0;
           return { passed: findings === 0, findings, output: stdout };
         } catch (err) {
           const e = err as { stdout?: string; stderr?: string };
           const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
           const m = output.match(/(\d+)\s+(?:finding|issue|violation|error)/i);
           return { passed: false, findings: m ? parseInt(m[1]!, 10) : 1, output };
         }
       },
     };
   }

   function createCommandExecutor(): CommandExecutor {
     return {
       exec: async (command, cwd) => {
         const [cmd, ...args] = command;
         if (!cmd) return { stdout: '' };
         const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 120_000 });
         return { stdout: String(stdout) };
       },
     };
   }

   /** Report-mode dispatcher: must never be called (report takes the no-dispatch
    * branch). Throws to make any accidental invocation loud in tests. */
   function reportDispatcher(): AgentDispatcher {
     return {
       dispatch: async () => {
         throw new Error('report mode must not dispatch agents');
       },
     };
   }

   /** Fix-mode dispatcher: parity with the orchestrator's STUB (orchestrator.ts:686).
    * Real fix-agent dispatch does not exist anywhere in the repo yet (D-P3-1). */
   function fixStubDispatcher(): AgentDispatcher {
     return { dispatch: async () => ({ producedCommits: false, fixed: 0 }) };
   }

   /** Construct a TaskRunner with no orchestrator/gateway/ClaimManager.
    * No prManager is wired in either mode → no git mutation, no PRs (D-P3-1). */
   export function buildTaskRunner(
     cwd: string,
     config: MaintenanceConfig,
     mode: RunMode
   ): TaskRunner {
     const outputStore = new TaskOutputStore({
       rootDir: path.join(cwd, '.harness', 'maintenance'),
     });
     return new TaskRunner({
       config,
       checkRunner: createCheckRunner(),
       commandExecutor: createCommandExecutor(),
       agentDispatcher: mode === 'report' ? reportDispatcher() : fixStubDispatcher(),
       cwd,
       checkScriptRunner: new CheckScriptRunner(cwd),
       outputStore,
       // prManager intentionally omitted; contextResolver omitted (composePromptContext returns '').
     });
   }

   /** Read maintenance run history (RunResult[]) via MaintenanceReporter — the
    * same on-disk history.json the cron scheduler writes. */
   export async function loadRunHistory(cwd: string): Promise<RunResult[]> {
     const reporter = new MaintenanceReporter({
       persistDir: path.join(cwd, '.harness', 'maintenance'),
     });
     await reporter.load();
     return reporter.getHistory(500, 0);
   }
   ```

4. Run the test from step 2 — observe pass.
5. Run: `harness validate` and `harness check-deps` (new cross-package import added).
6. Commit: `feat(cli): infra-free TaskRunner factory + history loader for maintenance run`

### Task 5: Selection/flag resolution + exit-code + report aggregation (pure)

**Depends on:** Task 4 | **Files:** `packages/cli/src/commands/maintenance-run.ts`, `packages/cli/tests/commands/maintenance-run-selection.test.ts`

1. Append to `maintenance-run.ts` the pure helpers (no I/O):
   - `RunOptions` interface: `{ all?, only?, skip?, fix?, concurrency?, json? }` (strings from commander; `only`/`skip` are comma-lists).
   - `resolveSelection(opts, tasks): { filter: TaskSelectionFilter; skipIds: Set<string>; errors: string[] }` implementing D-P3-3:
     - parse `positional`/`--only` → `requestedIds`; `--all` → all mode. If both `--all` and requestedIds → push error "cannot combine --all with task ids/--only".
     - requestedIds present → `mode:'ids'`, else `--all` → `mode:'all'`, else `mode:'overdue'`.
     - validate each requested id against `tasks`: unknown → error `unknown task id '<id>'`; present but `excludeFromHumanSweep===true` → error `task '<id>' is excluded from the human sweep and cannot be run on demand`.
     - `--skip` ids: unknown → push a WARNING string prefixed `warn:` (caller logs, does not fail); known → add to `skipIds`.
     - bad `--concurrency` (non-int or <1) → error.
   - `parseConcurrency(raw?): number` → default `Math.max(1, Math.min(os.cpus().length - 2, 8))`; throws-as-error on invalid (validated in resolveSelection).
   - `deriveExitCode(results: RunResult[]): 0 | 1` → `1` if any `status === 'failure'`, else `0`.
   - `aggregateReport(args): ConsolidatedReport` and `renderTable(report): string` per Task 7's shape (define the `ConsolidatedReport` type here): `{ generatedAt, mode, fix, exitCode, tasks: ReportRow[], overdueNowCurrent: string[] }`, `ReportRow = { taskId, status, findings, fixed, prUrl, summary, error? }`. Sort `tasks` findings-desc then failures-first. `summary` = `error ?? '<findings> finding(s)'` or `'clean'`.
2. Add unit tests to `maintenance-run-selection.test.ts` (use a small in-memory `tasks` fixture incl. one `excludeFromHumanSweep:true`):
   - overdue default (no flags) → `filter.mode==='overdue'`, no errors.
   - `--all` → `mode:'all'`.
   - `--only doc-drift` → `mode:'ids', ids:['doc-drift']`.
   - `--only main-sync` (excluded) → errors non-empty (exit 2 semantics).
   - `--only nope` (unknown) → errors non-empty.
   - `--all` + `--only x` → errors non-empty.
   - `--concurrency abc` / `--concurrency 0` → errors non-empty.
   - `--skip foo` unknown → no errors, warning emitted.
   - `deriveExitCode([{status:'failure'...}])===1`; `deriveExitCode([{status:'success',findings:5...}])===0`.
   - `renderTable` sorts a 5-findings row above a 0-findings row; footer reflects `overdueNowCurrent`.
3. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/maintenance-run-selection.test.ts` — fail then implement then pass.
4. Run: `harness validate`
5. Commit: `feat(cli): maintenance run selection, exit-code, and report aggregation`

### Task 6: `runMaintenanceRun` orchestration with dependency injection

**Depends on:** Task 5 | **Files:** `packages/cli/src/commands/maintenance-run.ts`, `packages/cli/tests/commands/maintenance-run-selection.test.ts`

1. Append `runMaintenanceRun(cwd, opts, deps?)` to `maintenance-run.ts`:

   ```ts
   export interface MaintenanceRunDeps {
     now?: Date;
     loadTasks?: (cwd: string) => Promise<TaskDefinition[]>;
     loadHistory?: (cwd: string) => Promise<RunResult[]>;
     makeRunner?: (cwd: string, config: MaintenanceConfig, mode: RunMode) => TaskRunner;
     record?: (cwd: string, results: RunResult[]) => Promise<void>;
     log?: (line: string) => void;
   }
   export interface MaintenanceRunResult {
     exitCode: 0 | 1 | 2;
     report: ConsolidatedReport | null;
   }

   export async function runMaintenanceRun(
     cwd: string,
     opts: RunOptions & { positional?: string[] },
     deps: MaintenanceRunDeps = {}
   ): Promise<MaintenanceRunResult>;
   ```

   Flow:
   - `now = deps.now ?? new Date()`; load config via `loadMaintenanceConfig(cwd)` (imported from `./maintenance`), `tasks = (deps.loadTasks ?? defaultLoadTasks)(cwd)` where `defaultLoadTasks` wraps `mergeResolvedTasks(config)`.
   - `const sel = resolveSelection(opts, tasks)`; log warnings; if `sel.errors.length` → log each, return `{ exitCode: 2, report: null }`.
   - `mode = opts.fix ? 'fix' : 'report'`; if `opts.fix` log the D-P3-1 stub warning.
   - `history = await (deps.loadHistory ?? loadRunHistory)(cwd)`.
   - `let selected = selectTasks(tasks, history, sel.filter)`; remove `sel.skipIds`.
   - record the selected ids that were `overdue` (for the footer) BEFORE running.
   - if `selected.length === 0` → log `All maintenance current.`, write an empty summary, return `{ exitCode: 0, report }`.
   - `concurrency = mode === 'fix' ? 1 : parseConcurrency(opts.concurrency)`.
   - `runner = (deps.makeRunner ?? buildTaskRunner)(cwd, config ?? ({} as MaintenanceConfig), mode)`.
   - `const settled = await mapWithConcurrency(selected, concurrency, (t) => runner.run(t, 'cli', mode))`; map any `Error` slot → a synthetic `status:'failure'` RunResult for that task id.
   - `await (deps.record ?? defaultRecord)(cwd, results)` (defaultRecord = `MaintenanceReporter.record` loop; D-P3-4).
   - `overdueNowCurrent` = ids that were in the overdue selection and finished `success`/`no-issues`.
   - `report = aggregateReport(...)`; `exitCode = deriveExitCode(results)` (0|1).
   - write `.harness/maintenance/last-run-summary.json` (pretty JSON of `report`).
   - if `opts.json` → `(deps.log ?? console.log)(JSON.stringify(report, null, 2))` else `log(renderTable(report))`.
   - return `{ exitCode, report }`.

2. Add tests with FAKE deps (no real exec): inject `makeRunner` returning a fake whose `.run` returns canned RunResults per task, `loadTasks`/`loadHistory` returning fixtures, fixed `now`, capturing `log`:
   - overdue default selects only overdue tasks; writes `last-run-summary.json` to the temp cwd; exit 0.
   - one task returns `status:'failure'` → exit 1; findings-only → exit 0.
   - `--all` runs all eligible; excluded task never appears.
   - `--only <id>` runs just that id.
   - `--skip <id>` removes it.
   - `--fix` → `mode` passed to fake runner is `'fix'`, concurrency forced to 1 (assert via a fake that records call ordering/overlap), stub warning logged.
   - nothing selected → "All maintenance current." logged, exit 0, summary written.
   - `--json` → captured log parses to the report object.
3. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/maintenance-run-selection.test.ts` — fail, implement, pass.
4. Run: `harness validate`
5. Commit: `feat(cli): runMaintenanceRun orchestration with injectable deps`

### Task 7: Wire the `run` subcommand into `createMaintenanceCommand`

**Depends on:** Task 6 | **Files:** `packages/cli/src/commands/maintenance.ts`

1. In `maintenance.ts`, import the runner: `import { runMaintenanceRun } from './maintenance-run';` and add to `createMaintenanceCommand()` before `return command;`:
   ```ts
   command
     .command('run [taskId...]')
     .description('Run overdue (default) / selected maintenance tasks; report-first unless --fix')
     .option('--all', 'Run all sweep-eligible tasks (not just overdue)', false)
     .option('--only <ids>', 'Comma-separated task ids to run')
     .option('--skip <ids>', 'Comma-separated task ids to exclude')
     .option('--fix', 'Dispatch fixes per task type (default: report-only)', false)
     .option('--concurrency <n>', 'Max parallel tasks (report mode); --fix forces 1')
     .option('--json', 'Emit machine-readable consolidated report', false)
     .option('--path <path>', 'Project root path', '.')
     .action(async (taskIds: string[], opts) => {
       const cwd = path.resolve(opts.path);
       const result = await runMaintenanceRun(cwd, {
         positional: taskIds,
         all: opts.all,
         only: opts.only,
         skip: opts.skip,
         fix: opts.fix,
         concurrency: opts.concurrency,
         json: opts.json,
       });
       process.exit(result.exitCode);
     });
   ```
2. Add a registration test to a new/existing command-shape test asserting the `run` subcommand exists with the expected options (commander introspection):
   ```ts
   // packages/cli/tests/commands/maintenance-command-shape.test.ts
   import { describe, it, expect } from 'vitest';
   import { createMaintenanceCommand } from '../../src/commands/maintenance';
   describe('maintenance command', () => {
     it('registers list, show, and run subcommands', () => {
       const names = createMaintenanceCommand().commands.map((c) => c.name());
       expect(names).toEqual(expect.arrayContaining(['list', 'show', 'run']));
     });
     it('run exposes --all/--only/--skip/--fix/--concurrency/--json/--path', () => {
       const run = createMaintenanceCommand().commands.find((c) => c.name() === 'run')!;
       const flags = run.options.map((o) => o.long);
       expect(flags).toEqual(
         expect.arrayContaining([
           '--all',
           '--only',
           '--skip',
           '--fix',
           '--concurrency',
           '--json',
           '--path',
         ])
       );
     });
   });
   ```
3. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/maintenance-command-shape.test.ts` — fail, implement, pass.
4. Run: `harness validate`
5. Commit: `feat(cli): wire harness maintenance run subcommand`

### Task 8: Real-deps integration test — standalone path writes a report (SC6)

**Depends on:** Task 7 | **Files:** `packages/cli/tests/commands/maintenance-run-integration.test.ts` | **Category:** integration

[checkpoint:human-verify]

1. Create `maintenance-run-integration.test.ts` proving the no-orchestrator path with REAL deps (real `TaskRunner`, real `checkRunner` execing `node -e`, real `TaskOutputStore`/`MaintenanceReporter`), injecting ONLY `loadTasks` (a single trivial custom report-only task) and a fixed `now`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { runMaintenanceRun } from '../../src/commands/maintenance-run';

   describe('maintenance run — standalone (no orchestrator/gateway/ClaimManager)', () => {
     it('runs a report-only task end-to-end and writes last-run-summary.json', async () => {
       const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-int-'));
       const task = {
         id: 'fixture-report',
         type: 'report-only',
         description: 'fixture',
         schedule: '0 2 * * *',
         branch: null,
         checkCommand: [
           'node',
           '-e',
           'console.log(JSON.stringify({status:"success",candidatesFound:2}))',
         ],
       };
       const res = await runMaintenanceRun(
         cwd,
         { all: true },
         {
           loadTasks: async () => [task as never],
           loadHistory: async () => [],
           now: new Date('2026-06-27T12:00:00.000Z'),
         }
       );
       expect(res.exitCode).toBe(0);
       const summary = path.join(cwd, '.harness', 'maintenance', 'last-run-summary.json');
       expect(fs.existsSync(summary)).toBe(true);
       const report = JSON.parse(fs.readFileSync(summary, 'utf-8'));
       const row = report.tasks.find((t: { taskId: string }) => t.taskId === 'fixture-report');
       expect(row.findings).toBe(2);
       expect(row.status).toBe('success');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/maintenance-run-integration.test.ts` — fail (until prior tasks land), then pass.
3. **Manual verify (checkpoint):** in the repo root run `node packages/cli/dist/... maintenance run --json` (or `pnpm --filter @harness-engineering/cli exec harness maintenance run`) and confirm: a table renders, exit code is 0, `.harness/maintenance/last-run-summary.json` is written, no PRs/branches created. Pause for human confirmation.
4. Run: `harness validate`
5. Commit: `test(cli): integration test for standalone maintenance run path`

### Task 9: ADR for D2 (report-first on-demand) + AGENTS.md command list

**Depends on:** Task 8 | **Files:** `docs/knowledge/decisions/0050-report-first-on-demand-maintenance.md`, `AGENTS.md` | **Category:** integration

1. Write `docs/knowledge/decisions/0050-report-first-on-demand-maintenance.md` (mirror the format of `0049-single-maintenance-executor-run-mode.md`): Context = on-demand sweep must be safe/non-surprising; Decision = report-first default, `--fix` opts into dispatch, and in this phase `--fix` dispatch is the repo-wide stub with no `PRManager` (D-P3-1); Consequences = the `mode` seam is ready for a real dispatcher; CI gates on exit 1 only. Cross-reference ADR 0049.
2. Add a `harness maintenance run` entry to the CLI command list in `AGENTS.md` (locate the maintenance/command section; one line describing the overdue report-first sweep).
3. Run: `harness validate`
4. Commit: `docs(maintenance): ADR 0050 report-first on-demand + AGENTS.md command entry`

---

## Sequencing & Parallelism

- Strict dependency chain through the file `maintenance-run.ts`: 1 → (2,3 independent) → 4 → 5 → 6 → 7 → 8 → 9.
- Tasks 2 and 3 are independent of Task 1 and of each other (parallelizable).
- Each task is one atomic commit, ≤3 files, completable in one context window.

## Checkpoints

- **Task 8 `[checkpoint:human-verify]`** — manual run in the live repo to eyeball the rendered table, exit code, and that `last-run-summary.json` is written with no git mutation (covers SC1/SC2/SC8 by inspection).

## Risks

- **`harness validate` pre-existing baseline noise.** `harness validate` currently reports unrelated dashboard design-token violations (`packages/dashboard/src/client/**` hardcoded colors) — a known, non-blocking baseline condition in this worktree, NOT introduced by this phase. Treat validate as passing if the only failures are those dashboard token entries.
- **`--fix` is intentionally a no-op-dispatch in this phase.** If a reviewer expects real fixes, that is out of scope and depends on a future real `AgentDispatcher` (none exists repo-wide). The ADR and the runtime warning make this explicit.
- **`check-arch` module-size baseline** may need a refresh after adding `maintenance-run.ts` (the Phase 2 plan hit this). If `harness validate`/`check-arch` reports a module-size regression solely from the new lines, refresh only the affected `module-size.value` baseline entry — do not clobber unrelated scopes (see memory: arch baseline scope clobber).

## Harness Integration

- `harness validate` runs in every task and before plan finalization.
- `harness check-deps` runs in Task 4 (first new cross-package import).
- Plan committed at planning time under `docs/changes/maintenance-pipeline/plans/`.
- Handoff written to `.harness/sessions/changes--maintenance-pipeline--proposal/handoff.json`.
