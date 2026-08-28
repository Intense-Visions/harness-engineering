---
schemaVersion: 1
module: 'packages/signals/tests/providers'
sourceHash: '46bb52ce9d6fa6d5317269153b957c27f2aaa94919a50ccdde269edd9aa48751'
compiledAt: '2026-08-28T01:22:12.801Z'
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
