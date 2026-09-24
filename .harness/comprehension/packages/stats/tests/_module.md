---
schemaVersion: 1
module: 'packages/stats/tests'
sourceHash: '11a33764cf81c3e133960e29698755b33a8077e0231894ae0d3511cab8f6e305'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'arm-model.test.ts',
    'barrel.test.ts',
    'config.test.ts',
    'ledger-parse.test.ts',
    'policy.test.ts',
    'sampling.test.ts',
    'utility.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { decayWeight, foldArms } from '../src/bandit/arm-model'
import { DEFAULT_PRIOR, DEFAULT_SCOUT_FRACTION, resolveBanditConfig } from '../src/bandit/config'
import { InvalidBanditConfigError, NoEligibleArmsError } from '../src/bandit/errors'
import { parseLine } from '../src/bandit/ledger-parse'
import { choose } from '../src/bandit/policy'
import { sampleBeta } from '../src/bandit/sampling'
import { COST_EPSILON_USD, outcomeOnly, outcomePerDollar } from '../src/bandit/utility'
import * as stats from '../src/index'
import { mulberry32 } from './helpers/prng'
import { ArmState, BanditConfig, Pull } from '@harness-engineering/types'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
```
