---
schemaVersion: 1
module: 'packages/core/src/performance'
sourceHash: '5d2f054caf15931a6acca3ff569d2d9d4bcbca540e827cf818aedff2586411c1'
compiledAt: '2026-08-28T01:22:10.443Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'baseline-manager.ts',
    'benchmark-runner.ts',
    'critical-path.ts',
    'index.ts',
    'regression-detector.ts',
    'types.ts',
  ]
---

## Summary

The `packages/core/src/performance` module provides end-to-end performance monitoring: discovering and executing `.bench.ts` benchmarks via Vitest, persisting results as JSON baselines at `.harness/perf/baselines.json`, detecting regressions by comparing against those baselines, and identifying critical code paths by scanning `@perf-critical` annotations and merging graph-inferred call-graph data. It comprises four components: BaselineManager (load/save/prune benchmarks keyed by `${file}::${name}`), BenchmarkRunner (find, execute via `vitest bench --reporter=json`, parse JSON output), CriticalPathResolver (scan source for annotations, resolve to function names, merge graph data with annotations taking priority), and RegressionDetector (compare new runs against baselines).

## Invariants

- Baseline keying is exact: results indexed as ${file}::${name}; deviations in either field break lookups
- Baseline storage path is hardcoded: .harness/perf/baselines.json relative to project root; no customization
- Annotations win conflicts: @perf-critical entries supersede graph-inferred duplicates; prevents key collisions
- Vitest JSON schema is required: parser extracts .testResults[].assertionResults[].benchmark.{hz, mean, p99, rme}; missing fields silently default to 0 or 1.5×mean
- File paths normalize to forward slashes: path.relative() output converted to POSIX; Windows backslashes would break cross-platform keying and reads
- DEFAULT_SKIP_DIRS is trusted: directory traversal respects @harness-engineering/graph skip list; adding new skips requires graph-layer coordination
- JSON parse failures are silent: BaselineManager.load() returns null on invalid JSON; callers must assume empty state and rebuild
- Vitest bench failures may still emit output: run() catches non-zero exit but returns results if parsing succeeds; success flag keyed to results.length > 0

## Interface Contract

```ts
export Baseline
export BaselineManager
export BaselinesFile
export BenchmarkResult
export BenchmarkRunOptions
export BenchmarkRunner
export CriticalPathEntry
export CriticalPathResolver
export CriticalPathSet
export GraphCriticalPathData
export RegressionDetector
export RegressionReport
export RegressionResult
```

## Dependency Slice

```
import { Baseline, BaselinesFile, BenchmarkResult, CriticalPathEntry, CriticalPathSet, RegressionReport, RegressionResult } from './types'
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import { execFileSync } from 'node:child_process'
import * as fs, { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path, { dirname, join } from 'node:path'
```
