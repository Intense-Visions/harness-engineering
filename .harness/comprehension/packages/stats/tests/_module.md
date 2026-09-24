---
schemaVersion: 1
module: 'packages/stats/tests'
sourceHash: 'c4dfb2a41e0ff2a35e3e79ca77f78bca6fe36caeed7dbee004efbd374781d088'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'arm-model.test.ts',
    'barrel.test.ts',
    'config.test.ts',
    'ledger-parse.test.ts',
    'ledger.test.ts',
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
import { BanditLedger, DEFAULT_LEDGER_PATH } from '../src/bandit/ledger'
import { parseLine } from '../src/bandit/ledger-parse'
import { choose } from '../src/bandit/policy'
import { sampleBeta } from '../src/bandit/sampling'
import { COST_EPSILON_USD, outcomeOnly, outcomePerDollar } from '../src/bandit/utility'
import * as stats from '../src/index'
import { mulberry32 } from './helpers/prng'
import { ArmState, BanditConfig, Pull } from '@harness-engineering/types'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
