---
feature: owned-files-declaration
status: draft
created: 2026-08-04
roadmap: owned-files-declaration-in-plans-tasks
external-id: github:Intense-Visions/harness-engineering#601
keywords:
  - owned-files
  - owns-paths
  - parallel-execution
  - conflict-forecasting
  - glob-overlap
  - task-independence
---

# Owned-Files Declaration in Plans/Tasks (#601)

## Overview

The standardize-parallel-execution feature scaffolded an `owns?: string[]` field on
`PlanTask` but explicitly deferred its semantics to this roadmap item: it read `owns`
entries only as exact strings and named #601 as the owner of the actual authoring and
overlap meaning (`packages/types/src/plan-task.ts`, and the non-goal in
`docs/changes/standardize-parallel-execution/proposal.md`).

This change **defines** `owns:[paths]` as an owned-files declaration: each task declares
the source paths/globs it claims. Two tasks whose owned paths overlap may conflict if run
in parallel. From that we derive a **cheap, deterministic, graph-free** pre-execution
conflict forecast — a near-free parallel-safety guardrail that runs alongside the heavier
graph-based independence analysis (`check_task_independence` / `ConflictPredictor`), not
in place of it.

Adapted from Spec Kitty's per-work-package owned-files frontmatter
(`docs/research/spec-kitty-comparison-analysis.md`, adoption SPECKITTY-4).

## Decisions

1. **Glob-aware overlap, not exact-string.** `owns` entries are globs (`src/api/**`), so
   overlap must be glob-aware. Two patterns overlap when either matches the other treated
   as a literal path (symmetric double-`minimatch`, `{ dot: true }`). This reduces to
   equality for two concrete paths (preserving prior file-overlap behavior), matches a
   covering glob against a path it contains, and — via globstar — treats a narrower glob
   nested under a broader one as overlapping. Disjoint directory globs
   (`src/api/**` vs `src/web/**`) do not overlap.

2. **Reuse `minimatch`, already a `@harness-engineering/core` dependency.** No new
   dependency; mirrors existing glob usage in `constraints/layers.ts` and
   `security/scanner.ts`.

3. **Additive and backward-compatible.** Absent `owns` = current behavior, exactly. The
   forecast is advisory: it never removes waves or forces serialization on its own. It is
   surfaced as a new `ownershipForecast` field on `ParallelizationPlan`.

4. **Schema is the parse boundary.** `PlanTask` reaches the planner as validated JSON
   through `PlanTaskSchema` (Zod) and the MCP `plan_parallelization` tool — there is no
   separate plan-markdown task-header parser in the repo. `owns` parsing therefore lives
   in the strict schema (already present), which this change documents as the owned-files
   declaration rather than a placeholder consumed field.

## Technical Design

- **`packages/core/src/parallelization/ownership.ts`** (new):
  - `pathsOverlap(a, b): boolean` — symmetric glob-aware overlap via `minimatch`.
  - `forecastOwnershipConflicts(tasks): OwnershipConflict[]` — deterministic pairwise
    scan; only pairs where **both** tasks declare `owns` are considered; each flagged pair
    lists every overlapping `(ownedByA, ownedByB)` pattern pair in stable order.
  - Types `OwnershipConflict`, `OwnershipOverlap`.

- **`packages/core/src/parallelization/plan.ts`** (edit): `footprintOf` now returns the
  union of `files` + `owns` as match patterns, and `shareFootprint` uses `pathsOverlap`
  instead of exact `Set` membership — so the task DAG (`buildTaskGraph`) gains an implicit
  edge when an `owns` glob covers another task's file. `planParallelization` populates a
  new required `ownershipForecast: OwnershipConflict[]` field on `ParallelizationPlan`.

- **`packages/types/src/plan-task.ts`** (edit): doc comment updated to define `owns` as
  the owned-files declaration (#601) rather than a deferred consumed field.

- **`packages/cli/src/mcp/tools/parallelization.ts`** (edit): tool description updated to
  document `ownershipForecast` and glob-aware overlap. The returned plan (serialized JSON)
  carries the forecast automatically — no input-schema change.

## Integration Points

- **`plan_parallelization` (MCP tool / `planParallelization`)** — primary pre-execution
  conflict-forecasting path. Now emits `ownershipForecast` and builds a glob-aware DAG.
- **`check_task_independence` / `ConflictPredictor`** — unchanged (graph-based, file
  driven). The owned-files forecast runs _alongside_ it as the cheap deterministic layer.
- **`@harness-engineering/core` public API** — exports `forecastOwnershipConflicts`,
  `pathsOverlap`, and the two types.

## Success Criteria

- Two tasks with overlapping `owns` globs are flagged (both in `ownershipForecast` and as
  a `buildTaskGraph` edge); disjoint globs are not; absent `owns` is a no-op.
- Existing exact file-overlap behavior is preserved (concrete-path overlap unchanged).
- No new dependency; source lints, typechecks, and all parallelization/plan-task tests
  pass.

## Implementation Order

1. `ownership.ts` — `pathsOverlap` + `forecastOwnershipConflicts` + types.
2. Wire glob-aware overlap into `plan.ts` (`footprintOf` / `shareFootprint`) and add
   `ownershipForecast` to `ParallelizationPlan`.
3. Export from `packages/core/src/index.ts`; document `owns` in types + MCP tool.
4. Tests: `ownership.test.ts`, extend `plan.test.ts`.
