---
schemaVersion: 1
module: 'packages/core/tests/compaction'
sourceHash: 'd068c6757a20c6b14f08438ff05c7859f2581fc65189cf88a1901a306a58a7f4'
compiledAt: '2026-08-28T01:22:10.770Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'envelope.test.ts',
    'pagination.test.ts',
    'pipeline.test.ts',
    'structural.test.ts',
    'truncation.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CHARS_PER_TOKEN, PackedEnvelope, estimateTokens, serializeEnvelope } from '../../src/compaction/envelope'
import from '../../src/compaction/index'
import { PaginatedSlice, PaginationMeta, paginate } from '../../src/compaction/pagination'
import { CompactionPipeline } from '../../src/compaction/pipeline'
import { CompactionStrategy, StructuralStrategy } from '../../src/compaction/strategies/structural'
import { DEFAULT_TOKEN_BUDGET, TruncationStrategy } from '../../src/compaction/strategies/truncation'
import { describe, expect, it, vi } from 'vitest'
```
