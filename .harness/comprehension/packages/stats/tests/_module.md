---
schemaVersion: 1
module: 'packages/stats/tests'
sourceHash: '47890c5f606b2a162d32c698d684f818df32a9cb541e3a0c66e42ff1d1439d5b'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'barrel.test.ts',
    'config.test.ts',
    'ledger-parse.test.ts',
    'sampling.test.ts',
    'utility.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DEFAULT_PRIOR, DEFAULT_SCOUT_FRACTION, resolveBanditConfig } from '../src/bandit/config'
import { InvalidBanditConfigError, NoEligibleArmsError } from '../src/bandit/errors'
import { parseLine } from '../src/bandit/ledger-parse'
import { sampleBeta } from '../src/bandit/sampling'
import { COST_EPSILON_USD, outcomeOnly, outcomePerDollar } from '../src/bandit/utility'
import * as stats from '../src/index'
import { mulberry32 } from './helpers/prng'
import { BanditConfig, Pull } from '@harness-engineering/types'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
```
