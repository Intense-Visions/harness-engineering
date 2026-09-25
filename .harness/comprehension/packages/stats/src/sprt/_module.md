---
schemaVersion: 1
module: 'packages/stats/src/sprt'
sourceHash: 'c5eaf86aaa2911cd09ff6ecc42f1a19d1e8252846ddb2d8fabdb0aeccea25d5c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['config.ts', 'errors.ts', 'index.ts', 'sprt.ts']
---

## Interface Contract

```ts
export InvalidSprtConfigError
export InvalidSprtObservationError
export Sprt
export SprtObservation
export SprtState
export WaldBounds
export createSprt
export validateSprtConfig
export waldBounds
```

## Dependency Slice

```
import { SprtErrorRates, validateErrorRates, validateSprtConfig } from './config.js'
import { InvalidSprtConfigError, InvalidSprtObservationError } from './errors.js'
import { SprtConfig, SprtVerdict } from '@harness-engineering/types'
```
