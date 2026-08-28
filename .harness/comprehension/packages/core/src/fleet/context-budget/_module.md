---
schemaVersion: 1
module: 'packages/core/src/fleet/context-budget'
sourceHash: '8c57a22529c7c78fd9df929e823fa1b9a55300abb6dc531e495efe9740afcbd1'
compiledAt: '2026-08-28T01:22:10.389Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.test.ts', 'index.ts']
---

## Summary

`context-budget` is a pure, offline module for enforcing per-leaf context budget gates in the fleet system (PR #1524). It prevents oversized work items from being fanned out to multiple agents, where they'd silently multiply the dominant cost term. The module contains five decision primitives: `enforceLeafContextBudget()` compares a leaf's declared token load against a budget (default 200k tokens) and returns a discriminated verdict with overage details; `assertLeafWithinBudget()` throws `ContextBudgetExceededError` if over budget; `evaluateSessionContextBudget()` warns loudly for manual sessions; and `formatBudgetFailure()` / `summarizeLeafSpend()` format verdicts. All functions are pure transforms with no network, fs, or token-counting library—following fleet's injected-IO discipline and the fail-loud contract: reject over-budget leaves at dispatch, never silently spend them.

## Invariants

- Boundary is in budget: estimatedTokens === budget.maxTokens yields ok:true with zero headroom, not an overage
- Overage verdicts carry loud reasons: every ok:false verdict includes non-empty reason string naming item, estimate, budget, overage, and top 3 token sources
- Non-positive budgets are rejected: resolveContextBudget() throws rather than silently disabling the ceiling if maxTokens ≤ 0
- Session and leaf verdicts are synchronized: evaluateSessionContextBudget() and enforceLeafContextBudget() agree on over/under decision for identical token count and budget
- Schema validation prevents misread input: malformed estimates (unknown keys, negative tokens) are rejected by validateLeafContextEstimate() upstream before enforcement
- Sources are ranked by contribution: top sources sorted largest-first (stable on ties) so reason names true cost drivers

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
