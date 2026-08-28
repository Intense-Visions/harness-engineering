---
schemaVersion: 1
module: 'packages/core/tests/performance'
sourceHash: '9226131019cf0c99019752afbeb33dff028d546bac2c0df6dc95a997c5c11dca'
compiledAt: '2026-08-28T01:22:10.884Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'baseline-manager.test.ts',
    'benchmark-runner.test.ts',
    'critical-path.test.ts',
    'regression-detector.test.ts',
  ]
---

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
