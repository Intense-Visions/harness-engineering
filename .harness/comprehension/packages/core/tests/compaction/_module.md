---
schemaVersion: 1
module: 'packages/core/tests/compaction'
sourceHash: 'd068c6757a20c6b14f08438ff05c7859f2581fc65189cf88a1901a306a58a7f4'
compiledAt: '2026-08-28T01:22:10.770Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'envelope.test.ts',
    'pagination.test.ts',
    'pipeline.test.ts',
    'structural.test.ts',
    'truncation.test.ts',
  ]
---

## Summary

**packages/core/tests/compaction** tests a composable token-aware data compaction pipeline. **Envelope** serializes compacted content with strategy names, token counts (original/compacted), and reduction percentage in markdown headers. **Pagination** slices arrays with correct `hasMore` logic using `offset + limit < total`. **Pipeline** chains strategies in order, passing token budgets through each stage; empty pipeline is identity. **StructuralStrategy** prunes JSON by removing null/undefined/empty values and collapsing single-item arrays to scalars, working on both JSON and plain text. **TruncationStrategy** truncates content to a token budget (default 4000 tokens = 16K chars) while preserving high-priority lines containing errors, file paths, or identifiers; appends a `[truncated]` marker when budget allows. Both strategies guarantee string return types even with zero budget or fully-pruned input.

## Invariants

- CHARS_PER_TOKEN = 4: Single exported constant used centrally by all token-estimation sites (comprehension serve budgets, leaf context estimates, pre-warm attribution)
- Envelope metadata completeness: Original token estimate, compacted estimate, and reduction percentage always present; cache metrics (if cached) show read tokens and hit percentage
- Pagination hasMore correctness: hasMore = (offset + limit < total); true when items remain, false on final page
- Pipeline preserves budget contract: Each strategy receives budget parameter and applies it; empty pipeline returns input unchanged
- StructuralStrategy is non-lossy: Only removes provably-empty/null values; single-item array collapsing is semantic normalization, never data loss
- TruncationStrategy preserves critical content: Lines with errors, file paths (containing /), or identifier-like tokens retained even under tight budgets; single long line is truncated not dropped
- Both strategies always return string: Never undefined or null; even with budget=0 or fully-pruned input, return '' not undefined
- Envelope serialization is parseable: Metadata encoded in HTML comments (<!-- packed: ... -->); sections use consistent ### [source] headings

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
