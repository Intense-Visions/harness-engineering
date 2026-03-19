# @harness-engineering/graph

Unified Knowledge Graph for AI-powered context assembly. Ingests code, git history, knowledge artifacts, and external services into an in-memory graph, then queries and searches it to build precisely-scoped context for AI agents.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Ingest Layer                    │
│  CodeIngestor · GitIngestor · KnowledgeIngestor  │
│  TopologicalLinker · Connectors (Jira/Slack/...) │
└──────────────────┬───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│               Store (LokiJS)                     │
│         GraphStore · VectorStore                 │
│         Serializer (save/load)                   │
└──────────┬──────────────────┬────────────────────┘
           ▼                  ▼
┌────────────────┐  ┌─────────────────┐
│  Query Layer   │  │  Search Layer   │
│   ContextQL    │  │  FusionLayer    │
│   Projection   │  │  (keyword +     │
│                │  │   semantic)     │
└───────┬────────┘  └────────┬────────┘
        └────────┬───────────┘
                 ▼
┌──────────────────────────────────────────────────┐
│              Context Assembly                    │
│  Assembler · Budget · Phase-aware filtering      │
└──────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────┐
│                  Adapters                         │
│  GraphEntropyAdapter · GraphConstraintAdapter    │
│  GraphFeedbackAdapter                            │
└──────────────────────────────────────────────────┘
```

## Quick Start

```ts
import {
  GraphStore,
  CodeIngestor,
  ContextQL,
  FusionLayer,
  VectorStore,
} from '@harness-engineering/graph';

// 1. Create the store
const store = new GraphStore();

// 2. Ingest code
const ingestor = new CodeIngestor(store);
const result = await ingestor.ingest('/path/to/project');
console.log(`Added ${result.nodesAdded} nodes, ${result.edgesAdded} edges`);

// 3. Query the graph with ContextQL
const cql = new ContextQL(store);
const context = cql.execute({
  rootNodeIds: ['file:src/index.ts'],
  maxDepth: 3,
  includeTypes: ['file', 'function', 'class'],
});

// 4. Search with FusionLayer (keyword + optional semantic)
const vectorStore = new VectorStore();
const fusion = new FusionLayer(store, vectorStore);
const results = fusion.search('authentication handler', { topK: 10 });
```

## Key Classes

| Class                     | Description                                                                     |
| ------------------------- | ------------------------------------------------------------------------------- |
| `GraphStore`              | In-memory graph backed by LokiJS with indexed node/edge collections             |
| `VectorStore`             | Optional vector index for semantic similarity search (hnswlib)                  |
| `ContextQL`               | BFS-based graph traversal engine with type filtering and observability pruning  |
| `project`                 | Projection utility to select specific fields from query results                 |
| `CodeIngestor`            | Parses TypeScript/JavaScript files into file, class, function, and method nodes |
| `GitIngestor`             | Extracts commit history and co-change relationships from git                    |
| `KnowledgeIngestor`       | Ingests ADRs, learnings, and markdown knowledge artifacts                       |
| `TopologicalLinker`       | Creates structural edges (imports, calls, references) between code nodes        |
| `FusionLayer`             | Hybrid search combining keyword matching and semantic similarity scores         |
| `Assembler`               | Phase-aware context assembly with token budgets and coverage reports            |
| `SyncManager`             | Orchestrates connector syncs with incremental update tracking                   |
| `GraphEntropyAdapter`     | Detects graph drift and dead code for entropy monitoring                        |
| `GraphConstraintAdapter`  | Validates dependency rules and layer boundary violations                        |
| `GraphFeedbackAdapter`    | Computes impact analysis and harness check data from graph state                |
| `saveGraph` / `loadGraph` | Serializes and deserializes the graph store to/from disk                        |

## Node Types

24 node types organized by category:

| Category          | Types                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------- |
| **Code**          | `repository`, `module`, `file`, `class`, `interface`, `function`, `method`, `variable` |
| **Knowledge**     | `adr`, `decision`, `learning`, `failure`, `issue`, `document`, `skill`, `conversation` |
| **VCS**           | `commit`, `build`, `test_result`                                                       |
| **Observability** | `span`, `metric`, `log`                                                                |
| **Structural**    | `layer`, `pattern`, `constraint`, `violation`                                          |

Observability types (`span`, `metric`, `log`) are pruned by default in ContextQL queries to reduce noise.

## Edge Types

17 edge types organized by category:

| Category      | Types                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------- |
| **Code**      | `contains`, `imports`, `calls`, `implements`, `inherits`, `references`                    |
| **Knowledge** | `applies_to`, `caused_by`, `resolved_by`, `documents`, `violates`, `specifies`, `decided` |
| **VCS**       | `co_changes_with`, `triggered_by`, `failed_in`                                            |
| **Execution** | `executed_by`, `measured_by`                                                              |

Edges carry an optional `confidence` score (0-1) used by the FusionLayer for ranking.

## Connectors

External service connectors implement the `GraphConnector` interface and sync data into the graph as knowledge nodes.

| Connector             | Source         | Description                                                                  |
| --------------------- | -------------- | ---------------------------------------------------------------------------- |
| `JiraConnector`       | Jira Cloud     | Ingests issues as `issue` nodes with status, priority, and assignee metadata |
| `SlackConnector`      | Slack          | Ingests channel messages as `conversation` nodes linked to referenced code   |
| `ConfluenceConnector` | Confluence     | Ingests pages as `document` nodes with body content                          |
| `CIConnector`         | GitHub Actions | Ingests workflow runs as `build` nodes with status and conclusion            |

All connectors accept an optional `HttpClient` for custom fetch implementations and testability.

Use `SyncManager` to orchestrate multiple connectors with incremental sync tracking:

```ts
import { SyncManager, JiraConnector } from '@harness-engineering/graph';

const sync = new SyncManager(store);
sync.register(new JiraConnector());

await sync.syncAll({
  baseUrl: 'https://your-org.atlassian.net',
  auth: 'Bearer <token>',
  project: 'PROJ',
});
```

## Serialization

```ts
import { saveGraph, loadGraph, GraphStore } from '@harness-engineering/graph';

// Persist to disk
await saveGraph(store, '/path/to/graph.json');

// Restore from disk
const restored = new GraphStore();
await loadGraph(restored, '/path/to/graph.json');
```

## Dependencies

| Package     | Purpose                                                   |
| ----------- | --------------------------------------------------------- |
| `lokijs`    | In-memory document database backing the graph store       |
| `minimatch` | Glob pattern matching for file filtering during ingestion |
| `zod`       | Runtime schema validation for graph nodes and edges       |

Optional peer dependencies:

| Package                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `hnswlib-node`           | HNSW vector index for semantic search in VectorStore          |
| `tree-sitter`            | AST-based code parsing (future upgrade path for CodeIngestor) |
| `tree-sitter-typescript` | TypeScript grammar for tree-sitter                            |

## License

See the root [LICENSE](../../LICENSE) file.
