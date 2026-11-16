---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/findings'
sourceHash: '32ea8167e78b2d5ee33335ef7488d4cc245975befb0075b309c648e95b093d37'
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
import { ClumpView } from '@harness-engineering/core'
```
