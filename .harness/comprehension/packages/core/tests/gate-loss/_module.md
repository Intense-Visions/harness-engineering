---
schemaVersion: 1
module: 'packages/core/tests/gate-loss'
sourceHash: 'f977e773e131e7304e00cbf85dd2cc9f61201ede9580dfcf5f21559b69858786'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['accumulate.test.ts', 'compute.test.ts', 'report-panel.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { formatCIReportAsMarkdown } from '../../src/ci/report-formatter'
import { MAX_PROXIMITY, accumulateLoss, computeGateLoss, computeGateLosses, detectLossAlarm } from '../../src/gate-loss'
import { CICheckReport, GateMeasurement } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
