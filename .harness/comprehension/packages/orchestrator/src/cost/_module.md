---
schemaVersion: 1
module: 'packages/orchestrator/src/cost'
sourceHash: 'fd51224a356068b46b9c29bb49d20dd2c009b6cec1652c22cf7aba2c78dc2865'
compiledAt: '2026-08-28T01:22:12.169Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cost-ceiling-monitor.ts']
---

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
