---
schemaVersion: 1
module: 'packages/stats/tests'
sourceHash: '02e6abdd5f7b68ca1529d38b6da759275cf81bd59deccc9430fa7387876e7bf4'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'arm-model.test.ts',
    'barrel.test.ts',
    'config.test.ts',
    'ledger-dir-cache.test.ts',
    'ledger-parse.test.ts',
    'ledger.test.ts',
    'policy.test.ts',
    'sampling.test.ts',
    'sprt.test.ts',
    'utility.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { decayWeight, foldArms } from '../src/bandit/arm-model'
import { DEFAULT_HALF_LIFE_DAYS, DEFAULT_MIN_EFFECTIVE_N, DEFAULT_PRIOR, DEFAULT_RETENTION_HALF_LIVES, DEFAULT_SCOUT_FRACTION, resolveBanditConfig } from '../src/bandit/config'
import { InvalidBanditConfigError, NoEligibleArmsError } from '../src/bandit/errors'
import { BanditLedger, DEFAULT_LEDGER_PATH } from '../src/bandit/ledger'
import { parseLine } from '../src/bandit/ledger-parse'
import { choose } from '../src/bandit/policy'
import { sampleBeta } from '../src/bandit/sampling'
import { COST_EPSILON_USD, outcomeOnly, outcomePerDollar } from '../src/bandit/utility'
import * as stats from '../src/index'
import { validateSprtConfig } from '../src/sprt/config'
import { InvalidSprtConfigError, InvalidSprtObservationError } from '../src/sprt/errors'
import { SprtObservation, createSprt, waldBounds } from '../src/sprt/sprt'
import { mulberry32 } from './helpers/prng'
import { ArmState, BanditConfig, Pull, SprtConfig, SprtVerdict } from '@harness-engineering/types'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
