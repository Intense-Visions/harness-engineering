---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

fix: honour `entropy.enabled: false` in `harness cleanup`, `detect_entropy` and `harness ci check` (#2633). `harness cleanup` and `detect_entropy` with type `all` no longer run the doc-drift, dead-code and pattern analyzers on a project that declared them not applicable, and say they are disabled by config; an explicit `-t drift|dead-code|patterns` refuses. `harness ci check` reports a config-disabled `deps`, `entropy` or `perf` gate as `skip` instead of `pass`.
