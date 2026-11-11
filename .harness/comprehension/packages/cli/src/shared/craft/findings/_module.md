---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/findings'
sourceHash: '2cb6f097424a4e58f172e5104d30a3dd924b7acd2e5ee089e0085194198a68ec'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['axes.ts', 'derived.test.ts', 'derived.ts']
---

## Interface Contract

```ts
export CONFIDENCE_RANK
export Confidence
export Impact
export Tier
export derivePriority
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from './axes.js'
import { derivePriority } from './derived.js'
import { Confidence, CraftTier, Impact } from '@harness-engineering/core'
import { describe, expect, it } from 'vitest'
```
