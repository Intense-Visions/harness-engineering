---
schemaVersion: 1
module: 'packages/core/tests/performance'
sourceHash: '03079d77365baf6f35a76a55a0feca23d7743213fca8900050575a0a876683e0'
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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import { join } from 'node:path'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
