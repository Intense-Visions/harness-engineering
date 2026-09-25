---
schemaVersion: 1
module: 'packages/stats/src/sprt'
sourceHash: 'ddf968606f564a3cfa063e6466a401358f10fb74a2de1871a7fc08d25b40223a'
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
export SprtErrorRates
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
