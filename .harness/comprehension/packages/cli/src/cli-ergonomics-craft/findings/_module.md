---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/findings'
sourceHash: 'e64264a3c5151f3988925180044804354d722d893d4036e86c50f9ff62586aab'
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
import { CommandKind } from '../catalog/rubrics/types.js'
import { ClumpView } from '@harness-engineering/core'
```
