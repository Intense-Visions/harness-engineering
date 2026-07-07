---
type: business_concept
domain: core
tags: [parallelization-plan, task-dependency-dag, risk-tiered-dispatch, waves, firing, autopilot]
---

# Parallelization plan

Three related concepts introduced by the standardize-parallel-execution feature,
materialized here so the knowledge pipeline ingests them as graph nodes.

## What it is

**`parallelization-plan`** — the `ParallelizationPlan` produced by `planParallelization`
(`packages/core/src/parallelization/plan.ts`) and the `plan_parallelization` MCP tool. It
partitions a phase's tasks into three mutually disjoint dispatch channels — `waves`
(parallel-safe, each annotated with severity + firing), `serialized` (forced sequential:
high-severity group members or cycle members), and `cyclic` (blocked: dependency cycles)
— plus a human-readable `narration` for announce-and-proceed.

**`task-dependency-dag`** — the directed acyclic graph `buildTaskGraph` derives from plan
tasks: explicit `dependsOn` edges unioned with implicit file/`owns` overlap edges,
wave-grouped by the existing `findParallelGroups` (Kahn topological sort). Cycles are
surfaced, not scheduled. See ADR 0057.

**`risk-tiered-dispatch`** — the non-blocking firing policy (`auto-dispatch` | `confirm` |
`serialize`) `classifyFiring` assigns per wave, keyed off conflict severity and
`analysisLevel`, with a cross-bucket cap. See ADR 0056.

## Relationships

- `harness-autopilot` (EXECUTE) and standalone `harness-execution` **consume**
  `plan_parallelization` as a pre-dispatch step.
- `plan_parallelization` **wraps** `findParallelGroups` (wave grouping) and
  `predict_conflicts` (severity) — no scheduling logic is duplicated across skills.
- `harness-planning` **records** the `dependsOn` edges the DAG is built from.
- `harness-parallel-agents` is **invoked by** autopilot to dispatch a wave with
  worktree-per-unit isolation (`docs/guides/agent-worktree-patterns.md`).

## See also

- ADR 0056 — risk-tiered non-blocking dispatch (`0056-risk-tiered-non-blocking-dispatch.md`).
- ADR 0057 — `dependsOn` plan-task schema (`0057-depends-on-plan-task-schema.md`).
- `docs/reference/mcp-tools.md` — the `plan_parallelization` tool.
- `docs/knowledge/architecture/graph-schema.md` — graph node vocabulary.
- Spec: `docs/changes/standardize-parallel-execution/proposal.md` (Knowledge Impact).
