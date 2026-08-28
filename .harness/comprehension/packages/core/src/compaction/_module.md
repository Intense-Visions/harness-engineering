---
schemaVersion: 1
module: 'packages/core/src/compaction'
sourceHash: 'd0f5c342166d47fd2b40255919af49605dd2a68d52bbf634ff654513697a29cd'
compiledAt: '2026-08-28T01:22:10.302Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'detail-ceiling.test.ts',
    'detail-ceiling.ts',
    'envelope.ts',
    'index.ts',
    'pagination.ts',
    'pipeline.ts',
  ]
---

## Interface Contract

```ts
export BoundedItems
export CHARS_PER_TOKEN
export CompactionPipeline
export CompactionStrategy
export DEFAULT_GRAPH_DETAIL_CEILING
export DEFAULT_TOKEN_BUDGET
export PackedEnvelope
export PaginatedSlice
export PaginationMeta
export StructuralStrategy
export TruncationStrategy
export boundItems
export estimateTokens
export paginate
export serializeEnvelope
```

## Dependency Slice

```
import { DEFAULT_GRAPH_DETAIL_CEILING, boundItems } from './detail-ceiling'
import { CompactionStrategy } from './strategies/structural'
import { describe, expect, it } from 'vitest'
```
