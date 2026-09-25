---
schemaVersion: 1
module: 'packages/stats/src/bandit'
sourceHash: '2b9bb10db7330e50bddd7b24089de4caed6d0364e0b0c5d164d683004db495e1'
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
export DEFAULT_HALF_LIFE_DAYS
export DEFAULT_LEDGER_PATH
export DEFAULT_MIN_EFFECTIVE_N
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
