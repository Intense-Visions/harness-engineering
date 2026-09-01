---
schemaVersion: 1
module: 'packages/core/src/gate-loss'
sourceHash: 'febcd65ee74dc30e992b1c6cd119a307a3c67c067c9a5d97ba051ede3b645f3d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['accumulate.ts', 'compute.ts', 'index.ts', 'types.ts']
---

## Interface Contract

```ts
export AccumulatedLoss
export GateBound
export GateLoss
export GateMeasurement
export LossAlarm
export LossAlarmInput
export MAX_PROXIMITY
export accumulateLoss
export computeGateLoss
export computeGateLosses
export detectLossAlarm
```

## Dependency Slice

```
import { AccumulatedLoss, GateLoss, LossAlarm, LossAlarmInput } from './types'
import { GateBound, GateMeasurement } from '@harness-engineering/types'
```
