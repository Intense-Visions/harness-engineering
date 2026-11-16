---
schemaVersion: 1
module: 'packages/cli/src/code-craft/findings'
sourceHash: '27715f285c333fbc01a3171d4168d41a6b91bb30956279b98a5d5f0ee74def6c'
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
