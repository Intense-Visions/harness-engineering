---
schemaVersion: 1
module: 'packages/core/src/metabolism'
sourceHash: 'e4fd8348a73a1a0e3def47bfa1f914bc511d8e2d34612e10f0a97292b45e0184'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adapter.test.ts',
    'adapter.ts',
    'classify.test.ts',
    'classify.ts',
    'evaluate.test.ts',
    'evaluate.ts',
    'index.ts',
    'report.test.ts',
    'report.ts',
  ]
---

## Interface Contract

```ts
export AttributedSpendEvent
export BuildSpendLedgerInputs
export ClassifierEvaluation
export DEFAULT_MAINTENANCE_CLASSES
export DEFAULT_METABOLISM_CONFIG
export LabeledSpendEvent
export MaintenanceWasteEntry
export MetabolismConfig
export MetabolismReport
export PerClassRates
export SPEND_CLASSES
export SpendClass
export SpendEvent
export SpendLedger
export SpendOutcome
export TokenSource
export WorkflowClassBreakdown
export buildMetabolismReport
export buildSpendLedgerFromTelemetry
export classifySpend
export evaluateClassifier
```

## Dependency Slice

```
import { buildSpendLedgerFromTelemetry } from './adapter'
import { DEFAULT_MAINTENANCE_CLASSES, DEFAULT_METABOLISM_CONFIG, MetabolismConfig, SPEND_CLASSES, SpendClass, SpendEvent, classifySpend } from './classify'
import { LabeledSpendEvent, evaluateClassifier } from './evaluate'
import { buildMetabolismReport } from './report'
import { SkillInvocationRecord, UsageRecord } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
