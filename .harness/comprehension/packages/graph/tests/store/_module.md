---
schemaVersion: 1
module: 'packages/graph/tests/store'
sourceHash: 'de15b6a2b251d349185dcc272e33c7fe359c78037e9c996b6b9cf4dc759881a7'
compiledAt: '2026-08-28T01:22:11.795Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
