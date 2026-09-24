---
schemaVersion: 1
module: 'packages/stats/src/bandit'
sourceHash: 'd12895bc7842674bf51ab3a3eabd552c2ceb0bf71f82e3c5455e1f4ad18d5c00'
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
    'ledger.ts',
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
import { foldArms } from './arm-model.js'
import { ResolvedBanditConfig, resolveBanditConfig } from './config.js'
import { InvalidBanditConfigError, NoEligibleArmsError } from './errors.js'
import { parseLine } from './ledger-parse.js'
import { Rng, sampleBeta } from './sampling.js'
import { Utility, outcomeOnly } from './utility.js'
import { ArmState, BanditConfig, Choice, Pull } from '@harness-engineering/types'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
```
