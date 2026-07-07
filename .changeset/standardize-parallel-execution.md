---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Standardize parallel execution as an automatic part of the build loop. Adds a `PlanTask.dependsOn` schema (`@harness-engineering/types`), a `planParallelization` planner in `@harness-engineering/core` that composes the existing `findParallelGroups` wave-grouper and `predict_conflicts` into a `ParallelizationPlan` (dependency-DAG waves with risk-tiered firing — `auto-dispatch`/`confirm`/`serialize` — a cross-bucket ordering cap, and deterministic narration), and a `plan_parallelization` MCP tool (`@harness-engineering/cli`). The autopilot/execution/planning/parallel-agents skills now consume it to dispatch sound parallel waves without being asked, announce-and-proceed for clean waves and pausing only for genuinely uncertain ones. See ADRs 0056 (risk-tiered non-blocking dispatch) and 0057 (dependsOn plan-task schema).
