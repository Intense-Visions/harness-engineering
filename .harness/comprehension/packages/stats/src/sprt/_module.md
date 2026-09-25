---
schemaVersion: 1
module: 'packages/stats/src/sprt'
sourceHash: 'd96148b94d48c0583eb020f5ac690ff1242eb5889fc1578cb87e88ee80a01c52'
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
