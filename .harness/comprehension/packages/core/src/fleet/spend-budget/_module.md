---
schemaVersion: 1
module: 'packages/core/src/fleet/spend-budget'
sourceHash: 'eb45f32aea77b1f4aea1f9df59e78d07f445467879487bcbbbd3e3a9162d3df8'
compiledAt: '2026-08-28T01:22:10.397Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.test.ts', 'index.ts']
---

## Interface Contract

```ts
export evaluateSpendEnvelope
export isFleetAllocationExhausted
export isGlobalEnvelopeExhausted
```

## Dependency Slice

```
import { evaluateSpendEnvelope, isFleetAllocationExhausted, isGlobalEnvelopeExhausted } from './index'
import { ObservedSpend, SpendEnvelope, SpendEnvelopeVerdict } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
