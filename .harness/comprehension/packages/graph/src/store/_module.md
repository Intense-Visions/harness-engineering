---
schemaVersion: 1
module: 'packages/graph/src/store'
sourceHash: '3a7e9ff9836208111a7096780a8780736aaa84ef0a5c4b1041253aa954cddde3'
compiledAt: '2026-08-28T01:22:11.672Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'GraphStore.ts',
    'PackedSummaryCache.ts',
    'Serializer.ts',
    'VectorStore.ts',
    'resolve-graph-dir.ts',
  ]
---

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
