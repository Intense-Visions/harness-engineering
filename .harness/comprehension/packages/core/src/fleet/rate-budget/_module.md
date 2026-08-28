---
schemaVersion: 1
module: 'packages/core/src/fleet/rate-budget'
sourceHash: 'f7ff05c0dc090362b5f24962b38ce61077bdc24d249373ec28c754d9ec30d79d'
compiledAt: '2026-08-28T01:22:10.397Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['budget.test.ts', 'budget.ts', 'errors.ts', 'index.ts', 'types.ts']
---

## Interface Contract

```ts
export RateBudget
export RateBudgetAcquireOptions
export ResourceBudgetConfig
export ThrottledFetchError
export TruncatedFetchError
export applyResourceBudgets
export sharedRateBudget
```

## Dependency Slice

```
import { RateBudget, applyResourceBudgets, sharedRateBudget } from './budget'
import { ResourceBudgetConfig } from './types'
import { describe, expect, it } from 'vitest'
```
