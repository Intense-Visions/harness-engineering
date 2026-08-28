---
schemaVersion: 1
module: 'packages/graph/src/search'
sourceHash: 'faf2bc55fc31f6c115efd047e23ba6499e08559b587e9aca30f0b954a2df9110'
compiledAt: '2026-08-28T01:22:11.629Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['FusionLayer.ts']
---

## Summary

FusionLayer is a hybrid search class that ranks graph nodes by fusing keyword-based and semantic (vector) scoring signals. It tokenizes queries into keywords (filtering stop words, minimum 2 chars), scores nodes via exact/partial name/path/metadata matches (tiers: 1.0/0.7/0.5/0.3), optionally scores semantically via vector search if a VectorStore is available, then fuses both signals with configurable weights (default 60% keyword, 40% semantic). Results with score > 0 are returned sorted descending and truncated to top-K. The class gracefully degrades to 100% keyword-only search when semantic data is unavailable.

## Invariants

- Empty query extraction (zero keywords after stop-word filtering) returns empty results immediately, never attempts node retrieval
- Semantic weight automatically zeroes and keyword weight becomes 1.0 if VectorStore is absent or queryEmbedding is undefined; no explicit weight override at search time
- Keyword relevance tiers (exact name=1.0, contains name=0.7, contains path=0.5, metadata=0.3) are hardcoded constants with no per-domain calibration
- Node keyword score is computed as average across all keywords; one strong match can balance a weak one and vice versa
- Non-string metadata values are silently ignored during keyword matching; no type coercion or numeric scoring
- Only nodes with fused score > 0 are included in results; final output is top-K after sorting descending by score
- Class is stateless and read-only; all fields private, no mutation or caching methods, weights fixed at construction

## Interface Contract

```ts
export FusionLayer
```

## Dependency Slice

```
import { GraphStore } from '../store/GraphStore.js'
import { VectorStore } from '../store/VectorStore.js'
import { GraphNode } from '../types.js'
```
