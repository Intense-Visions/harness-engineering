---
schemaVersion: 1
module: 'packages/core/src/metrics'
sourceHash: 'ca756b7ea9c1a455818426459c4b31ae7b69f7b992eb4bf826cd85b41e0ad871'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['denominate.ts', 'index.ts', 'render.ts', 'verdict.ts']
---

## Interface Contract

```ts
export ABSTENTION_PLACEHOLDER
export DenominateInput
export DenominatedMetric
export FormatMetricOptions
export MetricBasis
export MetricContractError
export MetricOutcome
export MetricPopulation
export MetricUnit
export MetricVerdict
export MetricVerdictOptions
export MetricViolation
export census
export denominate
export describePopulation
export formatMetric
export formatMetricBlock
export formatMetricValue
export formatPopulation
export unknownPopulation
export verdictForMetrics
```

## Dependency Slice

```
import { describePopulation } from './denominate'
import { DenominatedMetric, MetricBasis, MetricPopulation, MetricUnit } from '@harness-engineering/types'
```
