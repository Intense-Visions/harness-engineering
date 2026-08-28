---
schemaVersion: 1
module: 'packages/core/src/fleet/rate-budget'
sourceHash: 'f7ff05c0dc090362b5f24962b38ce61077bdc24d249373ec28c754d9ec30d79d'
compiledAt: '2026-08-28T01:22:10.397Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['budget.test.ts', 'budget.ts', 'errors.ts', 'index.ts', 'types.ts']
---

## Summary

The `rate-budget` module governs concurrent fan-out requests to external APIs by enforcing per-resource rate limits and coordinating shared backoff. Each resource gets a rolling-window budget (e.g., "10 requests per 60s"). The `acquire(resource)` method blocks until a slot is free, then records the grant. The `penalize(resource, cooldownMs)` method installs a shared cooldown that all consumers respect together. Errors (`ThrottledFetchError`, `TruncatedFetchError`) enforce fail-on-throttle semantics—partial or silent-zero data from a throttled fetch is forbidden. Design is purely injected-IO for testability; a process-wide singleton (`sharedRateBudget`) applies startup config to all in-process fan-out without per-leaf wiring.

## Invariants

- Cooldown dominates rolling window and never shortens — cooldownUntil is checked first in delayFor(); penalize() extends via Math.max(), never reducing an existing penalty.
- Shared backoff synchronizes all consumers — every leaf holding the same budget handle waits on the same shared cooldown; one leaf's throttle response backs off all siblings immediately.
- Grant recording is unconditional — acquire() always records a timestamp in recent[], even for unconfigured resources, so the window is populated if the resource is configured() later.
- Rolling-window pruning is lazy and side-effect-free — delayFor() prunes stale timestamps before calculating delay, but the return value depends only on state + now(), enabling pure-function testing.
- Fail-on-throttle is non-negotiable — throttled (429/403) and truncated fetches must throw ThrottledFetchError/TruncatedFetchError; returning partial data silently would hide under-fetches in fan-out aggregates.
- Wait-time calculation enforces forward progress — at capacity, Math.max(1, windowMs - (now - oldest)) guarantees at least 1ms wait, preventing busy loops.
- Process scope is in-process only — the budget governs Promise.all-style concurrency within a single process; cross-process leaf coordination is deferred and out of scope.

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
