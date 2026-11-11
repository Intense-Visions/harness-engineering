---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/findings'
sourceHash: 'be4a74d3aa44694d57072a7a34a1837883a3b083a8dae63f8556c2138305d678'
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
