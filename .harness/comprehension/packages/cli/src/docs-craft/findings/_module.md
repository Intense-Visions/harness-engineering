---
schemaVersion: 1
module: 'packages/cli/src/docs-craft/findings'
sourceHash: '65747d9d6b85fc614854c7195037a69f7820665a990d86c2a0b7eaa64ee04f84'
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
import { DocKind } from '../catalog/rubrics/types.js'
import { ClumpView } from '@harness-engineering/core'
```
