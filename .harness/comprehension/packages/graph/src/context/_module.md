---
schemaVersion: 1
module: 'packages/graph/src/context'
sourceHash: '857793ce50951ce543659c1f197757dda352b43dc7712c7505f0f835480dc73a'
compiledAt: '2026-08-28T01:22:11.574Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['Assembler.ts']
---

## Summary

The Assembler module provides intent-driven context assembly for the knowledge graph. Given a user intent and token budget, it searches for relevant nodes via FusionLayer (vector + structured search), expands results to depth 2 using ContextQL, scores nodes (1.0 for search hits, 0.5× for expansions), and truncates by token budget while keeping highest-scoring nodes. Secondary methods support phase-aware filtering (implement/review/debug/plan with type-specific boosting), proportional token budget allocation, documentation coverage reporting, and markdown repository mapping. Edges are filtered post-truncation to only include those between kept nodes.

## Invariants

- Edge validity: edges are filtered after truncation to only include those between kept nodes — dangling edges indicate a logic bug
- Score ordering: top search results score ≥1.0; depth-2 expansions score at 0.5× parent score; nodes without explicit score inherit parent × 0.5
- Token estimation: constant 4 chars = 1 token; formula ⌈(name + path + type + JSON.stringify(metadata)) / 4⌉ must be consistent across all callers
- Phase fallback: unknown phases silently fall back to PHASE_NODE_TYPES['implement'] — code requiring stricter validation must check result
- Budget allocation remainder: last type receives accumulated remainder tokens to avoid rounding loss
- Coverage predicate: a node is 'documented' iff store.getEdges({ to: nodeId, type: 'documents' }).length > 0
- FusionLayer lazy init: constructed once per Assembler instance; optional VectorStore parameter gates semantic search (null is valid)

## Interface Contract

```ts
export Assembler
```

## Dependency Slice

```
import { ContextQL } from '../query/ContextQL.js'
import { FusionLayer } from '../search/FusionLayer.js'
import { GraphStore } from '../store/GraphStore.js'
import { VectorStore } from '../store/VectorStore.js'
import { GraphEdge, GraphNode, NodeType } from '../types.js'
```
