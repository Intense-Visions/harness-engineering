# Harness Maintenance Pipeline

> One on-demand entry point for project maintenance. Runs the checks that are actually overdue, triages what needs attention, and asks you — in plain text — which to fix. A thin wrapper over `harness maintenance run`; it owns no state of its own.

## When to Use

- You want to answer "which maintenance did I forget to run?" without standing up an orchestrator.
- At a milestone or before a release, to sweep overdue health checks (dead code, doc drift, dependency health, security, hotspots, project health).
- When you want a report first and an explicit, opt-in fix step — never a surprise PR.
- NOT for running a single known check — call that skill or `harness maintenance run --only <id>` directly.
- NOT for the autonomous cron fix-and-PR path — that is the orchestrator scheduler's job; this is the human-invoked, report-first path.

## What this skill does NOT do

- It does not implement any maintenance check, scheduler, or registry — the CLI and the existing 22-task registry are the single source of truth.
- It does not write artifacts. The CLI writes `.harness/maintenance/last-run-summary.json` and records history; this skill only reads and relays.
- It does not open PRs. Fixes are opt-in via the explicit fix step; when a backend is configured, `--fix` dispatches a real agent that commits to the worktree (no PR). When no backend is configured it honestly skips (see Phase 3 / FIX).

## Process

### Phase 1: SWEEP — run the overdue report

1. Run the report-mode sweep and capture stdout:

   ```bash
   harness maintenance run --json
   ```

   No flags = overdue, sweep-eligible tasks only, report mode (no PRs). Capture both stdout (the JSON report) and the exit code.

2. Parse stdout as a `ConsolidatedReport`:

   ```ts
   // shape emitted by the CLI (packages/cli/src/commands/maintenance-run.ts)
   {
     generatedAt: string;
     mode: 'report' | 'fix';
     fix: boolean;
     exitCode: 0 | 1;
     tasks: Array<{
       taskId: string;
       status: 'success' | 'failure' | 'skipped' | 'no-issues';
       findings: number;       // a COUNT — there is no per-finding severity
       fixed: number;
       prUrl: string | null;
       summary: string;        // 'clean' | `${n} finding(s)` | error text
       error?: string;
     }>;
     overdueNowCurrent: string[];
   }
   ```

   If capturing stdout is awkward, read the same object from `.harness/maintenance/last-run-summary.json` with the Read tool.

3. Read the **exit code**: `0` = the sweep completed (findings are NOT failures); `1` = at least one check failed to execute; `2` = invalid invocation (a bug in how this skill called the CLI — fix the invocation, do not report it as a finding).

4. If `tasks` is empty, tell the human "All maintenance is current — nothing overdue." and stop. Do not invent work.

### Phase 2: TRIAGE — present a human-readable summary

There is no per-finding severity in the report, so triage by **status** then **findings count** (rows arrive pre-sorted failures-first, then findings-descending). Bucket the tasks:

- **Failed to execute** — `status === 'failure'`. The check itself crashed; surface `summary`/`error`. These are the most urgent: a finding you cannot see is worse than one you can.
- **Needs attention** — `findings > 0` (and not a failure). Order by `findings` descending. Derive a coarse domain from the task id (e.g. `dead-code`, `doc-drift`, `dependency-health`, `security`, `hotspots`, `project-health`).
- **Skipped (couldn't run)** — `status === 'skipped'`. A precondition gate was not met, so the check **never ran** — it is NOT clean, it has simply told you nothing. Report these distinctly from clean tasks so the human knows coverage was incomplete (and can decide whether the precondition is worth satisfying). Summarize as a count and, if useful, surface `summary` for why it was gated.
- **Clean** — `status` is `no-issues`/`success` with `findings === 0`. The check ran and found nothing. Summarize as a count ("8 checks clean"); do not enumerate unless asked. Do NOT fold `skipped` tasks in here — a gated check that never ran is not a clean result.

Render a compact summary, for example:

```
Maintenance sweep (report mode) — 18 overdue tasks ran, exit 0

Failed to execute (1):
  stale-constraints   — check crashed: <summary>

Needs attention (3):
  dead-code           — 12 finding(s)
  doc-drift           —  4 finding(s)
  dependency-health   —  1 finding(s)

Skipped — couldn't run (1): license-audit (precondition not met)

Clean (13): project-health, hotspots, security, …
```

If `overdueNowCurrent` is non-empty, add a one-line footer: "N tasks were overdue and are now marked current."

### Phase 3: FIX — ask in plain text, then opt in

1. **Ask the human in plain text, in your own reply.** Do NOT use `emit_interaction` and do NOT use `AskUserQuestion` for this — those channels do not reliably reach the human (an `emit_interaction` ask collapses to "Called harness" and the human never sees the question). Write the question as ordinary text, listing the actionable task ids (the "Failed to execute" and "Needs attention" buckets) and asking which, if any, to fix. For example:

   > These tasks have findings: `dead-code` (12), `doc-drift` (4), `dependency-health` (1). Which would you like me to fix? Reply with a comma-separated list of task ids, "all", or "none".

   Then stop and wait for the human's reply. Do not proceed to a fix without an explicit answer.

2. **If the human picks tasks**, re-invoke the CLI in fix mode, scoped to exactly those ids — and capture **both** streams separately:

   ```bash
   harness maintenance run --only <comma,separated,ids> --fix --json
   ```

   stdout stays a clean, parseable `ConsolidatedReport` (parse it as JSON, same shape as the sweep). Any honesty notice is written to **stderr**, NOT stdout — so capture stderr too (e.g. redirect to a separate file/buffer) and inspect it. If you only read stdout you will silently drop the notice; if you merge stderr into stdout you will break `JSON.parse`. Keep them apart: JSON ← stdout, notice ← stderr.

3. **Relay the result honestly.** `--fix` threads fix mode through the **real agent dispatcher** (#679): when a backend is configured for the default maintenance backend, the agent runs and commits its fixes directly to the worktree — there is **no PR** (`prUrl` stays `null`), and `fixed` is the real commit count. When **no** backend is configured (a plain checkout with no `agent.backends` in `harness.orchestrator.md`), `--fix` does not crash and does not pretend to work — it skips dispatch and prints this notice to **stderr** (which is why step 2 captures stderr separately):

   > `--fix: no agent backend configured for maintenance dispatch — dispatch was skipped and nothing was fixed. Configure agent.backends in harness.orchestrator.md (and maintenance.aiBackend), or run maintenance via the orchestrator.`

   Inspect the captured stderr for that notice and, if present, surface it verbatim. Report what the CLI actually did (the stdout report's `fixed` counts; `prUrl` is always `null` — there is no PR) — never claim a fix was applied or a PR opened when the report does not show one.

4. **If the human picks "none"**, stop. The report stands on its own.

## Harness Integration

- **`harness maintenance run --json`** — the report-mode sweep this skill wraps. Runs overdue, sweep-eligible tasks only and emits the `ConsolidatedReport` to stdout (also written to `.harness/maintenance/last-run-summary.json`). This is the single entry point — the skill adds no execution path of its own.
- **`harness maintenance run --only <ids> --fix --json`** — the opt-in fix leg, scoped to the ids the human picked. Threads `mode: 'fix'` through the same `TaskRunner`, using the real agent dispatcher (#679). Capture stdout (the JSON report) and stderr **separately**: when no agent backend is configured it prints the honest no-backend skip notice to stderr (stdout stays clean JSON) — inspect that captured stderr and relay any notice verbatim.
- **`harness maintenance list` / `harness maintenance show <id>`** — inspect the registry (the 22-task source of truth) when the human wants to know what a task id means before choosing to fix it.
- **Read tool on `.harness/maintenance/last-run-summary.json`** — the documented fallback parse path if capturing `--json` stdout is awkward on a given platform. The skill never writes this file; the CLI owns it.

## Gates

- **Plain-text ask only.** The "which to fix?" question must be ordinary text in your reply. Never route it through `emit_interaction` or `AskUserQuestion`.
- **Report before fix, always.** Never pass `--fix` on the first sweep. Fix is opt-in after the human sees the report and chooses.
- **No invented findings.** Report only what the `ConsolidatedReport` contains. If `tasks` is empty, say so and stop.
- **No self-persistence.** Do not write `.harness/maintenance/*` or any report file — the CLI owns artifacts.
- **Honest fix status.** Relay what the CLI reports: real `fixed` counts when a backend dispatched, or the no-backend skip notice (if it appears on stderr) when it did not. `prUrl` is always `null` — the agent commits to the worktree; never imply a PR was opened.

## Success Criteria

- Ran `harness maintenance run --json`, parsed the consolidated report, and read the exit code.
- Presented a triaged summary bucketed by status (failed / needs-attention / clean) and ordered by findings count.
- Asked the human in plain text which tasks to fix, and waited for a reply.
- On opt-in, re-invoked `--only <ids> --fix` and relayed the result (real `fixed` counts, or the honest no-backend skip notice if it appeared) verbatim.
- Wrote no files of its own.

## Examples

### Example: Milestone sweep with mixed results

The human invokes the skill before tagging a release.

1. **SWEEP:** Run `harness maintenance run --json`. Exit code `0`; `tasks` has 18 rows; `overdueNowCurrent` lists 18 ids.
2. **TRIAGE:** Bucket the pre-sorted rows:

   ```
   Maintenance sweep (report mode) — 18 overdue tasks ran, exit 0

   Failed to execute (1):
     stale-constraints   — check crashed: cannot read .harness/constraints.json

   Needs attention (3):
     dead-code           — 12 finding(s)
     doc-drift           —  4 finding(s)
     dependency-health   —  1 finding(s)

   Clean (14): project-health, hotspots, security, …
   18 tasks were overdue and are now marked current.
   ```

3. **FIX (plain-text ask):** In the reply, write: "These tasks have findings: `dead-code` (12), `doc-drift` (4), `dependency-health` (1), plus `stale-constraints` failed to execute. Which would you like me to fix? Reply with a comma-separated list of task ids, \"all\", or \"none\"." Then stop and wait.
4. The human replies `dead-code,doc-drift`. Run `harness maintenance run --only dead-code,doc-drift --fix`. With a backend configured, the agent dispatches and commits its fixes to the worktree — report the real `fixed` counts from the report (`prUrl: null` — there is no PR). If no backend is configured, the CLI prints to stderr: `--fix: no agent backend configured for maintenance dispatch — dispatch was skipped and nothing was fixed. Configure agent.backends in harness.orchestrator.md (and maintenance.aiBackend), or run maintenance via the orchestrator.` Relay that verbatim and report `fixed: 0`, `prUrl: null` — do not claim a fix or PR.

### Example: Nothing overdue

Run `harness maintenance run --json`. On the nothing-overdue happy path stdout is still a parseable `ConsolidatedReport` whose `tasks` is an **empty array** (`tasks: []`, `exitCode: 0`) — NOT a plain `All maintenance current.` sentinel (that human string is emitted only on the non-`--json` path). So `JSON.parse(stdout)` succeeds; read `tasks.length === 0`. Tell the human "All maintenance is current — nothing overdue." and stop. Do not invent work or run `--fix`.

## Rationalizations to Reject

| Rationalization                                        | Reality                                                                                                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "I'll just run `--fix` directly to save a round-trip." | Report-first is the whole point. A surprise fix on an on-demand sweep is exactly the hazard this path avoids.                                                              |
| "I'll ask via `emit_interaction` so it's structured."  | That ask never reaches the human — it collapses to "Called harness". Ask in plain text.                                                                                    |
| "The report shows findings, so I'll say I fixed them." | `--fix` only fixes when a backend dispatched; relay what the CLI reports (real `fixed` counts, or the no-backend skip notice). `prUrl` is always `null`. Do not overclaim. |
| "There's no severity field, so I'll assign my own."    | Triage by the status + findings count the report actually provides. Do not fabricate a severity taxonomy.                                                                  |
