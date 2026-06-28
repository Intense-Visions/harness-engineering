# Plan: Maintenance Pipeline — Phase 2 (Overdue + Selection)

**Date:** 2026-06-27 | **Spec:** docs/changes/maintenance-pipeline/proposal.md (Technical Design "Overdue computation (D3)", Decisions D3 & D5) | **Tasks:** 5 | **Time:** ~22 min | **Integration Tier:** medium

## Goal

Add sweep-eligibility metadata to the task registry and a deterministic, unit-tested `selectTasks(tasks, history, filter)` helper that computes which maintenance tasks are overdue (or selected) from cron schedules + run history under an injected `now`, exported from the orchestrator package barrel.

## Scope

Phase 2 ONLY. No CLI subcommand (Phase 3), no skill (Phase 4), no `TaskRunner` changes (Phase 1, already shipped). This phase produces pure, side-effect-free selection logic and the registry flag it reads.

## Grounding (verified against actual code)

- **History shape is `RunResult[]`, not `HistoryEntry`.** There is no `HistoryEntry` type in the codebase. `.harness/maintenance/history.json` is persisted by `MaintenanceReporter` (`packages/orchestrator/src/maintenance/reporter.ts:84-90`) as an array validated by `RunResultSchema` (`reporter.ts:7-17`): `{ taskId, startedAt, completedAt, status: 'success'|'failure'|'skipped'|'no-issues', findings, fixed, prUrl, prUpdated, error? }`. `selectTasks` therefore consumes `RunResult[]` (the spec's `HistoryEntry[]` is aspirational naming for this real type). Source of truth: `packages/orchestrator/src/maintenance/types.ts:111-145`.
- **Cron reuse:** `cronMatchesNow(expression, now)` (`packages/orchestrator/src/maintenance/cron-matcher.ts:68`) is a minute-resolution matcher using LOCAL time fields. `MaintenanceScheduler.computeNextRun` (`scheduler.ts:295-318`) already establishes the pattern of scanning minute-by-minute (forward, 31-day window) with this matcher. Phase 2 reuses `cronMatchesNow` for a BACKWARD scan to find the previous fire time. NO new cron dependency is added.
- **`TaskDefinition.schedule` is a cron string** (`types.ts:74`); `TaskDefinition` is an open interface so adding `excludeFromHumanSweep?: boolean` is non-breaking and the `as const` `BUILT_IN_TASKS` array (`task-registry.ts:12-209`) still infers.
- **Four excluded ids confirmed present** in the 22-task registry: `session-cleanup` (`task-registry.ts:172`), `perf-baselines` (`:180`), `main-sync` (`:188`), `proposal-provenance-backfill` (`:201`, cron `0 0 31 2 *` — the impossible Feb-31 one-shot).
- **`CustomTaskDefinition` is a distinct type** at `packages/types/src/maintenance.ts:92-119` — gets the parity field.
- **`excludeFromHumanSweep` is already referenced in a comment** in `task-runner.ts:609` as the Phase 2 selection layer, confirming design intent and the executor-level defense-in-depth that complements it (housekeeping returns `status: 'skipped'` under `mode: 'report'`, `task-runner.ts:612-618`).
- **Tests live in `packages/orchestrator/tests/maintenance/`** (e.g. `cron-matcher.test.ts`, `task-registry.test.ts`), run via `vitest run`. Test command used below: `pnpm --filter @harness-engineering/orchestrator exec vitest run <path>`.

## Observable Truths (Acceptance Criteria)

1. `TaskDefinition` (`packages/orchestrator/src/maintenance/types.ts`) and `CustomTaskDefinition` (`packages/types/src/maintenance.ts`) both carry `excludeFromHumanSweep?: boolean`; the package typechecks.
2. Exactly the four built-ins `main-sync`, `perf-baselines`, `session-cleanup`, `proposal-provenance-backfill` have `excludeFromHumanSweep: true`; all other 18 leave it unset. A registry test asserts this set precisely.
3. `previousFireTime(schedule, now)` returns the most recent cron fire at/before `now` (minute resolution, local-time frame consistent with `cronMatchesNow`), or `null` when no fire exists in a 31-day look-back window (e.g. the impossible `0 0 31 2 *`). Never calls `Date.now()`.
4. `selectTasks(tasks, history, filter)` with injected `filter.now`:
   - operates only on sweep-eligible tasks (`excludeFromHumanSweep !== true`) in ALL modes;
   - `mode: 'overdue'` returns eligible tasks with no satisfying run since their previous fire time; a never-run eligible task with a computable previous fire is overdue; a task whose previous fire is `null` is NOT overdue;
   - `mode: 'all'` returns every eligible task;
   - `mode: 'ids'` returns the eligible subset whose `id` is in `filter.ids` (an explicitly-named excluded id is dropped, per success criterion 3 "never run in either path");
   - is deterministic — identical inputs yield identical output, no wall-clock reads.
5. `selectTasks` (and its `TaskSelectionFilter` type) are barrel-exported from `packages/orchestrator/src/index.ts` (and the maintenance module barrel `src/maintenance/index.ts`).
6. `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/overdue.test.ts tests/maintenance/task-registry.test.ts` passes; `harness validate` passes.

## File Map

- MODIFY `packages/orchestrator/src/maintenance/types.ts` (add `excludeFromHumanSweep?` to `TaskDefinition`)
- MODIFY `packages/types/src/maintenance.ts` (add `excludeFromHumanSweep?` to `CustomTaskDefinition`)
- MODIFY `packages/orchestrator/src/maintenance/task-registry.ts` (set flag on 4 built-ins)
- MODIFY `packages/orchestrator/tests/maintenance/task-registry.test.ts` (assert the exact excluded set)
- CREATE `packages/orchestrator/src/maintenance/overdue.ts` (`previousFireTime`, `selectTasks`, `TaskSelectionFilter`)
- CREATE `packages/orchestrator/tests/maintenance/overdue.test.ts`
- MODIFY `packages/orchestrator/src/maintenance/index.ts` (module barrel)
- MODIFY `packages/orchestrator/src/index.ts` (root barrel)

## Skeleton

_Not produced — task count (5) is below the standard-rigor threshold (8). Full tasks follow directly._

## Key Decisions (this phase)

- **D-P2-a — History type:** `selectTasks` consumes `RunResult[]` (the real on-disk shape), not an invented `HistoryEntry`. A run "satisfies" a schedule when `status === 'success' || status === 'no-issues'` (both mean the check executed cleanly and recorded; `failure`/`skipped` do not satisfy). Compare the run's `completedAt` (absolute instant) `>=` the previous fire time.
- **D-P2-b — Named-but-excluded id behavior (`ids` mode):** an explicitly-named excluded task is silently dropped from the result, NOT thrown. This keeps `selectTasks` a total, deterministic function and honors success criterion 3 ("excluded housekeeping tasks never run in either path"). The Phase 3 CLI may detect "requested id absent from result" and surface a warning / exit code 2 — that decision belongs to the CLI layer, not the selection function.
- **D-P2-c — Look-back window:** `previousFireTime` scans backward up to 44,640 minutes (31 days), mirroring `computeNextRun`'s forward fallback window. All sweep-eligible built-ins fire at least daily, so this never under-selects; schedules with inter-fire gaps > 31 days resolve to `null` (treated as not-overdue), which is correct for the one impossible cron (already excluded by the flag).
- **D-P2-d — Timezone consistency:** `cronMatchesNow` interprets cron fields in LOCAL time. Fixtures construct `now` and history `completedAt` values in the same local frame (e.g. `new Date('2026-04-17T02:00:00')`, matching `cron-matcher.test.ts`) so minute-matching and instant-comparison stay coherent and CI-stable.

## Tasks

### Task 1: Add `excludeFromHumanSweep?` to both task-definition interfaces

**Depends on:** none | **Files:** `packages/orchestrator/src/maintenance/types.ts`, `packages/types/src/maintenance.ts` | **Category:** integration

1. In `packages/orchestrator/src/maintenance/types.ts`, inside `interface TaskDefinition`, after the `isCustom?` field (line ~105), add:
   ```ts
   /**
    * On-demand maintenance pipeline (D5). When `true`, the task is excluded
    * from the human "overdue" sweep computed by `selectTasks` — used for
    * git-mutating housekeeping (`main-sync`, `perf-baselines`,
    * `session-cleanup`) and one-shot backfills (`proposal-provenance-backfill`)
    * that are infra hygiene, not developer-facing health signals.
    * `undefined` (default) → sweep-eligible.
    */
   excludeFromHumanSweep?: boolean;
   ```
2. In `packages/types/src/maintenance.ts`, inside `interface CustomTaskDefinition`, after the `costCeiling?` field (line ~118), add the same field with a doc comment noting custom tasks default to eligible unless they opt out:
   ```ts
   /**
    * Exclude this custom task from the on-demand human "overdue" sweep
    * (parity with built-ins). Default (`undefined`) → sweep-eligible.
    */
   excludeFromHumanSweep?: boolean;
   ```
3. Typecheck: `pnpm --filter @harness-engineering/orchestrator exec tsc --noEmit` (and `pnpm --filter @harness-engineering/types exec tsc --noEmit`).
4. Run: `harness validate`
5. Commit: `feat(maintenance): add excludeFromHumanSweep to task definitions`

### Task 2: Flag the four excluded built-ins + assert the set (TDD)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/task-registry.test.ts`, `packages/orchestrator/src/maintenance/task-registry.ts`

1. In `packages/orchestrator/tests/maintenance/task-registry.test.ts`, add a test that pins the exact excluded set:
   ```ts
   it('marks exactly the four git-mutating/backfill housekeeping tasks excludeFromHumanSweep', () => {
     const excluded = BUILT_IN_TASKS.filter((t) => t.excludeFromHumanSweep === true)
       .map((t) => t.id)
       .sort();
     expect(excluded).toEqual([
       'main-sync',
       'perf-baselines',
       'proposal-provenance-backfill',
       'session-cleanup',
     ]);
     // Every other built-in is sweep-eligible (flag unset).
     expect(BUILT_IN_TASKS.filter((t) => t.excludeFromHumanSweep === true)).toHaveLength(4);
   });
   ```
   (Ensure `BUILT_IN_TASKS` is imported at the top of the test file — it already is for existing assertions; reuse the existing import.)
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/task-registry.test.ts` — observe FAIL (no entries flagged yet).
3. In `packages/orchestrator/src/maintenance/task-registry.ts`, add `excludeFromHumanSweep: true,` to each of the four entries: `session-cleanup` (`:172`), `perf-baselines` (`:180`), `main-sync` (`:188`), `proposal-provenance-backfill` (`:201`). Place the field as the last property of each object literal.
4. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/task-registry.test.ts` — observe PASS.
5. Run: `harness validate`
6. Commit: `feat(maintenance): mark git-mutating housekeeping excludeFromHumanSweep`

### Task 3: Implement `previousFireTime` helper with tests (TDD)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/tests/maintenance/overdue.test.ts`, `packages/orchestrator/src/maintenance/overdue.ts`

1. Create `packages/orchestrator/tests/maintenance/overdue.test.ts` with the helper tests (local-time frame per D-P2-d):

   ```ts
   import { describe, it, expect } from 'vitest';
   import { previousFireTime } from '../../src/maintenance/overdue';

   describe('previousFireTime', () => {
     it('returns the most recent fire at/before now for a daily cron', () => {
       // 0 2 * * * — daily 02:00. now = 2026-04-17T05:00 → fire = 2026-04-17T02:00.
       const fire = previousFireTime('0 2 * * *', new Date('2026-04-17T05:00:00'));
       expect(fire?.toISOString()).toBe(new Date('2026-04-17T02:00:00').toISOString());
     });

     it('includes the current minute (fire at/before now is inclusive)', () => {
       const fire = previousFireTime('0 2 * * *', new Date('2026-04-17T02:00:00'));
       expect(fire?.toISOString()).toBe(new Date('2026-04-17T02:00:00').toISOString());
     });

     it('crosses into the previous day when today has not fired yet', () => {
       // now = 2026-04-17T01:00, before 02:00 → previous fire = 2026-04-16T02:00.
       const fire = previousFireTime('0 2 * * *', new Date('2026-04-17T01:00:00'));
       expect(fire?.toISOString()).toBe(new Date('2026-04-16T02:00:00').toISOString());
     });

     it('returns null for an impossible cron (0 0 31 2 * — Feb 31)', () => {
       expect(previousFireTime('0 0 31 2 *', new Date('2026-04-17T05:00:00'))).toBeNull();
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/overdue.test.ts` — observe FAIL (module/helper missing).
3. Create `packages/orchestrator/src/maintenance/overdue.ts` with the helper (reusing `cronMatchesNow`):

   ```ts
   import type { TaskDefinition, RunResult } from './types';
   import { cronMatchesNow } from './cron-matcher';

   /** Minutes in 31 days — the backward look-back window (mirrors computeNextRun). */
   const LOOKBACK_MINUTES = 44_640;

   /**
    * Most recent cron fire at/before `now` (minute resolution), or `null` when no
    * fire exists within the 31-day look-back window (e.g. the impossible `0 0 31 2 *`).
    * Reuses `cronMatchesNow`; interprets cron fields in the local-time frame.
    * `now` is injected — never reads the wall clock.
    */
   export function previousFireTime(schedule: string, now: Date): Date | null {
     const start = new Date(now);
     start.setSeconds(0, 0);
     for (let i = 0; i <= LOOKBACK_MINUTES; i++) {
       const candidate = new Date(start.getTime() - i * 60_000);
       if (cronMatchesNow(schedule, candidate)) return candidate;
     }
     return null;
   }
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/overdue.test.ts` — observe PASS.
5. Run: `harness validate`
6. Commit: `feat(maintenance): add previousFireTime cron helper`

### Task 4: Implement `selectTasks` + `TaskSelectionFilter` with tests (TDD)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/tests/maintenance/overdue.test.ts`, `packages/orchestrator/src/maintenance/overdue.ts`

1. Append `selectTasks` tests to `packages/orchestrator/tests/maintenance/overdue.test.ts`:

   ```ts
   import { selectTasks } from '../../src/maintenance/overdue';
   import type { TaskDefinition, RunResult } from '../../src/maintenance/types';

   const task = (id: string, schedule: string, excluded = false): TaskDefinition => ({
     id,
     type: 'report-only',
     description: id,
     schedule,
     branch: null,
     ...(excluded ? { excludeFromHumanSweep: true } : {}),
   });
   const ran = (
     taskId: string,
     completedAt: string,
     status: RunResult['status'] = 'success'
   ): RunResult => ({
     taskId,
     startedAt: completedAt,
     completedAt,
     status,
     findings: 0,
     fixed: 0,
     prUrl: null,
     prUpdated: false,
   });

   describe('selectTasks', () => {
     const now = new Date('2026-04-17T05:00:00'); // after the 02:00 daily fire
     const daily = task('alpha', '0 2 * * *');
     const beta = task('beta', '0 2 * * *');

     it('treats a never-run eligible task as overdue', () => {
       const out = selectTasks([daily], [], { mode: 'overdue', now });
       expect(out.map((t) => t.id)).toEqual(['alpha']);
     });

     it('treats a task run after its last fire as current (not overdue)', () => {
       const history = [ran('alpha', '2026-04-17T02:05:00')]; // after 02:00 fire
       expect(selectTasks([daily], history, { mode: 'overdue', now })).toHaveLength(0);
     });

     it('treats a task last run before its last fire as overdue', () => {
       const history = [ran('alpha', '2026-04-16T02:05:00')]; // before today 02:00 fire
       expect(selectTasks([daily], history, { mode: 'overdue', now }).map((t) => t.id)).toEqual([
         'alpha',
       ]);
     });

     it('counts no-issues as a satisfying run, ignores failure/skipped', () => {
       expect(
         selectTasks([daily], [ran('alpha', '2026-04-17T02:05:00', 'no-issues')], {
           mode: 'overdue',
           now,
         })
       ).toHaveLength(0);
       expect(
         selectTasks([daily], [ran('alpha', '2026-04-17T02:05:00', 'failure')], {
           mode: 'overdue',
           now,
         }).map((t) => t.id)
       ).toEqual(['alpha']);
       expect(
         selectTasks([daily], [ran('alpha', '2026-04-17T02:05:00', 'skipped')], {
           mode: 'overdue',
           now,
         }).map((t) => t.id)
       ).toEqual(['alpha']);
     });

     it('excludes excludeFromHumanSweep tasks in every mode', () => {
       const excluded = task('housekeep', '0 2 * * *', true);
       expect(selectTasks([daily, excluded], [], { mode: 'all', now }).map((t) => t.id)).toEqual([
         'alpha',
       ]);
       expect(
         selectTasks([daily, excluded], [], { mode: 'overdue', now }).map((t) => t.id)
       ).toEqual(['alpha']);
       expect(
         selectTasks([daily, excluded], [], { mode: 'ids', ids: ['housekeep'], now })
       ).toHaveLength(0);
     });

     it('all returns every eligible task regardless of history', () => {
       const history = [ran('alpha', '2026-04-17T02:05:00')];
       expect(
         selectTasks([daily, beta], history, { mode: 'all', now })
           .map((t) => t.id)
           .sort()
       ).toEqual(['alpha', 'beta']);
     });

     it('ids returns the named eligible subset', () => {
       expect(
         selectTasks([daily, beta], [], { mode: 'ids', ids: ['beta'], now }).map((t) => t.id)
       ).toEqual(['beta']);
     });

     it('never-run task on an impossible cron is not overdue', () => {
       const impossible = task('feb31', '0 0 31 2 *');
       expect(selectTasks([impossible], [], { mode: 'overdue', now })).toHaveLength(0);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/overdue.test.ts` — observe FAIL (`selectTasks` undefined).
3. Append to `packages/orchestrator/src/maintenance/overdue.ts`:

   ```ts
   /** Selection filter for `selectTasks`. `now` is injected for determinism. */
   export interface TaskSelectionFilter {
     mode: 'overdue' | 'all' | 'ids';
     /** Required when `mode === 'ids'`; ignored otherwise. */
     ids?: string[];
     /** Reference instant — never read from the wall clock internally. */
     now: Date;
   }

   /** A run satisfies a schedule when its check executed cleanly. */
   function isSatisfyingRun(r: RunResult): boolean {
     return r.status === 'success' || r.status === 'no-issues';
   }

   /** True when a sweep-eligible task has no satisfying run since its previous fire. */
   function isOverdue(task: TaskDefinition, history: RunResult[], now: Date): boolean {
     const fire = previousFireTime(task.schedule, now);
     if (fire === null) return false; // no computable fire (e.g. impossible cron) → not overdue
     const fireMs = fire.getTime();
     const satisfied = history.some(
       (r) =>
         r.taskId === task.id && isSatisfyingRun(r) && new Date(r.completedAt).getTime() >= fireMs
     );
     return !satisfied; // includes never-run (no matching history)
   }

   /**
    * Select the maintenance tasks to run for an on-demand sweep (D3/D5).
    * Operates only on sweep-eligible tasks (`excludeFromHumanSweep !== true`)
    * in every mode. Deterministic under the injected `filter.now`.
    *
    * - `overdue`: eligible tasks with no satisfying run since their previous fire.
    * - `all`:     every eligible task.
    * - `ids`:     the eligible subset named in `filter.ids` (a named excluded id
    *              is dropped, honoring "excluded tasks never run in either path").
    */
   export function selectTasks(
     tasks: TaskDefinition[],
     history: RunResult[],
     filter: TaskSelectionFilter
   ): TaskDefinition[] {
     const eligible = tasks.filter((t) => t.excludeFromHumanSweep !== true);
     switch (filter.mode) {
       case 'all':
         return eligible;
       case 'ids': {
         const wanted = new Set(filter.ids ?? []);
         return eligible.filter((t) => wanted.has(t.id));
       }
       case 'overdue':
         return eligible.filter((t) => isOverdue(t, history, filter.now));
     }
   }
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/overdue.test.ts` — observe PASS.
5. Run: `harness validate`
6. Commit: `feat(maintenance): add selectTasks overdue selection`

### Task 5: Barrel-export the selection surface + final validation

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/maintenance/index.ts`, `packages/orchestrator/src/index.ts` | **Category:** integration

1. In `packages/orchestrator/src/maintenance/index.ts`, after the `cronMatchesNow` export (line ~32), add:
   ```ts
   export { selectTasks, previousFireTime } from './overdue';
   export type { TaskSelectionFilter } from './overdue';
   ```
2. In `packages/orchestrator/src/index.ts`, after the maintenance CLI surface block (the `export type { TaskDefinition, TaskType, RunOrigin, RunMode } ...` line, ~line 67), add:
   ```ts
   // On-demand maintenance pipeline (Phase 2) — overdue/selection helper consumed
   // by the `harness maintenance run` CLI subcommand without booting an orchestrator.
   export { selectTasks } from './maintenance/overdue';
   export type { TaskSelectionFilter } from './maintenance/overdue';
   ```
3. Typecheck + build the package: `pnpm --filter @harness-engineering/orchestrator build`
4. Run the full maintenance test suite to confirm nothing regressed:
   `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/maintenance/`
5. [checkpoint:human-verify] Run `harness check-arch` (the arch slice of `harness validate`). A new source file (`overdue.ts`, ~80 lines) increases the orchestrator `module-size` total. If `check-arch` reports a `module-size` **Regression** line, refresh ONLY the `module-size.value` (+ `updatedAt`/`updatedFrom`) entry for the orchestrator in the repo-root aggregate baseline `.harness/arch/baselines.json` — the same minimized approach Phase 1 used (reconstruct from HEAD changing only that one value; do NOT use `--module --update-baseline`, which writes a module-scoped baseline that causes false global regressions — known clobber hazard). Note: `harness validate` already reports ~364 PRE-EXISTING project-wide baseline issues (roadmap/design-token/CLI) unrelated to this work and NONE in the maintenance module — those are not blockers. Confirm the only new regression is `overdue.ts` module-size before committing.
6. Commit: `feat(maintenance): barrel-export selectTasks selection helper`

## Traceability (truth → task)

| Observable Truth                    | Task(s)   |
| ----------------------------------- | --------- |
| 1 (interface field)                 | Task 1    |
| 2 (exact excluded set)              | Task 2    |
| 3 (previousFireTime)                | Task 3    |
| 4 (selectTasks modes + determinism) | Task 4    |
| 5 (barrel exports)                  | Task 5    |
| 6 (tests + validate green)          | Tasks 2–5 |

## Uncertainties

- [RESOLVED] History type — confirmed `RunResult[]`, no `HistoryEntry` exists (reporter.ts).
- [RESOLVED] Cron reuse — `cronMatchesNow` backward scan; no new dependency.
- [RESOLVED→DECISION] `ids` naming an excluded task — drop silently (D-P2-b), CLI layer warns in Phase 3.
- [ASSUMPTION] `no-issues` counts as a satisfying run alongside `success` (D-P2-a). If a future check should re-run despite `no-issues`, revisit `isSatisfyingRun`. Low risk — both denote a clean check execution.
- [DEFERRABLE] Whether `previousFireTime` should be part of the ROOT barrel (currently only the maintenance-module barrel). Exported from root is not required by Phase 2; Phase 3 CLI imports `selectTasks` only.

## Concerns

- **Arch baseline drift** on adding `overdue.ts` — handled by the Task 5 checkpoint. The baseline is the repo-root aggregate `.harness/arch/baselines.json`; refresh only the orchestrator `module-size.value` (scope-clobber hazard; `--module --update-baseline` causes false global regressions). `harness validate` already carries ~364 pre-existing unrelated baseline issues — do not treat those as introduced by this phase.
- **Worktree HEAD force-reset** hazard (concurrent automation) — every task is individually committable; commit after each so no uncommitted work is lost.
