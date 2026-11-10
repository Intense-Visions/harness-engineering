---
'@harness-engineering/core': patch
---

`BenchmarkRunner` now makes benchmark file paths relative to the directory the
benchmarks ran in (`run({ cwd })`) instead of `process.cwd()`. When the runner was
pointed at another project (MCP server, orchestrator, `--cwd`), or ran on Windows,
the old string replace did nothing and absolute paths leaked into results and
baselines, so baseline keys stopped matching across machines. Paths are now
relativized with `path.relative` and normalized to `/`. `parseVitestBenchOutput`
takes an optional `projectRoot` (default `process.cwd()`).
