---
number: 0004
title: Pulse and compound-candidates as report-only maintenance tasks
date: 2026-05-05
status: accepted
tier: medium
source: docs/changes/compound-engineering-adoption/feedback-loops/proposal.md
---

## Context

The feedback-loops feature introduces two new periodic jobs: `product-pulse` (daily) which
generates a single-page health report from observability sources, and `compound-candidates`
(weekly) which scans for undocumented learnings. Both need scheduling. Two options were on
the table: stand up a parallel `/schedule` wiring just for these jobs, or reuse the
existing maintenance-task system that already runs the orchestrator's periodic work.

## Decision

Both jobs register as `report-only` maintenance tasks in the `BUILT_IN_TASKS` registry
(Phase 6, `packages/orchestrator/src/maintenance/task-registry.ts`).

- `product-pulse` runs daily at 8am, runtime-checks `pulse.enabled` from
  `harness.config.json`, and generates `docs/pulse-reports/YYYY-MM-DD_HH-MM.md` via
  `harness pulse run --non-interactive`.
- `compound-candidates` runs Mondays at 9am (offset from the existing 6am block to avoid
  collision with `cross-check`, `perf-check`, and `traceability`), with no enable gate, and
  surfaces undocumented learnings into `docs/solutions/.candidates/` via
  `harness compound scan-candidates --non-interactive`.
- Both honor the JSON status contract `{status, candidatesFound?, error?, reason?}`
  emitted by the new `--non-interactive` CLIs.

The maintenance system is the canonical scheduling engine for harness; reusing it inherits
leader election, dashboard surfacing, run history, and the report-only safety guarantee
(no branches, no PRs, no state mutation).

## Consequences

**Positive:**

- No parallel scheduler to maintain or document.
- Consistent observability: both jobs appear in the dashboard's `Maintenance` page with
  run history and candidate-count badges.
- Report-only tier mechanically prevents either task from mutating durable state.

**Negative:**

- Both jobs inherit maintenance-system constraints (cron-only timing, no per-tenant
  scheduling, leader-only execution).
- Adding new pulse-style jobs in the future requires a `BUILT_IN_TASKS` edit rather than
  a self-contained registration call.

**Neutral:**

- The `report-only` tier semantics are an existing concept; this decision is a reuse
  decision, not a new abstraction.
