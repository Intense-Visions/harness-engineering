---
'@harness-engineering/cli': patch
---

fix(cleanup): honor `entropy.drift.docPaths` in `cleanup` and `fix-drift` (#1819)

`runCleanup` and `runFixDrift` hardcoded the doc denominator to `[join(docsDir, '**/*.md')]`. `runCleanup` did thread the project's drift config into `analyze.drift`, but `buildSnapshot` reads `docPaths` from the **top level** of `EntropyConfig`, so the hardcoded value stayed in force and `entropy.drift.docPaths` did nothing on the CLI path — while the MCP `detect_entropy` tool honored it. The key was live on one code path and dead on the other, which is what made it read as effective config: a project could widen its doc denominator, see the config accepted, and get no change in the gate. Both commands now forward the configured value, falling back to the `docsDir` glob when none is set.
