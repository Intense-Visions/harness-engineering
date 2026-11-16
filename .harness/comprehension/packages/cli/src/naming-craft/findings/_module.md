---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/findings'
sourceHash: 'e93e1a29d9a4542f1528acb72430c86145a61d9180a2e12a9914a783c15875b0'
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
import { CraftAbstention } from '../../shared/craft/scope.js'
import { ClumpView } from '@harness-engineering/core'
```
