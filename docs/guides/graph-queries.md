# Graph Query Guide

Query the harness knowledge graph to understand code structure, trace dependencies, analyze impact, and find relevant context. This guide covers ContextQL (the BFS-based traversal engine), FusionLayer search, natural language queries, and all MCP tools that expose graph operations.

## Prerequisites

A knowledge graph must exist before you can query it. Run `harness scan` to build or refresh the graph:

```bash
harness scan
```

This populates `.harness/graph/` with nodes (files, functions, classes, modules, etc.) and edges (imports, calls, contains, co-changes, etc.) extracted from your codebase and git history.

## ContextQL overview

ContextQL is a BFS-based graph traversal engine. You give it one or more root nodes and it walks outward through edges, collecting connected nodes up to a configurable depth. It supports type filtering, edge filtering, bidirectional traversal, and automatic pruning of observability noise.

### How traversal works

1. **Seed** -- root nodes are added to a BFS queue at depth 0
2. **Expand** -- for each node in the queue, gather outbound edges (and inbound edges if `bidirectional` is true)
3. **Filter** -- skip edges not in `includeEdges`; skip nodes not in `includeTypes` or in `excludeTypes`; prune observability types (`span`, `metric`, `log`) by default
4. **Collect** -- add passing nodes and edges to the result set
5. **Cross-link** -- after BFS completes, add edges between any two result nodes that are directly connected (even if the edge was not traversed during BFS)
6. **Return** -- nodes, edges, and traversal statistics

### Query parameters

The `ContextQLParams` interface defines all available options:

```typescript
interface ContextQLParams {
  rootNodeIds: string[]; // Node IDs to start traversal from (required)
  maxDepth?: number; // Maximum BFS depth (default: 3)
  includeTypes?: NodeType[]; // Only include nodes of these types
  excludeTypes?: NodeType[]; // Exclude nodes of these types
  includeEdges?: EdgeType[]; // Only traverse edges of these types
  bidirectional?: boolean; // Traverse inbound edges too (default: false)
  pruneObservability?: boolean; // Prune span/metric/log nodes (default: true)
}
```

### Result shape

Every ContextQL query returns:

```typescript
interface ContextQLResult {
  nodes: GraphNode[]; // All nodes found by traversal
  edges: GraphEdge[]; // All edges connecting result nodes
  stats: {
    totalTraversed: number; // Nodes visited during BFS
    totalReturned: number; // Nodes in the result set
    pruned: number; // Nodes filtered out
    depthReached: number; // Deepest BFS level reached
  };
}
```

### Programmatic usage

```typescript
import { GraphStore, ContextQL } from '@harness-engineering/graph';

const store = new GraphStore();
await store.load('.harness/graph');

const cql = new ContextQL(store);

// Basic query: find everything within 2 hops of a file
const result = cql.execute({
  rootNodeIds: ['file:src/services/auth.ts'],
  maxDepth: 2,
});

// Filtered query: only follow import edges, only return file nodes
const imports = cql.execute({
  rootNodeIds: ['file:src/services/auth.ts'],
  maxDepth: 5,
  includeEdges: ['imports'],
  includeTypes: ['file'],
});

// Bidirectional: find what depends ON this file (inbound) and what it depends on (outbound)
const dependents = cql.execute({
  rootNodeIds: ['file:src/services/auth.ts'],
  maxDepth: 1,
  bidirectional: true,
});
```

### Projection

Use the `project` utility to select specific fields from query results, reducing payload size:

```typescript
import { project } from '@harness-engineering/graph';

const result = cql.execute({ rootNodeIds: ['file:src/index.ts'], maxDepth: 2 });
const slim = project(result.nodes, { fields: ['id', 'type', 'name', 'path'] });
```

## Node types reference

28 node types organized by category. Node IDs follow the pattern `type:identifier` (e.g., `file:src/index.ts`, `class:UserService`).

### Code nodes

| Type         | Description                                         |
| ------------ | --------------------------------------------------- |
| `repository` | Root node representing the entire repository        |
| `module`     | A logical module (typically a directory or package) |
| `file`       | A source file                                       |
| `class`      | A class declaration                                 |
| `interface`  | A TypeScript/Java interface declaration             |
| `function`   | A standalone function declaration                   |
| `method`     | A method within a class                             |
| `variable`   | An exported variable or constant                    |

### Knowledge nodes

| Type           | Description                                             |
| -------------- | ------------------------------------------------------- |
| `adr`          | Architecture Decision Record                            |
| `decision`     | A recorded architectural or design decision             |
| `learning`     | A captured lesson or insight                            |
| `failure`      | A documented failure or incident                        |
| `issue`        | An issue from an external tracker (Jira, GitHub Issues) |
| `document`     | A documentation page (Confluence, markdown)             |
| `skill`        | A harness skill definition                              |
| `conversation` | A conversation thread (Slack, etc.)                     |

### VCS nodes

| Type                | Description                           |
| ------------------- | ------------------------------------- |
| `commit`            | A git commit                          |
| `build`             | A CI build or workflow run            |
| `test_result`       | A test execution result               |
| `execution_outcome` | An outcome record from task execution |

### Observability nodes

| Type     | Description                                                 |
| -------- | ----------------------------------------------------------- |
| `span`   | A distributed tracing span (pruned by default in ContextQL) |
| `metric` | A metrics data point (pruned by default in ContextQL)       |
| `log`    | A log entry (pruned by default in ContextQL)                |

Observability nodes are pruned by default because they add noise to most queries. Set `pruneObservability: false` to include them.

### Structural nodes

| Type         | Description                                             |
| ------------ | ------------------------------------------------------- |
| `layer`      | An architectural layer (e.g., "api", "domain", "infra") |
| `pattern`    | A detected code pattern (e.g., "Repository", "Factory") |
| `constraint` | An architectural constraint or rule                     |
| `violation`  | A detected constraint violation                         |

### Design nodes

| Type                | Description                                 |
| ------------------- | ------------------------------------------- |
| `design_token`      | A design token (color, spacing, typography) |
| `aesthetic_intent`  | A declared design intent or goal            |
| `design_constraint` | A design system constraint                  |

### Traceability and cache nodes

| Type             | Description                                         |
| ---------------- | --------------------------------------------------- |
| `requirement`    | A requirement extracted from a spec or feature file |
| `packed_summary` | A cached packed summary of a node's context         |

## Edge types reference

26 edge types organized by category. Edges carry optional `confidence` scores (0-1) used by FusionLayer for ranking.

### Code edges

| Type         | Direction        | Description                                        |
| ------------ | ---------------- | -------------------------------------------------- |
| `contains`   | parent -> child  | Module contains file, file contains class/function |
| `imports`    | source -> target | File imports another file or module                |
| `calls`      | caller -> callee | Function/method calls another function/method      |
| `implements` | class -> iface   | Class implements an interface                      |
| `inherits`   | child -> parent  | Class extends another class                        |
| `references` | source -> target | Generic reference (type usage, variable access)    |

### Knowledge edges

| Type          | Direction          | Description                                  |
| ------------- | ------------------ | -------------------------------------------- |
| `applies_to`  | knowledge -> code  | ADR/decision applies to a code entity        |
| `caused_by`   | failure -> code    | Failure was caused by a code entity          |
| `resolved_by` | issue -> code      | Issue was resolved by a code change          |
| `documents`   | doc -> code        | Document describes a code entity             |
| `violates`    | code -> constraint | Code entity violates a constraint            |
| `specifies`   | constraint -> code | Constraint specifies rules for a code entity |
| `decided`     | decision -> code   | Decision was made about a code entity        |

### VCS edges

| Type              | Direction            | Description                                      |
| ----------------- | -------------------- | ------------------------------------------------ |
| `co_changes_with` | file <-> file        | Files that frequently change together in commits |
| `triggered_by`    | build -> commit      | Build was triggered by a commit                  |
| `failed_in`       | test_result -> build | Test failed in a specific build                  |
| `outcome_of`      | outcome -> task      | Execution outcome of a task                      |

### Execution edges

| Type          | Direction      | Description                                |
| ------------- | -------------- | ------------------------------------------ |
| `executed_by` | code -> span   | Code entity was executed in a tracing span |
| `measured_by` | code -> metric | Code entity is measured by a metric        |

### Design edges

| Type               | Direction               | Description                                 |
| ------------------ | ----------------------- | ------------------------------------------- |
| `uses_token`       | component -> token      | Component uses a design token               |
| `declares_intent`  | component -> intent     | Component declares a design intent          |
| `violates_design`  | component -> constraint | Component violates a design constraint      |
| `platform_binding` | token -> platform       | Token is bound to a platform-specific value |

### Traceability edges

| Type          | Direction           | Description                            |
| ------------- | ------------------- | -------------------------------------- |
| `requires`    | requirement -> file | Requirement is implemented by a file   |
| `verified_by` | requirement -> test | Requirement is verified by a test      |
| `tested_by`   | code -> test_result | Code entity is tested by a test result |

### Cache edges

| Type     | Direction       | Description                              |
| -------- | --------------- | ---------------------------------------- |
| `caches` | summary -> node | Packed summary caches context for a node |

## Common query patterns

### Find all dependencies of a file

Trace outbound `imports` edges to see what a file depends on:

```typescript
const deps = cql.execute({
  rootNodeIds: ['file:src/services/user-service.ts'],
  maxDepth: 1,
  includeEdges: ['imports'],
  includeTypes: ['file'],
});
// deps.nodes = all files directly imported by user-service.ts
```

Increase `maxDepth` to find transitive dependencies:

```typescript
const transitiveDeps = cql.execute({
  rootNodeIds: ['file:src/services/user-service.ts'],
  maxDepth: 5,
  includeEdges: ['imports'],
  includeTypes: ['file'],
});
```

### Find what depends on a file (reverse dependencies)

Use bidirectional traversal and filter for inbound `imports` edges:

```typescript
const dependents = cql.execute({
  rootNodeIds: ['file:src/services/user-service.ts'],
  maxDepth: 1,
  bidirectional: true,
  includeEdges: ['imports'],
  includeTypes: ['file'],
});
// Includes both what user-service imports AND what imports user-service
```

### Trace requirement coverage

Use the `queryTraceability` function to check which requirements have code and test coverage:

```typescript
import { queryTraceability } from '@harness-engineering/graph';

const results = queryTraceability(store, { featureName: 'authentication' });

for (const result of results) {
  console.log(`Feature: ${result.featureName}`);
  console.log(`Coverage: ${result.summary.coveragePercent}%`);
  for (const req of result.requirements) {
    console.log(`  ${req.requirementName}: ${req.status}`);
    // status is 'full' | 'code-only' | 'test-only' | 'none'
  }
}
```

Traceability follows `requires` edges (requirement -> code files) and `verified_by` edges (requirement -> test files).

### Find co-changed files

Files that frequently change together in commits are connected by `co_changes_with` edges:

```typescript
const coChanged = cql.execute({
  rootNodeIds: ['file:src/services/user-service.ts'],
  maxDepth: 1,
  includeEdges: ['co_changes_with'],
  includeTypes: ['file'],
});
// coChanged.nodes = files that historically change alongside user-service.ts
```

### Explore module structure

Start from a module node and follow `contains` edges to see its contents:

```typescript
const moduleContents = cql.execute({
  rootNodeIds: ['module:src/services'],
  maxDepth: 2,
  includeEdges: ['contains'],
  includeTypes: ['file', 'class', 'function'],
});
```

### Find all implementations of an interface

```typescript
const implementations = cql.execute({
  rootNodeIds: ['interface:GraphConnector'],
  maxDepth: 1,
  bidirectional: true,
  includeEdges: ['implements'],
  includeTypes: ['class'],
});
```

### Impact analysis

Bidirectional traversal from a node shows everything it touches and everything that touches it. The `groupNodesByImpact` helper categorizes results:

```typescript
import { ContextQL, groupNodesByImpact } from '@harness-engineering/graph';

const cql = new ContextQL(store);
const result = cql.execute({
  rootNodeIds: ['file:src/services/auth.ts'],
  bidirectional: true,
  maxDepth: 3,
});

const impact = groupNodesByImpact(result.nodes, 'file:src/services/auth.ts');
console.log(`Tests affected: ${impact.tests.length}`);
console.log(`Docs affected: ${impact.docs.length}`);
console.log(`Code affected: ${impact.code.length}`);
```

Impact categories:

- **tests** -- `test_result` nodes
- **docs** -- `adr`, `decision`, `document`, `learning` nodes
- **code** -- `file`, `module`, `class`, `interface`, `function`, `method`, `variable` nodes
- **other** -- everything else

## Blast radius simulation

The `CascadeSimulator` performs probability-weighted BFS to model cascading failure propagation. Unlike standard ContextQL traversal, it assigns failure probabilities to each edge and stops when cumulative probability drops below a floor.

```typescript
import { CascadeSimulator } from '@harness-engineering/graph';

const simulator = new CascadeSimulator(store);
const result = simulator.simulate('file:src/core/auth.ts', {
  probabilityFloor: 0.05, // stop when probability < 5%
  maxDepth: 10,
});

// result.layers: cascade layers ordered by distance from source
// result.flatSummary: all affected nodes sorted by risk (probability desc)
// result.summary: aggregate statistics
```

## FusionLayer search

FusionLayer combines keyword matching and optional semantic similarity into a single ranked result set. It does not traverse edges -- it scores every node in the graph against your query.

### How scoring works

Each node receives two scores:

1. **Keyword score** (weight: 0.6 by default) -- based on how well query keywords match the node's name, path, and metadata:
   - Exact name match: 1.0
   - Name contains keyword: 0.7
   - Path contains keyword: 0.5
   - Metadata value contains keyword: 0.3

2. **Semantic score** (weight: 0.4 by default) -- cosine similarity between the query embedding and the node's stored embedding vector. Only active when embeddings are available.

The final score is `keywordWeight * keywordScore + semanticWeight * semanticScore`. When no embeddings are available, keyword weight automatically becomes 1.0.

### Usage

```typescript
import { GraphStore, FusionLayer, VectorStore } from '@harness-engineering/graph';

const store = new GraphStore();
await store.load('.harness/graph');

// Keyword-only search (no VectorStore)
const fusion = new FusionLayer(store);
const results = fusion.search('authentication handler', 10);

// Hybrid search (keyword + semantic)
const vectorStore = new VectorStore(384); // dimension must match your embeddings
const hybridFusion = new FusionLayer(store, vectorStore, 0.6, 0.4);
const hybridResults = hybridFusion.search('authentication handler', 10, queryEmbedding);
```

Each result includes both signal scores for transparency:

```typescript
interface FusionResult {
  nodeId: string;
  node: GraphNode;
  score: number; // combined score
  signals: {
    keyword: number; // keyword-only score
    semantic: number; // semantic-only score
  };
}
```

### Keyword extraction

FusionLayer tokenizes queries by splitting on whitespace and punctuation, lowercasing, filtering tokens shorter than 2 characters, and removing common English stop words. Duplicate tokens are deduplicated.

## MCP tools for graph queries

The harness MCP server exposes seven graph tools. These are the primary way AI agents interact with the knowledge graph.

### `query_graph` -- ContextQL traversal

The direct MCP interface to ContextQL. Use this when you know the node IDs and want precise graph traversal.

**Parameters:**

| Parameter            | Type     | Required | Default    | Description                       |
| -------------------- | -------- | -------- | ---------- | --------------------------------- |
| `path`               | string   | yes      |            | Path to project root              |
| `rootNodeIds`        | string[] | yes      |            | Node IDs to start traversal from  |
| `maxDepth`           | number   | no       | 3          | Maximum BFS depth                 |
| `includeTypes`       | string[] | no       |            | Only include these node types     |
| `excludeTypes`       | string[] | no       |            | Exclude these node types          |
| `includeEdges`       | string[] | no       |            | Only traverse these edge types    |
| `bidirectional`      | boolean  | no       | false      | Traverse edges in both directions |
| `pruneObservability` | boolean  | no       | true       | Prune span/metric/log nodes       |
| `mode`               | string   | no       | "detailed" | `summary` or `detailed`           |
| `offset`             | number   | no       | 0          | Pagination offset                 |
| `limit`              | number   | no       | 50         | Max nodes per page                |

**Summary mode** returns node/edge counts by type and traversal stats. **Detailed mode** returns full node and edge arrays, paginated by node connectivity (highest edge count first).

**Example:**

```json
{
  "path": "/path/to/project",
  "rootNodeIds": ["file:src/services/auth.ts"],
  "maxDepth": 2,
  "includeEdges": ["imports", "calls"],
  "includeTypes": ["file", "function"]
}
```

### `search_similar` -- FusionLayer search

Find nodes matching a text query using keyword and optional semantic search.

**Parameters:**

| Parameter | Type   | Required | Default    | Description             |
| --------- | ------ | -------- | ---------- | ----------------------- |
| `path`    | string | yes      |            | Path to project root    |
| `query`   | string | yes      |            | Search query string     |
| `topK`    | number | no       | 10         | Max results to return   |
| `mode`    | string | no       | "detailed" | `summary` or `detailed` |

**Summary mode** returns the top 5 results with node IDs and scores only. **Detailed mode** returns the top K results with full node metadata and signal breakdowns.

**Example:**

```json
{
  "path": "/path/to/project",
  "query": "authentication middleware",
  "topK": 5
}
```

### `find_context_for` -- intent-based context assembly

Combines FusionLayer search with ContextQL expansion. Searches for relevant nodes, then expands context around each top result within a token budget.

**Parameters:**

| Parameter     | Type   | Required | Default | Description                          |
| ------------- | ------ | -------- | ------- | ------------------------------------ |
| `path`        | string | yes      |         | Path to project root                 |
| `intent`      | string | yes      |         | What context is needed for           |
| `tokenBudget` | number | no       | 4000    | Approximate token budget for results |

The tool searches for the top 10 nodes matching the intent, then runs ContextQL with `maxDepth: 2` around each result. It stops adding context blocks when the character budget (tokenBudget \* 4) is reached.

**Example:**

```json
{
  "path": "/path/to/project",
  "intent": "fix the authentication timeout bug",
  "tokenBudget": 8000
}
```

### `get_relationships` -- node neighborhood

Get direct relationships for a specific node with configurable direction and depth.

**Parameters:**

| Parameter   | Type   | Required | Default    | Description                      |
| ----------- | ------ | -------- | ---------- | -------------------------------- |
| `path`      | string | yes      |            | Path to project root             |
| `nodeId`    | string | yes      |            | Node ID to inspect               |
| `direction` | string | no       | "both"     | `outbound`, `inbound`, or `both` |
| `depth`     | number | no       | 1          | Traversal depth                  |
| `mode`      | string | no       | "detailed" | `summary` or `detailed`          |
| `offset`    | number | no       | 0          | Pagination offset                |
| `limit`     | number | no       | 50         | Max edges per page               |

**Summary mode** returns neighbor counts grouped by node type. **Detailed mode** returns full node and edge arrays, paginated by edge confidence (highest first).

**Example:**

```json
{
  "path": "/path/to/project",
  "nodeId": "class:UserService",
  "direction": "inbound",
  "depth": 1
}
```

### `get_impact` -- change impact analysis

Analyze the impact of changing a node or file. Returns affected entities grouped into tests, docs, code, and other.

**Parameters:**

| Parameter  | Type   | Required | Default    | Description                     |
| ---------- | ------ | -------- | ---------- | ------------------------------- |
| `path`     | string | yes      |            | Path to project root            |
| `nodeId`   | string | no       |            | Node ID to analyze              |
| `filePath` | string | no       |            | File path (relative) to analyze |
| `mode`     | string | no       | "detailed" | `summary` or `detailed`         |

Provide either `nodeId` or `filePath` (not both). When `filePath` is given, the tool resolves it to a file node ID. Uses bidirectional ContextQL traversal at `maxDepth: 3`.

**Summary mode** returns impact counts by category and the top 2 highest-risk items per category. **Detailed mode** returns the full impact tree with all affected nodes and edges.

**Example:**

```json
{
  "path": "/path/to/project",
  "filePath": "src/services/auth.ts",
  "mode": "summary"
}
```

### `compute_blast_radius` -- cascading failure simulation

Simulate probability-weighted failure propagation from a source node.

**Parameters:**

| Parameter          | Type   | Required | Default   | Description                            |
| ------------------ | ------ | -------- | --------- | -------------------------------------- |
| `path`             | string | yes      |           | Path to project root                   |
| `file`             | string | no       |           | File path (relative) to simulate for   |
| `nodeId`           | string | no       |           | Node ID to simulate for                |
| `probabilityFloor` | number | no       | 0.05      | Min cumulative probability to continue |
| `maxDepth`         | number | no       | 10        | Maximum BFS depth                      |
| `mode`             | string | no       | "compact" | `compact` or `detailed`                |

Provide either `nodeId` or `file`. The `probabilityFloor` must be between 0 and 1 (exclusive). `maxDepth` must be between 1 and 100.

**Compact mode** returns a summary and the top 10 highest-risk nodes. **Detailed mode** returns the full layered cascade chain showing how failure propagates through the graph.

**Example:**

```json
{
  "path": "/path/to/project",
  "file": "src/core/auth.ts",
  "probabilityFloor": 0.1,
  "mode": "detailed"
}
```

### `detect_anomalies` -- structural anomaly detection

Detect statistical outliers across code metrics and topological single points of failure.

**Parameters:**

| Parameter   | Type     | Required | Default | Description                             |
| ----------- | -------- | -------- | ------- | --------------------------------------- |
| `path`      | string   | yes      |         | Path to project root                    |
| `threshold` | number   | no       | 2.0     | Z-score threshold for outlier detection |
| `metrics`   | string[] | no       | all     | Metrics to analyze                      |
| `offset`    | number   | no       | 0       | Pagination offset                       |
| `limit`     | number   | no       | 30      | Max anomaly entries per page            |

Default metrics: `cyclomaticComplexity`, `fanIn`, `fanOut`, `hotspotScore`, `transitiveDepth`. Results are sorted by Z-score descending and paginated.

**Example:**

```json
{
  "path": "/path/to/project",
  "threshold": 1.5,
  "metrics": ["fanIn", "fanOut"]
}
```

### `ask_graph` -- natural language queries

Ask questions about the codebase in plain English. The NLQ engine classifies intent, extracts entities, resolves them to graph nodes, executes the appropriate graph operation, and returns a human-readable summary.

**Parameters:**

| Parameter  | Type   | Required | Description               |
| ---------- | ------ | -------- | ------------------------- |
| `path`     | string | yes      | Path to project root      |
| `question` | string | yes      | Natural language question |

**Example:**

```json
{
  "path": "/path/to/project",
  "question": "what breaks if I change UserService?"
}
```

## Natural language queries

The `ask_graph` tool translates natural language into graph operations through a four-stage pipeline.

### Stage 1: Intent classification

A scored multi-signal classifier maps questions to one of five intents:

| Intent          | Trigger phrases                                          | Graph operation                             |
| --------------- | -------------------------------------------------------- | ------------------------------------------- |
| `impact`        | "what breaks if I change...", "blast radius of..."       | Bidirectional ContextQL or CascadeSimulator |
| `find`          | "where is...", "find all...", "show me..."               | FusionLayer search                          |
| `relationships` | "what calls...", "what imports...", "what depends on..." | ContextQL depth-1 bidirectional             |
| `explain`       | "what is...", "describe...", "how does..."               | FusionLayer + ContextQL expansion           |
| `anomaly`       | "what looks wrong?", "find problems", "code smells"      | GraphAnomalyAdapter                         |

The classifier combines three signals with weighted scores:

- **Verb patterns** (weight 0.45) -- regex patterns matching question structure
- **Keywords** (weight 0.35) -- presence of intent-specific keywords
- **Question words** (weight 0.20) -- the first word of the question (what, where, how)

Questions with confidence below 0.3 return suggestions for rephrasing.

### Stage 2: Entity extraction

The `EntityExtractor` pulls candidate entity mentions from the question using four strategies in priority order:

1. **Quoted strings** -- `"UserService"` or `'auth.ts'`
2. **PascalCase/camelCase tokens** -- `UserService`, `handleAuth`
3. **File paths** -- `src/services/auth.ts`
4. **Remaining significant nouns** -- after removing stop words and intent keywords

### Stage 3: Entity resolution

The `EntityResolver` maps extracted text to actual graph nodes using a cascade:

1. **Exact match** -- direct node ID lookup
2. **Fusion search** -- FusionLayer similarity search
3. **Path match** -- file path matching

Each resolved entity includes a confidence score and the method that matched.

### Stage 4: Operation execution

Based on the classified intent and resolved entities:

- **impact** -- if the question mentions "blast radius" or "cascade", runs `CascadeSimulator`; otherwise runs bidirectional ContextQL at depth 3 and groups results with `groupNodesByImpact`
- **find** -- runs FusionLayer search for top 10 results
- **relationships** -- runs ContextQL at depth 1 with bidirectional traversal from the first resolved entity
- **explain** -- runs FusionLayer search, then expands ContextQL context around top results
- **anomaly** -- runs `GraphAnomalyAdapter.detect()` for structural anomaly detection

### Example questions

```
"what breaks if I change UserService?"
  -> intent: impact, entity: UserService -> bidirectional traversal

"where is the authentication middleware?"
  -> intent: find -> FusionLayer search for "authentication middleware"

"what calls GraphStore?"
  -> intent: relationships, entity: GraphStore -> depth-1 bidirectional

"what is ContextQL?"
  -> intent: explain, entity: ContextQL -> search + context expansion

"what looks wrong in the codebase?"
  -> intent: anomaly -> structural anomaly detection
```

### Returned shape

```typescript
interface AskGraphResult {
  intent: Intent; // classified intent
  intentConfidence: number; // 0-1 confidence score
  entities: ResolvedEntity[]; // resolved graph entities
  summary: string; // human-readable answer
  data: unknown; // raw graph result
  suggestions?: string[]; // rephrasing suggestions (low confidence only)
}
```

## Choosing the right tool

| Goal                                     | Tool                   |
| ---------------------------------------- | ---------------------- |
| Ask a question in plain English          | `ask_graph`            |
| Traverse from known node IDs             | `query_graph`          |
| Search by keyword or concept             | `search_similar`       |
| Get assembled context for a task         | `find_context_for`     |
| Inspect a single node's connections      | `get_relationships`    |
| Understand what a change affects         | `get_impact`           |
| Model cascading failure risk             | `compute_blast_radius` |
| Find code smells and structural problems | `detect_anomalies`     |

Start with `ask_graph` for exploratory questions. Switch to `query_graph` when you need precise control over traversal parameters, or `search_similar` when you want ranked search results.

---

_Last Updated: 2026-04-18_
