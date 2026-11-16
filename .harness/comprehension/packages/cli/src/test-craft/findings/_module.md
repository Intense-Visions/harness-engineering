---
schemaVersion: 1
module: 'packages/cli/src/test-craft/findings'
sourceHash: '512d8975ccca473e25531633975796e50571a5b8f5c6ea81c5417f1ed2dfa4d2'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['schema.ts']
---

## Interface Contract

```ts
export Confidence
export Impact
export Tier
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
import { CraftAbstention } from '../../shared/craft/scope.js'
import { ClumpView } from '@harness-engineering/core'
```
