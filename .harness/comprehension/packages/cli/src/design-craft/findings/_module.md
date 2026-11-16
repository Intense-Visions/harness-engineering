---
schemaVersion: 1
module: 'packages/cli/src/design-craft/findings'
sourceHash: '351b02b8ea72148f8724f07fdf2ffc2e5b65467ab3445ca47e87571066318b32'
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
import { ResponsiveGateResult } from '../../responsive/index.js'
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
import { CraftAbstention } from '../../shared/craft/scope.js'
import { ClumpView } from '@harness-engineering/core'
```
