---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Fix `harness check-deps` failing every freshly scaffolded project, and make `check-deps`, `harness ci check` and the `check_dependencies` MCP tool agree on the same tree (#2671).

Layers that hold no source modules yet (a fresh scaffold's directories contain only `.gitkeep`) are now an abstention on every surface: `check-deps` exits 3 (ZERO_DENOMINATOR) under a `layer validation` label that reads "No source modules yet … nothing to check". Before, it exited 1, the exit code of a real violation, under an `unknown` label. The `ci check` deps step reports `skip` with that reason instead of `pass`, and the MCP tool returns `valid: false` with the same `unavailableChecks` entry instead of `valid: true`. All three now read one shared verdict, core's `assessDepsCoverage`. Dependency-graph nodes are now source files only, so `.gitkeep`, Markdown and directories are no longer listed as modules. A real layer violation still fails all three, and real source with no violations still passes all three.
