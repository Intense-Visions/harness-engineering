---
number: 0049
title: One maintenance executor, two callers, via a run mode
date: 2026-06-27
status: accepted
tier: medium
source: docs/changes/maintenance-pipeline/proposal.md
---

## Context

The maintenance subsystem already separates per-task execution (`TaskRunner`, in
`packages/orchestrator/src/maintenance/task-runner.ts`) from scheduling
(`MaintenanceScheduler`). `TaskRunner.run` owns the entire lifecycle of a single
registered task: run the check step, decide whether to dispatch a fix agent, and
open/update a PR.

The on-demand maintenance pipeline (deferred from the cron-only design) needs a
human-invoked, report-first path that runs the SAME registered tasks without an
orchestrator or gateway — a developer should be able to ask "what would
maintenance find?" and get findings with no branch, no agent dispatch, and no PR.

The question (D4): build a second executor for the CLI, or reuse the existing one?
A second executor would create a parallel definition of "how a maintenance task
runs" that inevitably drifts from the cron path — two places to keep the check
contract, the dispatch rules, and the result shape in sync.

## Decision

**Thread a `RunMode = 'report' | 'fix'` parameter through the existing
`TaskRunner.run(task, origin, mode = 'fix')`. There is exactly one executor with
two callers — the cron scheduler (`'fix'`) and the future CLI (`'report'`).**

- `RunMode` is exported from `@harness-engineering/orchestrator` next to
  `RunOrigin`. `'fix'` is the default, so the scheduler call site
  (`orchestrator.ts:794`, `await taskRunner.run(task)`) is unchanged.
- `'report'`: a `mechanical-ai` task runs its check and reuses the existing
  no-dispatch skip path (records `findings`, status `no-issues`, `prUrl` null) by
  extending that branch's condition with `|| mode === 'report'`; a `pure-ai` task
  short-circuits to a no-dispatch `no-issues` result before any dispatch. Neither
  calls `agentDispatcher.dispatch` nor `prManager.ensureBranch`.
- `'fix'`: current cron behavior verbatim — mechanical-ai dispatches on findings,
  pure-ai always dispatches, PRs may be opened.

The registry stays the single source of truth for what tasks exist and how they
run; report mode is a behavior of the one executor, not a fork of it.

## Consequences

**Positive:**

- No parallel executor — the cron and CLI paths cannot drift, because they ARE the
  same code path differing only by a default-valued parameter.
- The CLI runs infra-free: report mode never dispatches an agent or touches git, so
  a human can sweep findings without an orchestrator, gateway, or credentials.
- The scheduler call site is untouched and its tests stay green; the change is
  purely additive.

**Negative / known boundaries:**

- `housekeeping` git-mutating tasks (e.g. `main-sync`) are NOT guarded by the
  executor in report mode. Report mode assumes a task's check step is
  side-effect-free; keeping git-mutating tasks out of the human/report path is
  deferred to the Phase 2 `excludeFromHumanSweep` selection layer, not enforced
  here. A future caller that hands a housekeeping task to report mode would still
  run its (potentially mutating) step.
- A `pure-ai` report run short-circuits BEFORE `fixSkill`/`branch` validation, so a
  misconfigured pure-ai task does not surface as a `failure` in report mode. This is
  acceptable because report mode uses neither field and never dispatches.

**Neutral:**

- Future maintenance checks must honor the side-effect-free check contract (or set
  `excludeFromHumanSweep` once Phase 2 adds it) to be safe under report mode.
- Report mode reuses the existing `RunResult` shape (`status: 'no-issues'`,
  `findings`, `prUrl: null`) rather than introducing a report-specific result type.

## Related

- [`docs/changes/maintenance-pipeline/proposal.md`](../../changes/maintenance-pipeline/proposal.md) Decision D4
- `packages/orchestrator/src/maintenance/task-runner.ts`,
  `packages/orchestrator/src/maintenance/types.ts` (`RunMode`)
