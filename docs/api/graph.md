# @harness-engineering/graph

Knowledge graph for codebase relationships, context assembly, and entropy detection. Provides ingestion, querying, vector search, and adapter layers for constraints, entropy, and feedback.

**Version:** 0.3.3

## Installation

```bash
npm install @harness-engineering/graph
```

**Optional dependencies:** `hnswlib-node` (vector search), `tree-sitter` + `tree-sitter-typescript` (advanced parsing)

## Overview

```typescript
import { GraphStore, CodeIngestor, ContextQL, Assembler } from '@harness-engineering/graph';

const store = new GraphStore();
const ingestor = new CodeIngestor(store);
await ingestor.ingest('./src');

const query = new ContextQL(store);
const result = query.run({ seed: 'src/index.ts', depth: 2 });
```

## Constants

### `VERSION`

```typescript
const VERSION: string; // "0.3.2"
```

### Schema Constants

| Constant                 | Description                               |
| ------------------------ | ----------------------------------------- |
| `NODE_TYPES`             | Array of valid node type strings          |
| `EDGE_TYPES`             | Array of valid edge type strings          |
| `OBSERVABILITY_TYPES`    | Array of observability-related node types |
| `CURRENT_SCHEMA_VERSION` | Current graph schema version number       |

### Zod Schemas

| Schema            | Description                           |
| ----------------- | ------------------------------------- |
| `GraphNodeSchema` | Zod schema for validating graph nodes |
| `GraphEdgeSchema` | Zod schema for validating graph edges |

## Core Types

### `GraphNode`

```typescript
interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  metadata: Record<string, unknown>;
  // ... additional fields
}
```

### `GraphEdge`

```typescript
interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
  metadata: Record<string, unknown>;
  // ... additional fields
}
```

### `NodeType` / `EdgeType`

String literal union types for node and edge classifications.

### `SourceLocation`

File path and line number reference.

### `GraphMetadata`

Metadata about the graph itself (node/edge counts, last updated, schema version).

---

## Store

### `GraphStore`

In-memory graph store backed by LokiJS. Supports adding, querying, and removing nodes and edges.

**Query types:** `NodeQuery`, `EdgeQuery`

### `VectorStore`

Optional vector similarity store using HNSW index. Requires `hnswlib-node`.

**Types:** `VectorSearchResult`

### `saveGraph(store, path)` / `loadGraph(path)`

Serialize/deserialize a graph store to/from disk.

---

## Query

### `ContextQL`

Graph query engine. Takes seed nodes and traversal parameters, returns a subgraph with relevance scores.

```typescript
const cql = new ContextQL(store);
const result = cql.run({
  seed: 'src/server.ts',
  depth: 3,
  types: ['file', 'function'],
});
```

**Types:** `ContextQLParams`, `ContextQLResult`

### `project(result, spec)`

Applies a projection to a query result, filtering fields and nodes.

**Types:** `ProjectionSpec`

---

## Ingest

### `CodeIngestor`

Ingests source code files into the graph. Parses imports, exports, functions, and classes.

### `GitIngestor`

Ingests git history (commits, authors, file changes) into the graph.

**Types:** `GitRunner`

### `TopologicalLinker`

Links nodes in topological order based on dependency relationships.

**Types:** `LinkResult`

### `KnowledgeIngestor`

Ingests markdown documentation and knowledge files.

### `DesignIngestor`

Ingests design documents and links them to code entities.

**Types:** `IngestResult`

---

## Connectors

External system connectors for enriching the knowledge graph.

### `SyncManager`

Manages synchronization state across connectors.

### Connector Implementations

| Class                 | Description                             |
| --------------------- | --------------------------------------- |
| `JiraConnector`       | Syncs Jira issues and links to code     |
| `SlackConnector`      | Syncs Slack conversations and decisions |
| `ConfluenceConnector` | Syncs Confluence pages                  |
| `CIConnector`         | Syncs CI/CD pipeline data               |

### `linkToCode(connector, store)`

Utility to link connector entities to existing code nodes.

**Types:** `GraphConnector`, `ConnectorConfig`, `SyncMetadata`, `HttpClient`

---

## Search

### `FusionLayer`

Combines graph traversal with vector similarity search for hybrid retrieval.

**Types:** `FusionResult`

---

## Entropy Adapters

### `GraphEntropyAdapter`

Adapts the graph for entropy detection (drift, dead code).

**Types:** `GraphDriftData`, `GraphDeadCodeData`, `GraphSnapshotSummary`

### `GraphComplexityAdapter`

Extracts complexity metrics from the graph.

**Types:** `GraphComplexityHotspot`, `GraphComplexityResult`

### `GraphCouplingAdapter`

Analyzes coupling between modules using graph edges.

**Types:** `GraphCouplingFileData`, `GraphCouplingResult`

---

## Context Assembly

### `Assembler`

Assembles context for AI agents by selecting relevant graph nodes within a token budget.

```typescript
const assembler = new Assembler(store, { maxTokens: 8000 });
const context = assembler.assemble({ seed: 'src/api/handler.ts' });
```

**Types:** `AssembledContext`, `GraphBudget`, `GraphFilterResult`, `GraphCoverageReport`

---

## Constraint Adapters

### `GraphConstraintAdapter`

Validates architectural constraints using graph data (layer violations, forbidden dependencies).

**Types:** `GraphDependencyData`, `GraphLayerViolation`

### `DesignConstraintAdapter`

Validates that implementation matches design specifications.

**Types:** `DesignViolation`, `DesignStrictness`

---

## Feedback Adapters

### `GraphFeedbackAdapter`

Provides graph-enhanced data for feedback and review processes (impact analysis, harness checks).

**Types:** `GraphImpactData`, `GraphHarnessCheckData`
