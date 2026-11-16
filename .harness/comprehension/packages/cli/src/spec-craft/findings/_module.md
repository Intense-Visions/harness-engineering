---
schemaVersion: 1
module: 'packages/cli/src/spec-craft/findings'
sourceHash: 'f84f18054e3f5e697cbed21f16635a284b342bec9a04a5bc8ca561d7624fee60'
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
