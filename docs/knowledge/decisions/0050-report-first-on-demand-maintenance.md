---
number: 0050
title: Report-first on-demand maintenance, fix-dispatch opt-in
date: 2026-06-27
status: accepted
tier: medium
source: docs/changes/maintenance-pipeline/proposal.md
---

## Context

ADR [0049](0049-single-maintenance-executor-run-mode.md) established one
maintenance executor (`TaskRunner`) with two callers distinguished by a
`RunMode = 'report' | 'fix'`. The cron scheduler runs `'fix'` (dispatch agents,
open PRs); the new `harness maintenance run` CLI subcommand is the second caller.

That leaves a safety question (spec Decision D2): what should the **human-invoked**
on-demand sweep do by default? The cron path is autonomous and trusted — it runs
unattended, on a schedule, with leader election and the orchestrator's guardrails
around it. A developer typing `harness maintenance run` to answer "what
maintenance did I forget?" is a different context: they want findings, not
surprise branches, agent dispatches, or PRs appearing in their working tree.

There is also a hard constraint from the codebase: **no real AI fix-agent
dispatch exists anywhere in the repo.** The only `AgentDispatcher` is the
orchestrator's stub (`orchestrator.ts:686`), which logs "skill dispatch
integration pending" and returns `{ producedCommits: false, fixed: 0 }`. A
repo-wide search for a non-stub dispatch returns nothing. So `--fix` cannot
construct real dispatch in this phase — there is nothing to construct.

## Decision

**The on-demand sweep is report-first by default; `--fix` opts into the
fix-mode seam, and in this phase that seam is a documented no-op-dispatch with
no `PRManager`.**

- **Default = report mode.** `harness maintenance run` (no `--fix`) threads
  `mode: 'report'` into `TaskRunner`. Report mode runs each task's check step,
  records findings, and takes the no-dispatch branch (ADR 0049) — it never calls
  `agentDispatcher.dispatch` nor `prManager.ensureBranch`. The CLI constructs the
  runner with **no `PRManager`** (every PR/branch op in `task-runner.ts` is
  guarded by `if (this.prManager)`) and a **throwing** report-mode dispatcher, so
  any accidental dispatch fails loudly in tests rather than mutating a repo.
  Report-mode runs return `success`/`no-issues` and are infra-free: no
  orchestrator, gateway, or `ClaimManager` is constructed (spec SC6).

- **`--fix` threads `mode: 'fix'` into the same `TaskRunner`** (reproducing the
  scheduler's per-type branching — spec SC4), using the **same logging stub
  dispatcher** the scheduler uses and **still no `PRManager`**. It prints a
  one-line warning to stderr:
  `--fix: AI fix-agent dispatch is not yet wired (executor dispatcher is a stub
repo-wide); checks ran, no PRs were opened.` `--fix` also forces concurrency to
  1 (sequential), pre-empting duplicate-dispatch / worktree-collapse hazards the
  moment a real dispatcher lands.

- **CI gates on execution failure only.** Exit code is `0` on completion
  (findings are **not** failures — a sweep that ran every check and surfaced N
  findings did successful work), `1` iff at least one task `status === 'failure'`
  (a check crashed / could not execute), `2` on invalid invocation. This lets CI
  fail on broken maintenance while still surfacing findings in the report.

## Consequences

**Positive:**

- The default human sweep is safe and non-surprising: no branches, no agent
  dispatch, no PRs, no orchestrator. A developer can ask "what would maintenance
  find?" with zero side effects beyond the per-task output dir and the
  consolidated `.harness/maintenance/last-run-summary.json`.
- The `mode: 'fix'` seam is wired end-to-end and ready: when a real
  `AgentDispatcher` is built, `--fix` gains real behavior by swapping the stub —
  no CLI re-architecture, no second executor (ADR 0049 holds).
- CI can adopt `harness maintenance run` immediately and gate on exit `1`.

**Negative / known boundaries:**

- `--fix` is intentionally a no-op-dispatch in this phase. A reviewer expecting
  real fixes will not get them; the runtime warning and this ADR make that
  explicit. Real dispatch is a separate future change.
- Because report mode reuses the no-dispatch branch, a `pure-ai` task's
  `fixSkill`/`branch` misconfiguration is not surfaced as a failure under the
  default sweep (it is never read) — same boundary noted in ADR 0049.

**Neutral:**

- Sweep-eligibility (which tasks the human path may run) is owned by the registry
  via `excludeFromHumanSweep`, not a hardcoded id list in the CLI (spec D5). The
  CLI additionally treats an explicitly-named excluded/unknown id as an exit-2
  invalid invocation rather than silently dropping it.

## Related

- ADR [0049](0049-single-maintenance-executor-run-mode.md) — one executor, two
  callers, via a run mode.
- [`docs/changes/maintenance-pipeline/proposal.md`](../../changes/maintenance-pipeline/proposal.md)
  Decisions D2 / D4 / D5.
- `packages/cli/src/commands/maintenance-run.ts` (the on-demand engine),
  `packages/orchestrator/src/maintenance/task-runner.ts` (`RunMode`).
