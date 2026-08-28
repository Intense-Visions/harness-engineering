---
schemaVersion: 1
module: 'packages/graph/tests/query'
sourceHash: 'c17fb7735122a18ccc5a7fd158df65c95e0e98614512ca6acd582a582c163cee'
compiledAt: '2026-08-28T01:22:11.757Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['ContextQL.test.ts', 'Projection.test.ts', 'Traceability.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ContextQL } from '../../src/query/ContextQL.js'
import { project } from '../../src/query/Projection.js'
import { queryTraceability } from '../../src/query/Traceability.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { GraphEdge, GraphNode } from '../../src/types.js'
import { beforeEach, describe, expect, it } from 'vitest'
```
