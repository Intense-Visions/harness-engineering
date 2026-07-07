---
number: 0057
title: dependsOn is the explicit dependency edge in the plan-task schema
date: 2026-07-07
status: accepted
tier: medium
source: docs/changes/standardize-parallel-execution/proposal.md
---

## Context

Standardizing parallel execution needs an explicit, machine-readable dependency edge
between plan tasks. Before this change no such field existed anywhere: the improvised
"Phase 1 blocks 2 & 3" reasoning was recomputed by hand each session, and the only
independence signal was a task's `files` list (overlap ⇒ conflict). `files` captures
_implicit_ conflict edges but cannot express a _pure ordering_ dependency (task B must
follow task A even when they touch different files). That missing edge is the one
genuinely absent data-model piece.

A related field, `owns:[paths]` (roadmap #601), was considered. It is a richer ownership
declaration but is out of scope for this feature — adopting its _authoring_ would pull in
#601 wholesale.

## Decision

Add an optional **`dependsOn?: string[]`** (task ids) to the `PlanTask` type
(`@harness-engineering/types`). It is the explicit dependency edge; `files` remains the
independence-checking input. `buildTaskGraph`
(`packages/core/src/parallelization/plan.ts`) builds the DAG consumed by
`findParallelGroups` as **explicit `dependsOn` edges unioned with implicit file/`owns`
overlap edges**, oriented earlier-declared → later-declared for determinism.

**Relationship to `owns:[paths]` (#601): consumed-if-present, not owned here.**
`footprintOf` unions a task's `files` and `owns` when computing overlap, so a plan that
_already_ carries `owns` gets richer conflict edges for free. But this feature does **not**
define, author, or validate `owns` — that field and its authoring workflow stay roadmap
#601. Phase 4 only ratifies the read-if-present seam.

**Validation** (`validatePlanTasks`) enforces the contract:

- `dependsOn` referencing an **unknown task id** → **hard error**.
- A **dependency cycle** → **hard error**. Cycles are detected over the _same_ combined
  graph the planner schedules (explicit `dependsOn` ∪ file/`owns` overlap), so validation
  and `planParallelization` agree on what a cycle is — a set the planner drops into
  `cyclic` is never validated as clean.
- A task depending on a task declared **later** in the plan (consumer before producer) →
  **warning** (the plan lists them out of natural order; still schedulable).

## Consequences

- **A durable contract other tooling builds on.** `plan_parallelization`, the soundness
  reviewer, and future scheduling tools read one canonical edge instead of re-deriving it.
- **Backwards compatible.** `dependsOn` is optional; plans without it behave exactly as
  before (independence inferred from `files` overlap alone).
- **Cycles fail loud and early.** A cyclic plan is rejected at validation, not discovered
  mid-dispatch.
- **The `owns` seam is preserved without commitment.** #601 can later own `owns` authoring
  without renegotiating this contract; consumers already tolerate its presence.
- **`files` keeps its meaning.** It stays the independence/conflict input; `dependsOn` adds
  ordering the file list cannot express.

## See also

- ADR 0056 — risk-tiered non-blocking dispatch (schedules over these edges).
- `docs/knowledge/core/parallelization-plan.md` — the `task-dependency-dag` concept.
- Roadmap #601 — `owns:[paths]` authoring (the field consumed-if-present here).
- Spec: `docs/changes/standardize-parallel-execution/proposal.md` (Decision 4).
