---
schemaVersion: 1
module: 'packages/core/src/performance'
sourceHash: '5d2f054caf15931a6acca3ff569d2d9d4bcbca540e827cf818aedff2586411c1'
compiledAt: '2026-08-28T01:22:10.443Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
