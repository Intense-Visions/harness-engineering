---
schemaVersion: 1
module: 'packages/stats/src/bandit'
sourceHash: 'd2767e180e6b5f16198ea93b786d36617f71ce3fd8466eaffea631dcabc7ea68'
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
    'policy.ts',
    'sampling.ts',
    'utility.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ResolvedBanditConfig, resolveBanditConfig } from './config.js'
import { InvalidBanditConfigError, NoEligibleArmsError } from './errors.js'
import { Rng } from './sampling.js'
import { Utility, outcomeOnly } from './utility.js'
import { ArmState, BanditConfig, Choice, Pull } from '@harness-engineering/types'
```
