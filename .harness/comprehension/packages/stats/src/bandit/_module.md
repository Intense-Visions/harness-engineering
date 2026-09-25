---
schemaVersion: 1
module: 'packages/stats/src/bandit'
sourceHash: 'c2a2823bb0af7ecf853c48cd4f09dedc012084e7f6fab0bce5441a5b717ed318'
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
export BanditLedger
export BanditLedgerOptions
export COST_EPSILON_USD
export DEFAULT_LEDGER_PATH
export DEFAULT_PRIOR
export DEFAULT_SCOUT_FRACTION
export FoldResult
export InvalidBanditConfigError
export NoEligibleArmsError
export ResolvedBanditConfig
export Reward
export Rng
export Utility
export choose
export decayWeight
export foldArms
export outcomeOnly
export outcomePerDollar
export resolveBanditConfig
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
