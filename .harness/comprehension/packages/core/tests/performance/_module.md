---
schemaVersion: 1
module: 'packages/core/tests/performance'
sourceHash: '9226131019cf0c99019752afbeb33dff028d546bac2c0df6dc95a997c5c11dca'
compiledAt: '2026-08-28T01:22:10.884Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'baseline-manager.test.ts',
    'benchmark-runner.test.ts',
    'critical-path.test.ts',
    'regression-detector.test.ts',
  ]
---

## Summary

`packages/core/tests/performance` is a comprehensive test suite for the harness performance monitoring system. It validates four core subsystems: BaselineManager (persists/manages baseline data in `.harness/perf/baselines.json`), BenchmarkRunner (discovers and executes vitest benchmarks, parsing JSON output into normalized metrics), CriticalPathResolver (scans source for `@perf-critical` annotations and merges with graph-based fan-in data), and RegressionDetector (compares runs against baselines). The suite validates the full pipeline: discover → run → parse → update baselines → compare → surface regressions.

## Invariants

- Baseline file path & format: stored at `.harness/perf/baselines.json`; version 1 schema with `updatedAt` (ISO 8601), `updatedFrom` (git hash), and `benchmarks` dict
- Benchmark key syntax: `{file}::{name}` (e.g., `parse.bench.ts::parse large file`)
- Metric conversions: vitest Hz → `opsPerSec`; mean/p99 in seconds → `meanMs`/`p99Ms`; RME% → `marginOfError` as decimal (rme÷100)
- Directory exclusion: skip `node_modules`, `dist`, `.git` during annotation scanning
- Annotation detection: find `@perf-critical` in JSDoc (`/** */`) and line comments (`//`); extract function names from `export function`, `export const = arrow`
- Baseline merge semantics: `save()` updates entries in-place while preserving unrelated benchmarks; `prune()` removes by file prefix
- Graceful null handling: missing baseline file → null; invalid JSON → null; missing metrics → sensible defaults (0 for times, 0.05 for marginOfError)

## Interface Contract

```ts

```

## Dependency Slice

```
import { BaselineManager } from '../../src/performance/baseline-manager'
import { BenchmarkRunner } from '../../src/performance/benchmark-runner'
import { CriticalPathResolver, GraphCriticalPathData } from '../../src/performance/critical-path'
import { RegressionDetector } from '../../src/performance/regression-detector'
import { Baseline, BaselinesFile, BenchmarkResult, CriticalPathSet } from '../../src/performance/types'
import * as fs, { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as os, { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
