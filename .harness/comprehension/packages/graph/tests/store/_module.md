---
schemaVersion: 1
module: 'packages/graph/tests/store'
sourceHash: 'de15b6a2b251d349185dcc272e33c7fe359c78037e9c996b6b9cf4dc759881a7'
compiledAt: '2026-08-28T01:22:11.795Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'GraphStore.security.test.ts',
    'GraphStore.shortestPath.test.ts',
    'GraphStore.test.ts',
    'PackedSummaryCache.test.ts',
    'Serializer.test.ts',
    'VectorStore.test.ts',
    'resolve-graph-dir.test.ts',
  ]
---

## Summary

GraphStore test suite covers three dimensions: CRUD operations for nodes/edges with upsert semantics and cascade deletion, breadth-first shortest-path traversal with direction constraints (outbound/inbound/both), and security hardening against prototype pollution via **proto**/constructor filtering. The store wraps LokiJS internally but surfaces a clean API that hides metadata ($loki, meta) from consumers. Nodes searchable by type/name/path; edges queryable by endpoints; missing nodes and unreachable paths handled gracefully.

## Invariants

- No internal metadata leakage: getNode/getEdges never expose $loki or meta (LokiJS internals).
- Upsert semantics: addNode with existing ID updates in-place, does not duplicate.
- Cascade on removal: removeNode deletes all edges referencing that node (incident in both directions).
- Path returns are copies: shortestPath and queries return deep copies, not store references, preventing external mutation.
- Prototype pollution defense: addNode/addEdge strip **proto** and constructor keys to prevent Object.prototype pollution.
- Graceful null handling: missing nodes and unreachable paths return null; removeNode is a no-op on missing IDs.
- Direction-aware traversal: shortestPath respects direction parameter (outbound=forward only, inbound=backward only, both=bidirectional).

## Interface Contract

```ts

```

## Dependency Slice

```
import { GraphStore } from '../../src/store/GraphStore.js'
import { PackedSummaryCache, normalizeIntent } from '../../src/store/PackedSummaryCache.js'
import { loadGraph, loadGraphMetadata, saveGraph } from '../../src/store/Serializer.js'
import { VectorStore } from '../../src/store/VectorStore.js'
import { findMainWorktreeRoot, localGraphDir, resolveGraphDir } from '../../src/store/resolve-graph-dir.js'
import { CURRENT_SCHEMA_VERSION, GraphEdge, GraphMetadata, GraphNode } from '../../src/types.js'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
