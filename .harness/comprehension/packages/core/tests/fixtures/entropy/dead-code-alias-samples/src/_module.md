---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-alias-samples/src'
sourceHash: '7a069bef7b34ed8c719269c88624eb000ed4c7e50974aef91125e832d7745aa4'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['main.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { reachedViaRelative } from './lib/relative'
import { reachedViaAlias } from '@lib/aliased'
import { reachedViaNestedAlias } from '@lib/nested/deep'
```
