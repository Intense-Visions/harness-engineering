---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(insights): measure entropy with the project's harness.config.json, as `harness cleanup` does (#2192)

`harness insights`, the `insights_summary` MCP tool and `telemetry synthesize` ignored `entropy.entryPoints` / `excludePatterns`, so on a configured monorepo the analysis could not resolve an entry point and both blocks read NOT MEASURED while `cleanup` reported findings. They now run the same analysis `cleanup` runs, so the counts agree. `drift` is no longer hard-coded off (its count was zero by construction), health and entropy share one analysis run, and `harness insights --json` now emits JSON (the root program's `--json` used to swallow the flag). `-c` now also selects the project insights reports on.
