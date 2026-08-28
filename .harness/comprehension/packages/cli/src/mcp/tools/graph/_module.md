---
schemaVersion: 1
module: 'packages/cli/src/mcp/tools/graph'
sourceHash: '0f22f4a8c97feecbe72f4a8a9fcebb860f85f886d81e710f35b82698837a6800'
compiledAt: '2026-08-28T01:22:09.293Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'ask-graph.ts',
    'compute-blast-radius.ts',
    'detail-ceiling.behavior.test.ts',
    'detect-anomalies.ts',
    'find-context-for.ts',
    'get-graph-schema.test.ts',
    'get-graph-schema.ts',
    'get-impact.ts',
    'get-relationships.ts',
    'index.ts',
    'ingest-source.test.ts',
    'ingest-source.ts',
    'query-graph.test.ts',
    'query-graph.ts',
    'search-similar.ts',
    'shared.ts',
  ]
---

## Interface Contract

```ts
export askGraphDefinition
export computeBlastRadiusDefinition
export detectAnomaliesDefinition
export findContextForDefinition
export getGraphSchemaDefinition
export getImpactDefinition
export getRelationshipsDefinition
export handleAskGraph
export handleComputeBlastRadius
export handleDetectAnomalies
export handleFindContextFor
export handleGetGraphSchema
export handleGetImpact
export handleGetRelationships
export handleIngestSource
export handleQueryGraph
export handleSearchSimilar
export ingestSourceDefinition
export queryGraphDefinition
export searchSimilarDefinition
```

## Dependency Slice

```
import { loadIngestOptions } from '../../../commands/graph/ingest-options.js'
import { resolveConfig } from '../../../config/loader.js'
import { clearGraphStoreCache, loadGraphStore } from '../../utils/graph-loader.js'
import { sanitizePath } from '../../utils/sanitize-path.js'
import { handleComputeBlastRadius } from './compute-blast-radius.js'
import { getGraphSchemaDefinition, handleGetGraphSchema } from './get-graph-schema'
import { handleGetImpact } from './get-impact.js'
import { handleIngestSource } from './ingest-source.js'
import { handleQueryGraph, queryGraphDefinition } from './query-graph'
import { handleQueryGraph } from './query-graph.js'
import { graphNotFoundError, resolveDetailCeiling } from './shared.js'
import { DEFAULT_GRAPH_DETAIL_CEILING, boundItems, paginate } from '@harness-engineering/core'
import { GraphEdge, GraphNode, GraphStore, resolveGraphDir } from '@harness-engineering/graph'
import from '@harness-engineering/intelligence'
import * as fs from 'fs'
import * as fs from 'node:fs'
import from 'node:fs/promises'
import * as os from 'node:os'
import * as path, path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
