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

> **Update (#679):** the original phase shipped against a hard constraint — **no
> real AI fix-agent dispatch existed anywhere in the repo**, so `--fix` was a
> documented repo-wide no-op-dispatch. That constraint is now lifted.
> `createAgentDispatcher` (`maintenance/agent-dispatcher.ts`) is a real
> dispatcher — it resolves a configured backend, drives an `AgentRunner` session
> in the worktree, and measures `fixed` by diffing git HEAD before/after. The
> cron orchestrator and the on-demand CLI `--fix` both use it. The remaining
> limitation is **not** "no dispatcher exists" but "dispatch requires a
> configured agent backend" — see the revised `--fix` bullet below.

The original constraint (now historical): when ADR 0050 first landed, the only
`AgentDispatcher` was the orchestrator's stub, which logged "skill dispatch
integration pending" and returned `{ producedCommits: false, fixed: 0 }`. A
repo-wide search for a non-stub dispatch returned nothing, so `--fix` could not
construct real dispatch in that phase — there was nothing to construct.

## Decision

**The on-demand sweep is report-first by default; `--fix` opts into fix mode,
which dispatches the real `createAgentDispatcher` (#679) when an agent backend
is configured and otherwise skips honestly. The CLI constructs no `PRManager`:
the dispatcher commits fixes in the worktree rather than opening PRs.**

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
  scheduler's per-type branching — spec SC4), using the **real
  `createAgentDispatcher`** (#679) the scheduler uses and **still no
  `PRManager`**. The CLI resolves `agent.backends` from `harness.orchestrator.md`
  exactly as the cron orchestrator does (`loadAgentBackends` → `makeResolveBackend`
  → `createBackend`); the agent commits directly to the worktree, so there is no
  PR (`prUrl` stays null — we do not claim one). **Graceful degradation:** when no
  agent backend is configured for the default maintenance backend (the common
  plain-checkout case), `--fix` prints an honest stderr notice
  (`--fix: no agent backend configured for maintenance dispatch — dispatch was
skipped and nothing was fixed. …`), skips dispatch, and reports `fixed: 0` — it
  never crashes and never fabricates a result. When a backend **is** resolved
  there is no warning: it really dispatched and `fixed` reflects the actual commit
  count. `--fix` also forces concurrency to 1 (sequential), pre-empting
  duplicate-dispatch / worktree-collapse hazards.

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
- The `mode: 'fix'` seam is wired end-to-end to the real `createAgentDispatcher`
  (#679): the same dispatcher cron uses, with no CLI re-architecture and no second
  executor (ADR 0049 holds). The seam degraded cleanly from stub → real by
  swapping the dispatcher factory, exactly as this ADR anticipated.
- CI can adopt `harness maintenance run` immediately and gate on exit `1`.

**Negative / known boundaries:**

- `--fix` now dispatches for real (#679), but **only when an agent backend is
  configured**. In a plain checkout with no `agent.backends`, `--fix` honestly
  skips dispatch and reports `fixed: 0` with a stderr notice — a reviewer
  expecting fixes there will not get them, and the notice + this ADR make the
  reason (no backend) explicit. (Superseded: the original boundary was "no-op in
  this phase, real dispatch is a future change.")
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
