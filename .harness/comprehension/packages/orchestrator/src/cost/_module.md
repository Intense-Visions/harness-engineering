---
schemaVersion: 1
module: "packages/orchestrator/src/cost"
sourceHash: "fd51224a356068b46b9c29bb49d20dd2c009b6cec1652c22cf7aba2c78dc2865"
compiledAt: "2026-08-28T01:22:12.169Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["cost-ceiling-monitor.ts"]
---

## Summary

The `packages/orchestrator/src/cost` module provides per-task cost ceiling monitoring via a stateful `CostCeilingMonitor` event emitter and a pure `computeUsageCostUsd` cost-calculation helper. The monitor tracks cumulative spend, emits one-shot 'warn' and 'abort' events when optional thresholds are crossed, and degrades gracefully on missing pricing (logs once per task+model, records $0).

## Invariants

- 'abort' and 'warn' events fire at most once per task lifetime, then suppressed
- Unknown model pricing is logged once per task+model pair and treated as $0 cost (abort cannot fire)
- Re-registering a task via registerTask() resets its state and cost accumulator
- recordTurn() on unregistered tasks is a no-op returning 0
- warnAtPct only triggers warn if 0 < warnAtPct < 100
- Abort fires on cost > maxUsd (strict inequality; one overage transaction can breach)
- Cache read/write pricing is optional; omitted rates are treated as $0
- Each recordTurn() call is atomic: single delta computation, one accumulator update, one event burst

## Interface Contract

```ts
export CostCeilingMonitor
export computeUsageCostUsd
```

## Dependency Slice

```
import { ModelPricing, TokenUsage } from '@harness-engineering/types'
import { EventEmitter } from 'node:events'
```
