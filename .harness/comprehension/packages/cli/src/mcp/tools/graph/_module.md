---
schemaVersion: 1
module: 'packages/cli/src/mcp/tools/graph'
sourceHash: '0f22f4a8c97feecbe72f4a8a9fcebb860f85f886d81e710f35b82698837a6800'
compiledAt: '2026-08-28T01:22:09.293Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `graph` tools module provides MCP handlers for querying and analyzing a codebase's knowledge graph. It exposes 10 graph operations (ask, impact, blast-radius, anomalies, relationships, etc.) and their schema definitions, routing natural language questions and structured queries to the `@harness-engineering/graph` backend. The module is a thin dispatcher: each handler validates input, loads a cached GraphStore, delegates to a graph utility (CascadeSimulator, askGraph, etc.), and serializes results to JSON. Path inputs are sanitized; missing graphs return a standardized error. The module is graph-agnostic — it doesn't construct or interpret the graph, only gate access and enforce output bounds.

## Invariants

- All handlers load-then-guard: Every handler calls loadGraphStore(sanitizePath(input.path)) and returns graphNotFoundError() if null. Graph absence must never proceed to a cascade or query.
- Detailed mode is bounded: When mode==='detailed', output arrays (nodes, edges, cascade layers) are capped to graph.detailedMode.maxItems from config via resolveDetailCeiling(). Hub nodes (high-degree) cannot return unbounded payloads (issue #1591).
- Truncation signals are explicit: When output is truncated, handlers emit truncated: true + a continuation object with hints (reason, ceiling, item counts). Callers must check truncation before interpreting results as complete.
- Dual node resolution (computeBlastRadius): Accepts either file path or nodeId, but not both; file paths are resolved to file nodes before simulation. Validation prevents missing node gracefully.
- Probability/depth bounds are enforced: probabilityFloor ∈ (0, 1), maxDepth ∈ [1, 100]. Out-of-range inputs reject before simulation.
- Error handling is consistent: Try-catch wraps all async work; errors return { isError: true, content: [...] } with plain-text message. No exceptions escape.
- Response format is uniform: All handlers return { content: [{ type: 'text', text: JSON.stringify(...) }] }, making output serializable and machine-parseable by MCP clients.

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
