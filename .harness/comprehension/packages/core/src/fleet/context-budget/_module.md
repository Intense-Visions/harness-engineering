---
schemaVersion: 1
module: 'packages/core/src/fleet/context-budget'
sourceHash: '8c57a22529c7c78fd9df929e823fa1b9a55300abb6dc531e495efe9740afcbd1'
compiledAt: '2026-08-28T01:22:10.389Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.test.ts', 'index.ts']
---

## Interface Contract

```ts
export ContextBudgetExceededError
export DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS
export DEFAULT_SESSION_BUDGET_HINT
export assertLeafWithinBudget
export enforceLeafContextBudget
export evaluateSessionContextBudget
export formatBudgetFailure
export resolveContextBudget
export summarizeLeafSpend
```

## Dependency Slice

```
import { ContextBudgetExceededError, DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS, DEFAULT_SESSION_BUDGET_HINT, assertLeafWithinBudget, enforceLeafContextBudget, evaluateSessionContextBudget, formatBudgetFailure, resolveContextBudget, summarizeLeafSpend } from './index'
import { ContextBudget, ContextBudgetSchema, LeafBudgetVerdict, LeafContextEstimate, LeafContextSource, LeafContextSpend, LeafContextSpendSchema, validateLeafContextEstimate } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
