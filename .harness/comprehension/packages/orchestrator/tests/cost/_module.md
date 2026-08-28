---
schemaVersion: 1
module: 'packages/orchestrator/tests/cost'
sourceHash: 'e359e1d731605874a0d9620597df52a1d2efdc1d7ae11ac03b054ef830368fb3'
compiledAt: '2026-08-28T01:22:12.544Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cost-ceiling-monitor.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CostCeilingMonitor, computeUsageCostUsd } from '../../src/cost/cost-ceiling-monitor.js'
import { ModelPricing, TokenUsage } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
```
