---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(perf): critical-path resolution no longer reports a clean 0 or test fixtures

`CriticalPathResolver` (behind `harness perf critical-paths` and the `get_critical_paths` MCP tool) now marks an empty set with `noSignal: { reason }` and reports whether graph inference ran via `graphInference: { status: 'ran' } | { status: 'not-run', reason }`, so consumers scoring on critical-path membership can tell an abstention from a measurement (#2327). The annotation scan now skips test, spec, bench, fixture, and mock files and only honours the marker inside a comment, so test fixtures and string literals are no longer registered as production hot paths (#2256). The text output prints "graph inference not run" instead of "0 graph-inferred" and warns when there is no signal.
