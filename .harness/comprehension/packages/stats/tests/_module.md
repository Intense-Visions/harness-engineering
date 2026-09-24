---
schemaVersion: 1
module: 'packages/stats/tests'
sourceHash: 'f23f84d8e7dd7e56b40c6b8483d97676e6275d38ef363be84d611ccf938b85f6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['barrel.test.ts', 'config.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DEFAULT_PRIOR, DEFAULT_SCOUT_FRACTION, resolveBanditConfig } from '../src/bandit/config'
import { InvalidBanditConfigError, NoEligibleArmsError } from '../src/bandit/errors'
import * as stats from '../src/index'
import { BanditConfig } from '@harness-engineering/types'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
```
