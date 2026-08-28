---
schemaVersion: 1
module: 'packages/graph/tests/search'
sourceHash: '8318f7c6b03204e43f5dd55650b34394293d750a19a46f27922ed3cac6d25468'
compiledAt: '2026-08-28T01:22:11.753Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['FusionLayer.test.ts']
---

## Summary

The `packages/graph/tests/search` module tests **FusionLayer**, a hybrid search component that ranks graph nodes by blending keyword matching with optional semantic (vector embedding) scoring. It validates that search results are correctly ranked by signal strength, handles both keyword and vector-based queries, respects result limits, and filters stop words and zero-scoring nodes. The layer integrates with GraphStore (the node database) and optionally with VectorStore (embeddings). When VectorStore is absent, it falls back to pure keyword matching.

## Invariants

- Keyword signal strength hierarchy: exact name match (1.0) > partial name (0.7) > path match (0.5) > metadata (0.3)
- Score blending formula with VectorStore: 0.6 × keyword_signal + 0.4 × semantic_signal
- Score blending without VectorStore: score = keyword_signal, semantic_signal = 0
- Results ordered descending by score; nodes with equal signals maintain stable ranking
- Zero-score nodes excluded from results; only matching nodes returned
- Result count ≤ topK parameter; if fewer matches exist, return all matches
- Stop words filtered from queries; empty/whitespace-only queries return empty results
- No matches to query returns empty result array (no errors thrown)
- Node metadata fields (e.g., language) contribute to keyword scoring at 0.3 signal strength
- VectorStore is optional with graceful fallback; semantic scores computed only for nodes with embeddings in store

## Interface Contract

```ts

```

## Dependency Slice

```
import { FusionLayer, FusionResult } from '../../src/search/FusionLayer.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { VectorStore } from '../../src/store/VectorStore.js'
import { beforeEach, describe, expect, it } from 'vitest'
```
