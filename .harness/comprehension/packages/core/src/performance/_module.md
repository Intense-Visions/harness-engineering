---
schemaVersion: 1
module: 'packages/core/src/performance'
sourceHash: 'a112a33c14350592b5bc6376d15d1cc13ddddb28491734394504b79414381ef2'
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
import { globSync } from 'glob'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { dirname, join } from 'node:path'
import * as path from 'node:path'
```
