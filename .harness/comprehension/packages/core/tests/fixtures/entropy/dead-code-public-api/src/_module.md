---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-public-api/src'
sourceHash: '55a8b8b529e04d3e5622d72b8467f0cc79b2dd6d3ceedd914ce49f174363f4cb'
compiledAt: '2026-08-28T01:22:10.857Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['budget.spec.ts', 'budget.ts', 'consumer.ts', 'index.ts']
---

## Interface Contract

```ts
export annotatedPublic
export deadPublic
export testOnlyPublic
export usedPublic
```

## Dependency Slice

```
import { testOnlyPublic, usedPublic } from './index'
```
