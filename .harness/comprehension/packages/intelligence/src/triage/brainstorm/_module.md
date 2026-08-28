---
schemaVersion: 1
module: 'packages/intelligence/src/triage/brainstorm'
sourceHash: 'c0ff0047c3c24f64aa370fb700321d9a9655621eb933508d1c5217e92d111504'
compiledAt: '2026-08-28T01:22:11.865Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['runner.test.ts', 'runner.ts', 'types.ts']
---

## Interface Contract

```ts
export DEPTH_BY_LEVEL
export depthForLevel
export runAutoBrainstorm
```

## Dependency Slice

```
import { runAutoBrainstorm } from './runner.js'
import { BrainstormInput, BrainstormOutcome, DepthBudget, Fork, ForkDecision, ForkGenerator, SpecDraft } from './types.js'
import { ComplexityLevel } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
