---
schemaVersion: 1
module: 'packages/signals/src/providers'
sourceHash: '0cb9d5d96e8ee74623c1979943ecbdc649177a707038de0586eb50c93222767a'
compiledAt: '2026-08-28T01:22:12.750Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'baseline-updates.ts',
    'complexity-trend.ts',
    'coverage-trend.ts',
    'eval-fail-rate.ts',
    'pr-review.ts',
  ]
---

## Interface Contract

```ts
export baselineUpdatesProvider
export complexityTrendProvider
export coverageTrendProvider
export evalFailRateProvider
export prReviewProvider
```

## Dependency Slice

```
import { defaultCommandRunner } from '../command-runner'
import { ASSESSMENT_MARKER, bucketsToHistory, deriveEndpointTrend, round2, toDate } from '../shared'
import { CommandRunner, SignalContext, SignalPoint, SignalProvider, SignalResult } from '../types'
import { GraphNode } from '@harness-engineering/graph'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
```
