---
schemaVersion: 1
module: 'packages/stats/src/sprt'
sourceHash: 'f0c4162934fb4cfdb4c860196458029c23af18f046a203490b7dc5306c1cbb7b'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['config.ts', 'errors.ts', 'index.ts', 'sprt.ts']
---

## Interface Contract

```ts
export InvalidSprtConfigError
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
import { InvalidSprtConfigError } from './errors.js'
import { SprtConfig, SprtVerdict } from '@harness-engineering/types'
```
