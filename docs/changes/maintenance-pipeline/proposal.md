---
title: On-Demand Maintenance Pipeline
status: proposed
owner: Chad Warner
keywords:
  [maintenance, on-demand, overdue, cli, task-registry, task-runner, report-first, scheduler]
---

# On-Demand Maintenance Pipeline

## Overview

The harness already has a capable maintenance subsystem — `MaintenanceScheduler`
plus a 22-task registry (`packages/orchestrator/src/maintenance/task-registry.ts`)
covering mechanical-AI (7), pure-AI (4), report-only (7), and housekeeping (4)
tasks. But that subsystem only fires inside a **continuously-running
orchestrator** with `maintenance.enabled`. There is no path for a developer to
run maintenance on demand: the `harness maintenance run` CLI subcommand is
explicitly deferred (`packages/cli/src/commands/maintenance.ts` ships only `list`
and `show`), `trigger_maintenance_job` requires the orchestrator gateway, and
`harness-release-readiness` only fans maintenance out at release time.

Concrete evidence of the gap: in `.harness/maintenance/history.json`, the most
recent **substantive** (non-housekeeping) task run was `project-health @
2026-06-02` — roughly 3.5 weeks before this spec. Recent history is dominated
entirely by the 15-minute `main-sync` housekeeping task; the developer-facing
health tasks (dead-code, doc-drift, dependency-health, hotspots, security) have
not run in that window even while an orchestrator was intermittently up. So even
when cron fires, only the cheap housekeeping reliably runs, and there is still no
way for a developer to trigger the substantive checks themselves. Maintenance
falls back to remembering each individual skill, which does not happen reliably.
This is the originating complaint: "there are a lot of various maintenance
skills; it is difficult to think of them all and run them regularly."

This change adds a single, infra-free, on-demand entry point — the deferred
`harness maintenance run` CLI subcommand, plus a thin `/harness:maintenance-pipeline`
skill on top of it — that runs the maintenance which is actually **overdue** and
reports what needs attention, without standing up an orchestrator and without
creating a second definition of "what maintenance is."

This builds directly on the autonomous subsystem from
`docs/changes/scheduled-maintenance/proposal.md` (prior art), which explicitly
lists on-demand/CLI execution as out of scope. The two are complementary: cron
keeps its autonomous fix-and-PR role; this adds the human-invoked, report-first
path.

## Goals

1. **One on-demand entry point.** `harness maintenance run` (and
   `/harness:maintenance-pipeline`) runs maintenance without an orchestrator or
   gateway process.
2. **Compute what's neglected.** Default invocation runs only tasks that are
   **overdue** per their cron schedule + last-run timestamp, turning "which
   maintenance did I forget?" from a memory problem into a computed answer.
3. **Safe by default.** The human sweep is report-first: it never opens PRs or
   dispatches fix agents unless `--fix` is passed.
4. **One executor, one registry.** Both the cron scheduler and the CLI run tasks
   through a single shared runner; the existing registry stays the only source of
   truth for "what maintenance is."
5. **Consolidated, actionable report.** One sorted view of task / status /
   findings, persisted and machine-readable, usable in CI.

## Non-Goals (YAGNI)

- Not replacing or reimplementing the cron scheduler — it keeps its autonomous
  fix-and-PR role on schedule.
- Not auto-opening PRs by default — the human sweep is report-first.
- Not a new task registry or new maintenance checks — the existing registry is
  canonical.
- Not covering git-mutating housekeeping (`main-sync`, `perf-baselines`,
  `session-cleanup`) or one-shot backfills in the human sweep.
- Not external scheduler integration — orchestrator still owns the cron.

## Decisions

| #   | Decision                                                                                                                 | Rationale                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Layer = CLI engine + thin skill wrapper (not a standalone fan-out skill)                                                 | Keeps `task-registry.ts` as the single source of truth; a pure skill would be a third definition of "maintenance" and drift.                                      |
| D2  | Report-first by default; `--fix` opts into AI-dispatch / PRs                                                             | An on-demand human sweep must be safe and non-surprising; keeps worktree-collapse / duplicate-dispatch hazards out of the default path.                           |
| D3  | Overdue-aware default; `--all` forces full sweep                                                                         | Reuses cron schedules (registry) + last-run timestamps (`history.json`) already on disk to compute neglected maintenance — directly solving the originating pain. |
| D4  | Thread a `mode: 'report' \| 'fix'` through the existing `TaskRunner` (default `fix`) rather than build a second executor | Exactly one executor and one registry; CLI runs with no orchestrator/gateway coupling; `fix` default leaves the scheduler call site unchanged.                    |
| D5  | Human sweep excludes git-mutating housekeeping + one-shot backfills                                                      | Those are infra hygiene, not developer-facing health signals; including them adds risk and noise.                                                                 |

## Technical Design

### Shared runner: add a report mode to the existing `TaskRunner` (D4)

Per-task execution already lives in a dedicated, largely infra-free class:
`TaskRunner` in `packages/orchestrator/src/maintenance/task-runner.ts`, whose
public method is `run(task: TaskDefinition, origin: RunOrigin = 'cron')`. The
`MaintenanceScheduler` owns cron + leader election and calls into `TaskRunner`;
the executor is therefore already separated from the scheduling concern. D4 does
**not** require inventing a new free function — it requires threading a
**run mode** through the existing `TaskRunner` so the same executor serves both
cron (fix) and the CLI (report).

Concretely, add an explicit `mode` (rather than overloading `RunOrigin`) so
report-vs-fix is independent of who invoked it:

```ts
// packages/orchestrator/src/maintenance/types.ts  (extend)
export type RunMode = 'report' | 'fix';

// task-runner.ts — extend the existing signature (default 'fix' preserves
// current cron behavior, so the scheduler call site is unchanged):
async run(
  task: TaskDefinition,
  origin: RunOrigin = 'cron',
  mode: RunMode = 'fix',
): Promise<RunResult>;
```

- `mode: 'report'` runs the task's **check step** only
  (`runCheckStep`/report-only computation), persists output, and takes the
  no-dispatch branch — reusing the executor's existing skip path (the
  `wakeAgentExplicitlyFalse` / `findings === 0` early-return at
  `task-runner.ts:347`). For mechanical-AI and pure-AI tasks this means: compute
  findings, record them, **never** dispatch a fix agent or open a PR.
- `mode: 'fix'` is the current behavior verbatim: mechanical-AI dispatches the
  fix skill when findings exist, pure-AI always dispatches, report-only records
  only. Because `fix` is the default, the scheduler call site needs no change —
  one executor, two callers, zero duplication.
- **Check idempotency requirement:** report mode assumes a task's check step is
  side-effect-free (or writes only to its own `.harness/maintenance/<id>/`
  output dir). This holds for the registered checks today; the spec documents it
  as a contract so future checks don't smuggle repo mutations into the read path.
  Tasks that cannot honor it must set `excludeFromHumanSweep`.

`RunResult` already carries task id, status, findings, and output location, so no
new result type is introduced — the CLI consolidates over existing `RunResult`s.

### Overdue computation (D3)

```ts
// packages/orchestrator/src/maintenance/overdue.ts  (new)
export function selectTasks(
  tasks: TaskDefinition[],
  history: HistoryEntry[], // from .harness/maintenance/history.json
  filter: { mode: 'overdue' | 'all' | 'ids'; ids?: string[]; now: Date }
): TaskDefinition[];
```

- For each task: find its last `success` in history; compute the previous cron
  fire time at/before `now` from `task.schedule`. **Overdue** = no successful run
  since that fire time.
- **Never-run handling:** a sweep-eligible task with no history entry is treated
  as overdue (it has never satisfied its schedule). A task whose schedule has no
  computable previous fire time at/before `now` (e.g. the impossible
  `0 0 31 2 *` one-shot backfill cron) is **not** overdue — but those tasks are
  already excluded from the human sweep by `excludeFromHumanSweep`, so the two
  rules agree.
- `now` is injected (never `Date.now()` internally) so the computation is
  deterministic and unit-testable.
- `all` returns every sweep-eligible task; `ids` returns the named subset;
  default is `overdue`.
- **Sweep-eligibility (D5):** exclude `main-sync` (15-min git fast-forward — infra
  plumbing, not a health signal), `perf-baselines` (writes baseline metrics; a
  human running it ad hoc would re-baseline against an arbitrary moment),
  `session-cleanup` (deletes orchestrator session state — unsafe to trigger
  outside the orchestrator's own lifecycle), and `proposal-provenance-backfill`
  (a one-shot migration on an impossible cron). Encode this as an
  `excludeFromHumanSweep?: boolean` field added to the `TaskDefinition` interface
  (`packages/orchestrator/src/maintenance/types.ts:57` — an open interface, so the
  addition is non-breaking and the `as const` `BUILT_IN_TASKS` array still infers)
  and set `true` on those four entries. `selectTasks` filters on the flag; custom
  tasks default to eligible (`undefined` → included) unless they opt out. This
  keeps eligibility in the registry, not a hardcoded id list duplicated in the
  CLI.

### CLI surface

Implement the deferred subcommand in `packages/cli/src/commands/maintenance.ts`:

```
harness maintenance run [taskId...]
  (no args / no ids)   → run OVERDUE sweep-eligible tasks in report mode
  --all                → run all sweep-eligible tasks
  --only <a,b>         → run only these ids
  --skip <a,b>         → exclude these ids
  --fix                → mode=fix (dispatch agents / open PRs per task type)
  --concurrency <n>    → parallel cap (default = min(cores-2, 8))
  --json               → machine-readable consolidated report
  --path <path>        → project root (default '.')
```

- Existing `list` / `show` subcommands are untouched.
- Report-mode tasks (read-mostly) run in parallel under the concurrency cap. In
  `--fix` mode, tasks that dispatch agents run sequentially-grouped (or capped
  low) to avoid duplicate-dispatch / worktree-collapse hazards.
- Writes a consolidated summary to `.harness/maintenance/last-run-summary.json`
  plus console output: a table of `task | status | findings | summary`, sorted
  findings-first, with an "overdue but now current" footer.
- Exit codes: `0` = ran to completion (including "tasks had findings" — findings
  are not failures); `1` = at least one task **failed to execute** (check crashed,
  dispatch errored); `2` = invalid invocation (bad task id, unparseable flags).
  This lets CI gate on `1` while still surfacing findings in the report.

### Skill shape (thin wrapper)

New skill `harness-maintenance-pipeline` (Tier 2, `type: flexible`, triggers:
`manual`, `on_milestone`). It is not an executor — its SKILL.md:

1. Runs `harness maintenance run --json` (overdue, report mode).
2. Parses the consolidated report and presents a triaged, human-readable summary
   grouped by severity/domain.
3. For tasks with findings, asks the human **in plain text** which to fix, then
   re-invokes `harness maintenance run --only <ids> --fix` (or dispatches the
   corresponding fix skill).
4. Persists nothing of its own — the CLI owns artifacts.

`skill.yaml`: `tier: 2`, `stability: draft` initially,
`platforms: [claude-code, cursor, codex, gemini-cli]`, `tools: [Bash, Read]`. No
`depends_on` executor — it shells to the CLI.

## Integration Points

### Entry Points

- New CLI subcommand `harness maintenance run`
  (`packages/cli/src/commands/maintenance.ts`).
- New skill `harness-maintenance-pipeline` → slash command
  `/harness:maintenance-pipeline` (via `generate-slash-commands`).
- Extended `TaskRunner.run(task, origin, mode)` plus a new `selectTasks` helper
  (barrel export).

### Registrations Required

- CLI command registration: the new `run` subcommand attaches to the existing
  `maintenance` command in `packages/cli/src/commands/maintenance.ts`, which is
  already wired through `packages/cli/src/commands/_registry.ts` — no new
  top-level registry entry, just a new `.command('run')` on the existing builder.
- `TaskDefinition` interface change: add `excludeFromHumanSweep?: boolean` in
  `packages/orchestrator/src/maintenance/types.ts`; set it on the four excluded
  built-ins in `task-registry.ts`. If `CustomTaskDefinition` is a distinct type,
  add the same optional field there for parity.
- Skill tier assignment: add `maintenance-pipeline` to the Tier 2 list in
  `AGENTS.md`.
- Slash-command regeneration + gemini `.toml` + skills-catalog regeneration
  (handled by existing pre-commit/pre-push hooks). Edit the `claude-code` SKILL.md
  copy only — the other platform dirs are hardlinks/symlinks regenerated by hooks.
- Barrel export for the new `selectTasks` helper and the `RunMode` type.

### Documentation Updates

- `docs/knowledge/orchestrator/` — document the on-demand path alongside
  `tick-loop.md` and `custom-maintenance-jobs.md`.
- CLI reference / `AGENTS.md` command list.
- A short "running maintenance on demand" guide under `docs/guides/`.

### Architectural Decisions

- **D4 (single executor via `TaskRunner` run mode)** warrants an ADR — it
  establishes "one executor, two callers (cron + CLI)" as the
  maintenance-execution contract and prevents future reintroduction of a parallel
  executor.
- **D2 (report-first on-demand vs autonomous-fix on cron)** warrants an ADR — it
  codifies the safety boundary between human-invoked and scheduled maintenance.

### Knowledge Impact

New concepts: "on-demand maintenance sweep," "overdue computation from cron +
history," "sweep-eligibility." Relationship: CLI `run` and `MaintenanceScheduler`
both call the same `TaskRunner`.

## Success Criteria

1. `harness maintenance run` with no args runs only sweep-eligible tasks that are
   overdue per cron + `history.json`, in report mode, and opens no PRs.
2. When nothing is overdue, it prints "all maintenance current" and exits 0.
3. `--all` runs every sweep-eligible task; `--only` / `--skip` scope correctly;
   excluded housekeeping tasks (`main-sync`, etc.) never run in either path.
4. `--fix` reproduces the scheduler's per-type behavior (mechanical-AI dispatches
   on findings, pure-AI always, report-only records only).
5. The same `TaskRunner` executor is called by both the cron scheduler and the
   CLI (one executor — verified by the import graph: the CLI imports `TaskRunner`,
   no second execution path exists).
6. A CLI integration test invokes `maintenance run` in a fixture project with no
   orchestrator/gateway/`ClaimManager` constructed, and it completes and writes a
   report — proving the standalone path.
7. Overdue computation is deterministic under an injected `now`, unit-tested
   against fixtures covering: (a) a task with no history entry → overdue, (b) a
   task run after its last fire time → current, (c) an excluded impossible-cron
   task → filtered out before the overdue check.
8. The consolidated report is written to
   `.harness/maintenance/last-run-summary.json` and rendered as a sorted console
   table; `--json` emits the same data machine-readably.
9. Exit code is non-zero only on task execution failure, enabling CI use.
10. `/harness:maintenance-pipeline` runs the CLI, triages findings, and asks the
    human in plain text before dispatching any fix.

## Implementation Order

1. **Phase 1 — Add run mode to `TaskRunner`.** Thread `mode: 'report' | 'fix'`
   (default `fix`) through `TaskRunner.run`; report mode takes the no-dispatch
   branch. Scheduler call site unchanged. Existing scheduler tests stay green.
   (ADR for D4.)
2. **Phase 2 — Overdue + selection.** Add `selectTasks` + `excludeFromHumanSweep`
   flags in the registry; unit-test overdue computation against fixture histories
   with injected `now`.
3. **Phase 3 — CLI `run` subcommand.** Wire flags, parallelism caps (low/grouped
   for `--fix`), consolidated report + `last-run-summary.json`, exit codes.
   Integration tests. (ADR for D2.)
4. **Phase 4 — Skill wrapper.** Author `harness-maintenance-pipeline` SKILL.md +
   `skill.yaml`; register Tier 2; regenerate slash commands/catalog via hooks;
   plain-text triage flow.
5. **Phase 5 — Docs + knowledge.** Guide, orchestrator knowledge notes,
   `AGENTS.md` updates.
