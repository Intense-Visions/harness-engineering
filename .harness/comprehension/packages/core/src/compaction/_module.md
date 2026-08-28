---
schemaVersion: 1
module: 'packages/core/src/compaction'
sourceHash: 'd0f5c342166d47fd2b40255919af49605dd2a68d52bbf634ff654513697a29cd'
compiledAt: '2026-08-28T01:22:10.302Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `compaction` module provides token-budget strategies for MCP tool responses: it bounds, truncates, paginates, and serializes oversized results into a structured markdown format tracked by `PackedEnvelope`. Core responsibilities: **Detail ceiling** (`boundItems`) caps graph query arrays to prevent unbounded serialization (200-item default ceiling derived from ~125 tokens/item benchmark). **Token accounting** (`estimateTokens`, `CHARS_PER_TOKEN`) uses centralized `chars/4` heuristic for pre-flight budgeting and cache decisions. **Pagination** (`paginate`) slices sorted results and emits `hasMore` continuation signals. **Pipeline** (`CompactionPipeline`) composes multiple strategies in order, forwarding each output to the next. **Envelope** (`PackedEnvelope`, `serializeEnvelope`) captures original→compacted token estimates and strategy trace, serialized as markdown with `<!-- packed: ... -->` headers.

## Invariants

- Ceiling fallback is fail-safe: boundItems() ALWAYS defaults to DEFAULT_GRAPH_DETAIL_CEILING if the ceiling argument is non-positive, non-finite, or absent — callers cannot accidentally disable the bound.
- Truncation is explicit: BoundedItems.truncated must be checked by tools; they must emit continuation signals rather than silently dropping tail items.
- Token estimation is centralized: all sites must use CHARS_PER_TOKEN=4 or estimateTokens() — divergent ratios break budget accounting across tools and pipelines.
- No input mutation: boundItems() returns a fresh copy; modifying the result does not affect the input array.
- Strategy order matters: CompactionPipeline applies strategies sequentially; each operates on prior output. Strategies are pure and stateless; reordering changes output.
- Envelope metadata is authoritative: PackedEnvelope.meta is the single source of truth for token savings. Cache metrics (read tokens, hit %) must be paired—both present or both absent.
- Pagination edge case: when limit=0, hasMore resolves true if offset < items.length (allows zero-length pages with continuation).
- Markdown contract: serializeEnvelope() produces <!-- packed: strategy | orig→compact tokens (-N%)[[cached|cache: ...]] --> followed by ### [source] sections—downstream parsers depend on this exact format.

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
