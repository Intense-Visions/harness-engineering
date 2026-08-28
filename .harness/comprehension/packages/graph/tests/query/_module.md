---
schemaVersion: 1
module: 'packages/graph/tests/query'
sourceHash: 'c17fb7735122a18ccc5a7fd158df65c95e0e98614512ca6acd582a582c163cee'
compiledAt: '2026-08-28T01:22:11.757Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['ContextQL.test.ts', 'Projection.test.ts', 'Traceability.test.ts']
---

## Summary

`packages/graph/tests/query` validates three core query operations on the knowledge graph: **traversal, projection, and traceability mapping**.

**ContextQL** is a BFS graph traversal engine that accepts root node IDs and explores outbound (or bidirectional) up to a depth limit, filtered by node and edge types with optional pruning rules. Observability nodes (spans) are excluded by default. Results include the subgraph and metadata (nodes visited, edges followed, depth reached, traversed count). A `shortestPath()` method finds minimum-hop connections between nodes.

**Projection** is a field-selection utility that picks specified fields from nodes and returns copies (not references).

**Traceability** maps requirements to code and test coverage. It queries requirement nodes, traces `requires` edges to code files and `verified_by` edges to test files, and reports coverage status (`'full'`, `'code-only'`, or `'none'`). Results are grouped by spec file and feature, preserving confidence scores and tracing methods from edge metadata.

## Invariants

- Root nodes are always included, even if they don't match includeTypes filters
- Observability nodes (spans) are pruned by default unless pruneObservability: false is set
- Empty root set returns empty results (no exception thrown)
- Missing or nonexistent root nodes are handled gracefully (treated as empty)
- Projection returns copies, not references, even when no field filter is given
- stats.depthReached ≤ maxDepth and stats.totalTraversed ≥ stats.totalReturned
- Traceability requires requirement nodes with metadata keys: specPath, featureName, index
- Coverage status is mutually exclusive: 'full' (both code + test edges), 'code-only' (code only), 'none' (no edges)
- Edge metadata (confidence, method) is preserved through traversal and traceability queries
- Shortest-path returns null for unreachable pairs (direction-aware)

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
