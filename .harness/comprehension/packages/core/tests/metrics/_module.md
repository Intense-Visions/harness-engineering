---
schemaVersion: 1
module: 'packages/core/tests/metrics'
sourceHash: '8722264623dd87085b4ac9b10a23f6b861937fd6d5ecf082d858f0b12b49d317'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['adoption.test.ts', 'census.test.ts', 'denominate.test.ts', 'render.test.ts', 'verdict.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { patternCoverage, scoreWithCoverage } from '../../src/harness-strength/scoring'
import { ABSTENTION_PLACEHOLDER, MetricContractError, census, denominate, describePopulation, formatMetric, formatMetricBlock, formatMetricValue, formatPopulation, unknownPopulation, verdictForMetrics } from '../../src/metrics'
import { describe, expect, it } from 'vitest'
```
