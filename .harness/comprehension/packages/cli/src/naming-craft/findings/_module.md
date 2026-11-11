---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/findings'
sourceHash: 'd8b6f23d7d8189d910b587f33da880fe4ac8c0b51b1533a71b2596780b48b422'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['derived.ts', 'schema.ts']
---

## Interface Contract

```ts
export Confidence
export Impact
export Tier
export derivePriority
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
import { ClumpResult } from '@harness-engineering/core'
```
