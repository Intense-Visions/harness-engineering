# Running Maintenance On Demand

Harness ships a registry of 22 built-in maintenance tasks — dead-code detection,
doc-drift, dependency-health, security scanning, hotspots, project-health, and
more. Normally those fire on a schedule inside a continuously-running
orchestrator. But you do not need an orchestrator to answer the everyday
question: _"which maintenance did I forget to run?"_

`harness maintenance run` is an infra-free, report-first sweep over that same
registry. It computes what is actually **overdue**, runs only those checks,
reports what needs attention, and — by default — changes nothing in your
working tree.

```bash
harness maintenance run
```

That single command runs the overdue, sweep-eligible tasks in report mode and
prints a sorted table of what it found. No orchestrator, no gateway, no PRs.

## What the command does

`harness maintenance run [taskId...]` selects a set of maintenance tasks, runs
them, and consolidates the results:

- **Default (no args):** run only the tasks that are **overdue** per their cron
  schedule and last-run timestamp, in **report mode** (no fixes, no PRs).
- It reuses the same `TaskRunner` the cron scheduler uses — there is exactly one
  executor, so the on-demand path can never drift from the scheduled one.
- It writes a machine-readable summary to
  `.harness/maintenance/last-run-summary.json` and records each run in the same
  `history.json` the scheduler reads.

### Flags

| Flag                | Effect                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| _(none)_            | Run **overdue**, sweep-eligible tasks in report mode                                                |
| `--all`             | Run **all** sweep-eligible tasks (ignore overdue computation)                                       |
| `--only <a,b>`      | Run only these task ids                                                                             |
| `--skip <a,b>`      | Exclude these task ids from the selection                                                           |
| `--fix`             | Switch to fix mode — dispatch a fix agent that commits to the worktree (needs a configured backend) |
| `--concurrency <n>` | Parallel cap for report-mode checks (default `min(cores-2, 8)`)                                     |
| `--json`            | Emit the consolidated report as JSON to stdout                                                      |
| `--path <path>`     | Project root (default `.`)                                                                          |

`harness maintenance list` and `harness maintenance show <id>` are unchanged —
use them to inspect the registry and a task's run history.

## Overdue-aware default vs `--all`

The default invocation does not run every check — it runs the **neglected**
ones. For each sweep-eligible task it compares the task's cron schedule against
the last successful run recorded in `.harness/maintenance/history.json`:

- A task with **no successful run since its last scheduled fire time** is
  overdue and gets run.
- A task that has run since its last fire time is current and is skipped.
- A sweep-eligible task that has **never run** is treated as overdue.

This turns "which maintenance did I forget?" from a memory problem into a
computed answer. When nothing is overdue, the command prints
`All maintenance current.` and exits `0`.

Use `--all` when you want a full sweep regardless of schedule — for example
before a release, or the first time you run the command in a project with no
history. `--only` / `--skip` scope the selection to specific task ids.

### Sweep-eligibility — what never runs on demand

Four built-in tasks are **excluded** from the human sweep because they are infra
hygiene, not developer-facing health signals. They never run via
`harness maintenance run`, even with `--all` or an explicit `--only`:

| Excluded task                  | Why                                                           |
| ------------------------------ | ------------------------------------------------------------- |
| `main-sync`                    | 15-minute git fast-forward — plumbing, not a finding          |
| `perf-baselines`               | re-baselines metrics against an arbitrary moment              |
| `session-cleanup`              | deletes orchestrator session state — unsafe to trigger ad hoc |
| `proposal-provenance-backfill` | one-shot migration on an impossible cron                      |

Asking for one of these by id (`--only main-sync`) is a hard error (exit `2`),
not a silent skip — so you always know coverage was what you intended. Custom
maintenance tasks are eligible by default unless they opt out with
`excludeFromHumanSweep: true`.

## Report-first vs `--fix` (and the honest caveat)

The on-demand sweep is **report-first by design.** The default never opens a
branch, dispatches a fix agent, or opens a PR — it computes findings and records
them. This keeps the surprising, repo-mutating behavior out of the path a
developer reaches for to simply _look_.

`--fix` opts into fix mode, which threads the **real agent dispatcher** (#679)
into its dispatch-on-findings behavior (mechanical-AI dispatches when findings
exist, pure-AI always, report-only records only). The agent commits its fixes
directly to your worktree — there is **no PR** (so `prUrl` stays `null`); `fixed`
reflects the actual number of commits the agent landed. Fix mode runs
**sequentially** to avoid duplicate-dispatch and worktree-collapse hazards.

> **Honest caveat — `--fix` needs a configured agent backend.** Fix mode
> resolves an agent backend from `agent.backends` in `harness.orchestrator.md`
> (the same config the cron orchestrator uses, via `maintenance.aiBackend`,
> default `local`). When that backend is configured, `--fix` really dispatches.
> When it is **not** (a plain checkout with no `agent.backends`), `--fix` does
> **not** crash and does **not** pretend to work — it skips dispatch and says so
> on **stderr** (stdout stays a clean JSON report):
>
> ```
> --fix: no agent backend configured for maintenance dispatch — dispatch was
> skipped and nothing was fixed. Configure agent.backends in
> harness.orchestrator.md (and maintenance.aiBackend), or run maintenance via
> the orchestrator.
> ```
>
> So: with a backend configured, `--fix` fixes for real and commits to your
> worktree; without one, treat `--fix` as "run the checks the way cron would"
> and configure a backend (or use the orchestrator) when you actually want fixes.

## Reading the report

Every run writes a consolidated report and prints it. The console output is a
table sorted failures-first, then findings-descending:

```
TASK               STATUS     FINDINGS  SUMMARY
dead-code          success    12        12 finding(s)
doc-drift          success    4         4 finding(s)
dependency-health  success    1         1 finding(s)
project-health     no-issues  0         clean
security           no-issues  0         clean

3 overdue but now current: dead-code, doc-drift, dependency-health
```

The same data lands in `.harness/maintenance/last-run-summary.json` as a
`ConsolidatedReport`:

```json
{
  "generatedAt": "2026-06-27T12:00:00.000Z",
  "mode": "report",
  "fix": false,
  "exitCode": 0,
  "tasks": [
    {
      "taskId": "dead-code",
      "status": "success",
      "findings": 12,
      "fixed": 0,
      "prUrl": null,
      "summary": "12 finding(s)"
    }
  ],
  "overdueNowCurrent": ["dead-code", "doc-drift", "dependency-health"]
}
```

A few things to know when reading it:

- **`findings` is a count, not a severity.** There is no per-finding severity in
  the report — triage by status, then by findings count.
- **`status: 'skipped'` is not clean.** A skipped task hit a precondition gate
  and **never ran** — it told you nothing. Do not fold it in with the clean
  tasks.
- **`overdueNowCurrent`** lists the tasks that were overdue going in and have now
  satisfied their schedule because this run succeeded.
- **`--json`** emits the exact same object to stdout. On the nothing-overdue
  happy path it still emits a parseable report with `tasks: []` (the plain
  `All maintenance current.` sentinel is the non-`--json` output only).

## Exit codes for CI

The exit code is designed so CI can gate on _broken checks_ without failing on
_findings_:

| Code | Meaning                                                                     |
| ---- | --------------------------------------------------------------------------- |
| `0`  | Ran to completion — including "tasks had findings." Findings are not fails  |
| `1`  | At least one task **failed to execute** (a check crashed, dispatch errored) |
| `2`  | Invalid invocation (unknown/excluded task id, bad flags, `--all` + ids)     |

This means a CI job can run `harness maintenance run --all --json`, surface the
findings in logs or an artifact, and fail the build only when a check itself is
broken — not merely because it found something.

```bash
# CI: run a full sweep, capture the report, fail only on execution errors.
harness maintenance run --all --json > maintenance-report.json
```

## The `/harness:maintenance-pipeline` skill

For an interactive sweep, the `harness-maintenance-pipeline` skill (slash command
`/harness:maintenance-pipeline`) is a thin wrapper over this CLI. It:

1. Runs `harness maintenance run --json` (overdue, report mode).
2. Parses the consolidated report and presents a triaged, human-readable summary
   bucketed by status (failed to execute / needs attention / skipped / clean).
3. Asks you **in plain text** which tasks, if any, to fix — then re-invokes
   `harness maintenance run --only <ids> --fix` for the ones you pick.
4. Relays the result honestly: real `fixed` counts when a backend is configured,
   or the honest no-backend skip notice when `--fix` could not dispatch.

The skill owns no state of its own — the CLI writes the artifacts; the skill only
reads and relays. Reach for it when you want a guided sweep-and-triage; reach for
the raw CLI when you want a scriptable, non-interactive run.

## How this relates to the cron scheduler

On-demand maintenance **complements** the cron `MaintenanceScheduler` — it does
not replace it. They share everything that matters:

- **Same registry.** Both run the same 22-task registry. There is no second
  definition of "what maintenance is."
- **Same executor.** Both call the same `TaskRunner`. The only difference is a
  `mode` argument: cron runs `fix` (autonomous, opens PRs on schedule, under
  leader election); the CLI defaults to `report` (human-invoked, safe, no PRs).

The division of labor:

| Concern        | Cron scheduler                          | `harness maintenance run`                    |
| -------------- | --------------------------------------- | -------------------------------------------- |
| Trigger        | Schedule, inside a running orchestrator | A developer, on demand, no infra             |
| Default action | Fix and open PRs                        | Report only                                  |
| Selection      | Whatever the cron fires                 | Overdue (or `--all` / `--only`)              |
| Eligibility    | All tasks                               | Sweep-eligible only (4 infra tasks excluded) |

If you run an orchestrator, keep letting cron do its autonomous fix-and-PR work.
The on-demand sweep is there for the times you do not — or for when you just want
to look before a release without waiting for the next scheduled tick.

## See also

- [Custom maintenance jobs](../knowledge/orchestrator/custom-maintenance-jobs.md) — declaring your own recurring tasks
- [On-demand maintenance sweep](../knowledge/orchestrator/on-demand-maintenance-sweep.md) — the internals (one executor, overdue computation, sweep-eligibility)
- ADR [0049](../knowledge/decisions/0049-single-maintenance-executor-run-mode.md) — one executor, two callers
- ADR [0050](../knowledge/decisions/0050-report-first-on-demand-maintenance.md) — report-first on-demand
