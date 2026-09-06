---
schemaVersion: 1
module: 'packages/core/tests/metrics'
sourceHash: '6e96d7795c63a0711bf13c9ada1ae9d94243118c01a266b81154c4788ccb9eba'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['adoption.test.ts', 'denominate.test.ts', 'render.test.ts', 'verdict.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { patternCoverage, scoreWithCoverage } from '../../src/harness-strength/scoring'
import { ABSTENTION_PLACEHOLDER, MetricContractError, denominate, describePopulation, formatMetric, formatMetricBlock, formatMetricValue, formatPopulation, unknownPopulation, verdictForMetrics } from '../../src/metrics'
import { describe, expect, it } from 'vitest'
```
