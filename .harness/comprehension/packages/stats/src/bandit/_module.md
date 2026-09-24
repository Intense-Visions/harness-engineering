---
schemaVersion: 1
module: 'packages/stats/src/bandit'
sourceHash: 'e104767bd8900c612c2c3fb65641b1d9bad1fa2c7e5c0bc066dba4c9cc21161a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'arm-model.ts',
    'config.ts',
    'errors.ts',
    'index.ts',
    'ledger-parse.ts',
    'sampling.ts',
    'utility.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ResolvedBanditConfig } from './config.js'
import { InvalidBanditConfigError } from './errors.js'
import { Utility, outcomeOnly } from './utility.js'
import { ArmState, BanditConfig, Pull } from '@harness-engineering/types'
```
