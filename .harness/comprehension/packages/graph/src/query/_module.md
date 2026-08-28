---
schemaVersion: 1
module: 'packages/graph/src/query'
sourceHash: '79a613d7688249f5d064ab9ad6a2bf24dbce89bb9b248f4faecd580b82d4ec4b'
compiledAt: '2026-08-28T01:22:11.658Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['ContextQL.ts', 'Projection.ts', 'Traceability.ts', 'groupImpact.test.ts', 'groupImpact.ts']
---

## Interface Contract

```ts
export CODE_TYPES
export ContextQL
export DOC_TYPES
export TEST_TYPES
export classifyNodeCategory
export groupNodesByImpact
export project
export queryTraceability
```

## Dependency Slice

```
import { GraphStore } from '../store/GraphStore.js'
import { ContextQLParams, ContextQLResult, GraphEdge, GraphNode, OBSERVABILITY_TYPES, ProjectionSpec, ShortestPathOptions, ShortestPathResult } from '../types.js'
import { CODE_TYPES, DOC_TYPES, TEST_TYPES, classifyNodeCategory, groupNodesByImpact } from './groupImpact.js'
import { describe, expect, it } from 'vitest'
```
