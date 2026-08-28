---
schemaVersion: 1
module: 'packages/graph/src/store'
sourceHash: '3a7e9ff9836208111a7096780a8780736aaa84ef0a5c4b1041253aa954cddde3'
compiledAt: '2026-08-28T01:22:11.672Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'GraphStore.ts',
    'PackedSummaryCache.ts',
    'Serializer.ts',
    'VectorStore.ts',
    'resolve-graph-dir.ts',
  ]
---

## Summary

This module provides an in-memory graph data structure with fast querying and BFS-based shortest-path support. GraphStore is the core class, maintaining four coordinated indices: nodeMap (ID → node), edgeMap ((from, to, type) → edge), and three selective indices (edgesByFrom, edgesByTo, edgesByType) for query acceleration. It supports node/edge CRUD with batch operations, neighbor/connectivity queries (outbound/inbound/both), shortest-path finding via BFS with full path reconstruction, and persistence with schema version gating. All getters return shallow copies to prevent external mutation. Supporting classes handle caching (PackedSummaryCache, VectorStore), serialization, and directory management.

## Invariants

- Edge uniqueness by composite key: Edges keyed by (from, to, type) via edgeKey(); duplicate inserts merge metadata, never duplicate in storage
- All four edge structures stay in sync: edgeMap + three indices (edgesByFrom, edgesByTo, edgesByType) updated together on add/remove; desync corrupts queries
- Shallow-copy on retrieval: Every getNode(), getEdge(), and query result returns shallow copies; external code cannot mutate internal maps
- Prototype-pollution defense: safeMerge() rejects POISONED_KEYS (**proto**, constructor, prototype); load-bearing for security on untrusted payloads
- Node removal cascades edges: removeNode() must delete all edges where that node is source or target; dangling edges break adjacency queries and path-finding
- Self-edge removal is single-pass: removeNode() deduplicates self-edges via Set([...fromEdges, ...toEdges]) to avoid double-removal
- BFS parent-map reconstruction handles bidirectional edges: reconstructPath() flips direction via edge.from === currentId ? edge.to : edge.from; assumes edges can traverse either way in path
- Schema version mismatch forces rebuild: load() rejects mismatched versions and returns false; caller must trigger 'harness graph scan' to repopulate, preventing silent corruption
- Query planner picks most selective index first: selectCandidates() prefers edgesByFrom (if from given) → edgesByTo → edgesByType → full scan; wrong choice degrades large-graph performance

## Interface Contract

```ts
export CacheableEnvelope
export GraphStore
export PackedSummaryCache
export VectorStore
export findMainWorktreeRoot
export loadGraph
export loadGraphMetadata
export localGraphDir
export normalizeIntent
export resolveGraphDir
export saveGraph
```

## Dependency Slice

```
import { CURRENT_SCHEMA_VERSION, EdgeType, GraphEdge, GraphMetadata, GraphNode, NodeType, ShortestPathOptions, ShortestPathResult } from '../types.js'
import { GraphStore } from './GraphStore.js'
import { loadGraph, saveGraph } from './Serializer.js'
import * as fs from 'fs'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import * as path from 'path'
```
