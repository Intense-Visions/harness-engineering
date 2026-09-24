---
schemaVersion: 1
module: 'packages/stats/tests'
sourceHash: 'd45af71f4cc9373b0c43f317887191dbb2ca84feae448a615440e5f94af58994'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['barrel.test.ts', 'config.test.ts', 'utility.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DEFAULT_PRIOR, DEFAULT_SCOUT_FRACTION, resolveBanditConfig } from '../src/bandit/config'
import { InvalidBanditConfigError, NoEligibleArmsError } from '../src/bandit/errors'
import { COST_EPSILON_USD, outcomeOnly, outcomePerDollar } from '../src/bandit/utility'
import * as stats from '../src/index'
import { BanditConfig } from '@harness-engineering/types'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
```
