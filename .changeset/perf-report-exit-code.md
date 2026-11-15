---
'@harness-engineering/cli': patch
---

`harness perf report` now exits non-zero (exit 2) when the analysis fails instead of logging the error and exiting 0, and in `--json` mode prints `{"error": "..."}` on stdout like `check-perf`. It also honours configured `performance.entryPoints` (falling back to `entropy.entryPoints`, as `check-perf` does) and roots the analysis on the project that owns the config, so it runs on a monorepo root where entry-point auto-detection fails. An unloadable `-c` is now an error rather than a silent fall back to the current directory.
