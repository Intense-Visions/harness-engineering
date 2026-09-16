---
schemaVersion: 1
module: 'packages/signals/tests/providers'
sourceHash: '6444457d577ce9f9cfadf1e05920cf78a12f24ae5d68db1259b7de9093a1d0f0'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'baseline-updates.test.ts',
    'complexity-trend.test.ts',
    'coverage-trend.test.ts',
    'eval-fail-rate.test.ts',
    'pr-review.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DEFAULT_COMMAND_TIMEOUT_MS, NETWORK_COMMAND_TIMEOUT_MS } from '../../src/command-runner'
import { baselineUpdatesProvider } from '../../src/providers/baseline-updates'
import { complexityTrendProvider } from '../../src/providers/complexity-trend'
import { coverageTrendProvider } from '../../src/providers/coverage-trend'
import { evalFailRateProvider } from '../../src/providers/eval-fail-rate'
import { prReviewProvider } from '../../src/providers/pr-review'
import { SignalTimelineStore } from '../../src/timeline-store'
import { CommandRunner, SignalContext } from '../../src/types'
import { GraphNode, GraphStore } from '@harness-engineering/graph'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
