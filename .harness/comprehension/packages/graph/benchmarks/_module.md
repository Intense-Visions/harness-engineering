---
schemaVersion: 1
module: 'packages/graph/benchmarks'
sourceHash: '73a5f5d1739d4d057c5c55f4651b81003c8f1220b558c882c467468dbbd94d5b'
compiledAt: '2026-08-28T01:22:11.567Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['queries.bench.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ContextQL } from '../src/query/ContextQL.js'
import { groupNodesByImpact } from '../src/query/groupImpact.js'
import { GraphStore } from '../src/store/GraphStore.js'
import { GraphEdge, GraphNode } from '../src/types.js'
import { bench, describe } from 'vitest'
```
