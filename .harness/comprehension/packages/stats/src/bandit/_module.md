---
schemaVersion: 1
module: 'packages/stats/src/bandit'
sourceHash: '408c0d8f9f7608ea61bfa45cf89d86f72a29068d3ce5629f3c7cd40c2824bda1'
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
