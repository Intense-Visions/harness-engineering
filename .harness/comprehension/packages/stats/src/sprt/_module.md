---
schemaVersion: 1
module: 'packages/stats/src/sprt'
sourceHash: 'fab49beec63401b3a0ccd6b0207ba770603d94f10a7680efd17dcb94b4b9a540'
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
import { validateSprtConfig } from './config.js'
import { InvalidSprtConfigError, InvalidSprtObservationError } from './errors.js'
import { SprtConfig, SprtVerdict } from '@harness-engineering/types'
```
