---
'@harness-engineering/core': patch
'@harness-engineering/types': patch
'@harness-engineering/cli': patch
---

Define the `owns:[paths]` owned-files declaration on plan tasks (#601). Adds a cheap, deterministic, graph-free pre-execution conflict forecast: `forecastOwnershipConflicts` and glob-aware `pathsOverlap` (via minimatch) flag task pairs whose declared owned paths overlap and so may conflict if run in parallel. `buildTaskGraph`/`planParallelization` now compute footprint overlap glob-aware and surface an `ownershipForecast` field on `ParallelizationPlan`. Fully additive — absent `owns` preserves current behavior.
