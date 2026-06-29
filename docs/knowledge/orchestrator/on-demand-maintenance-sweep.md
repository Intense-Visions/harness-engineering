---
type: business_process
domain: orchestrator
tags: [maintenance, on-demand, overdue, sweep-eligibility, task-runner, cli]
---

# On-Demand Maintenance Sweep

**Related ADRs:** `docs/knowledge/decisions/0049-single-maintenance-executor-run-mode.md`
(one executor, two callers) and
`docs/knowledge/decisions/0050-report-first-on-demand-maintenance.md`
(report-first default).

The cron `MaintenanceScheduler` is not the only way the 22-task registry runs.
`harness maintenance run [taskId...]` adds a **human-invoked, report-first**
entry point that sweeps the maintenance which is actually _overdue_ — without
standing up an orchestrator, gateway, or `ClaimManager`, and without creating a
second definition of "what maintenance is." Cron keeps its autonomous
fix-and-PR role; the on-demand sweep complements it over the same registry and
the same executor.

## One executor, two callers

Per-task execution lives in `TaskRunner`
(`packages/orchestrator/src/maintenance/task-runner.ts`). Both the cron
scheduler and the CLI call the **same** `run` method; the only difference is a
`RunMode` argument (`packages/orchestrator/src/maintenance/types.ts`):

```ts
async run(
  task: TaskDefinition,
  origin: RunOrigin = 'cron',   // provenance: 'cron' | 'cli' | api | chain
  mode: RunMode = 'fix',        // 'report' | 'fix'
): Promise<RunResult>;
```

- **`mode: 'fix'`** (the default — cron's verbatim behavior): mechanical-AI
  dispatches the fix skill when findings exist, pure-AI always dispatches,
  report-only records only. Because `fix` is the default, the scheduler call
  site is unchanged.
- **`mode: 'report'`** (the CLI default): run the task's check step only,
  persist output, and take the existing no-dispatch branch. For every task type
  this means _compute findings, record them, never dispatch a fix agent or open
  a PR._

There is no second executor. The CLI (`packages/cli/src/commands/maintenance-run.ts`)
imports `TaskRunner` and builds it with no `prManager` and a no-op
`agentDispatcher`, so the report path is structurally incapable of mutating the
repo. This is the "one executor, two callers" contract from ADR 0049 — it
prevents a parallel CLI executor from drifting out of sync with the cron path.

**Check idempotency contract:** report mode assumes a task's check step is
side-effect-free (or writes only to its own `.harness/maintenance/<id>/` output
dir). Tasks that cannot honor that must set `excludeFromHumanSweep`.

## Sweep-eligibility

Not every registered task belongs in a developer's on-demand sweep. The
`TaskDefinition` interface carries an optional
`excludeFromHumanSweep?: boolean`; `selectTasks` filters on it
(`excludeFromHumanSweep !== true` ⇒ eligible, so custom tasks default in unless
they opt out). Four built-ins set it `true`:

| Excluded task                  | Why it is infra hygiene, not a health signal                       |
| ------------------------------ | ------------------------------------------------------------------ |
| `main-sync`                    | 15-min git fast-forward — plumbing, not a developer-facing finding |
| `perf-baselines`               | re-baselines metrics against an arbitrary ad-hoc moment            |
| `session-cleanup`              | deletes orchestrator session state — unsafe outside its lifecycle  |
| `proposal-provenance-backfill` | one-shot migration on an impossible cron (`0 0 31 2 *`)            |

Keeping eligibility on the registry (not a hardcoded id list in the CLI) means
there is one source of truth. A requested id that is known-but-excluded is a
fatal invocation error (exit 2), not a silent skip.

## Overdue computation

The default invocation runs only **overdue** sweep-eligible tasks. Overdue is
computed in `selectTasks` (`packages/orchestrator/src/maintenance/overdue.ts`)
from two on-disk inputs already maintained by cron:

- **`task.schedule`** — the task's cron expression (the registry).
- **`.harness/maintenance/history.json`** — the last successful run per task.

For each eligible task: find its last `success`, compute the previous cron fire
time at/before `now`, and mark it **overdue** when there has been no successful
run since that fire time.

- **Never-run** sweep-eligible tasks are treated as overdue (they have never
  satisfied their schedule).
- A schedule with no computable previous fire time at/before `now` (e.g. an
  impossible one-shot backfill cron) is **not** overdue — and those tasks are
  already filtered out by `excludeFromHumanSweep`, so the two rules agree.
- **`now` is injected**, never read internally, so selection is deterministic
  and unit-testable. `mode: 'all'` returns every eligible task; `mode: 'ids'`
  returns a named subset; default is `overdue`.

## Report and exit codes

The CLI consolidates over the existing `RunResult` shape (no new result type),
writes `.harness/maintenance/last-run-summary.json`, and renders a sorted
`task | status | findings | summary` table with an "N overdue but now current"
footer. `--json` emits the same `ConsolidatedReport`. Exit codes are
CI-friendly: `0` ran to completion (findings are NOT failures), `1` at least
one task failed to execute, `2` invalid invocation.

`--fix` threads `mode: 'fix'` through the same executor (sequential, to avoid
duplicate-dispatch / worktree-collapse hazards) and dispatches the real
`createAgentDispatcher` (#679) — resolving the configured `agent.backends`
backend, driving an `AgentRunner` session, and counting commits via a `HEAD`
diff. When no agent backend is configured for the repo, the CLI skips dispatch
and prints `NO_BACKEND_FIX_WARNING` to **stderr** (stdout stays clean JSON),
reporting `fixed: 0` rather than implying anything was changed.

## See also

- `docs/knowledge/decisions/0049-single-maintenance-executor-run-mode.md`
- `docs/knowledge/decisions/0050-report-first-on-demand-maintenance.md`
- `docs/knowledge/orchestrator/custom-maintenance-jobs.md` (the same registry, custom tasks)
- `docs/guides/on-demand-maintenance.md` (the developer-facing how-to)
- `docs/changes/maintenance-pipeline/proposal.md`
