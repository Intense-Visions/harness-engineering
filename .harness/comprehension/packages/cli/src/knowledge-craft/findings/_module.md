---
schemaVersion: 1
module: 'packages/cli/src/knowledge-craft/findings'
sourceHash: 'f2aa9b99b9bb7f80339182a8917fd15c694df5e6b3c185af1c10fd75faddc766'
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
