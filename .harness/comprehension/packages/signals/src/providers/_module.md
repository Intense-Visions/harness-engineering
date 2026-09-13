---
schemaVersion: 1
module: 'packages/signals/src/providers'
sourceHash: '58d8b16ded3940c31a3dd7e85199e327ff78b4875721c899512c3d72d5be0fa9'
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
import { NETWORK_COMMAND_TIMEOUT_MS, defaultCommandRunner } from '../command-runner'
import { ASSESSMENT_MARKER, bucketsToHistory, deriveEndpointTrend, round2, toDate } from '../shared'
import { CommandRunner, SignalContext, SignalPoint, SignalProvider, SignalResult } from '../types'
import { GraphNode } from '@harness-engineering/graph'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
```
