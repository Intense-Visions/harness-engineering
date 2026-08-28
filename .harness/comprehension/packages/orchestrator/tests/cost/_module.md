---
schemaVersion: 1
module: "packages/orchestrator/tests/cost"
sourceHash: "e359e1d731605874a0d9620597df52a1d2efdc1d7ae11ac03b054ef830368fb3"
compiledAt: "2026-08-28T01:22:12.544Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["cost-ceiling-monitor.test.ts"]
---

## Summary

The `cost` test module validates a cost-control system for language model token consumption. It has two main components:

**`computeUsageCostUsd`** — a pure function that multiplies token counts (input, output, cache-read, cache-write) by per-1M pricing rates to produce a USD cost. Handles missing pricing gracefully (returns zero).

**`CostCeilingMonitor`** — an event-driven monitor that tracks cumulative spend per task against optional per-task `maxUsd` ceilings. It registers tasks with optional cost limits and warning thresholds, accumulates cost across multiple `recordTurn()` calls, fires a one-time `'abort'` event when cumulative cost exceeds `maxUsd`, fires a one-time `'warn'` event when cost crosses a configurable `warnAtPct` threshold, never interferes between concurrent tasks, and returns final cost when unregistered. Real-world use: prevent runaway token spend by aborting long-running agentic tasks before they bankrupt an account.

## Invariants

- Abort fires exactly once per ceiling exceedance, never repeatedly, even if further turns are recorded after the breach
- Warn fires exactly once when the cost-to-ceiling ratio crosses the warnAtPct threshold
- Tasks registered without a maxUsd ceiling never emit abort or warn events, regardless of spend
- Concurrent tasks maintain separate cost accumulators; exceeding one task's ceiling does not affect another
- Missing pricing (null resolver) treats turns as $0 cost, preventing false aborts on unknown models
- Tasks remain tracked until unregisterTask() is called; state is not auto-expired
- Cost calculation includes cacheReadTokens and cacheCreationTokens at their respective per-1M rates when present

## Interface Contract

```ts

```

## Dependency Slice

```
import { CostCeilingMonitor, computeUsageCostUsd } from '../../src/cost/cost-ceiling-monitor.js'
import { ModelPricing, TokenUsage } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
```
