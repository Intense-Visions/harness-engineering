---
schemaVersion: 1
module: 'packages/core/src/performance'
sourceHash: 'ae8de862de038ab2147c1836673e9d90b3d908695f986ea720a5837d344194ca'
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
export CriticalPathGraphInference
export CriticalPathResolver
export CriticalPathSet
export GraphCriticalPathData
export RegressionDetector
export RegressionReport
export RegressionResult
```

## Dependency Slice

```
import { Baseline, BaselinesFile, BenchmarkResult, CriticalPathEntry, CriticalPathGraphInference, CriticalPathSet, RegressionReport, RegressionResult } from './types'
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import { globSync } from 'glob'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { dirname, join } from 'node:path'
import * as path from 'node:path'
```
