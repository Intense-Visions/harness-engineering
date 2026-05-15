# @harness-engineering/graph

Knowledge graph for codebase relationships, context assembly, and entropy detection. Provides ingestion, querying, vector search, and adapter layers for constraints, entropy, and feedback.

**Version:** 0.9.0

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
const result = query.execute({ rootNodeIds: ['file:src/index.ts'], maxDepth: 2 });
```

## Constants

### `VERSION`

```typescript
const VERSION: string; // "0.4.3"
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

### `PackedSummaryCache`

```typescript
class PackedSummaryCache {
  constructor(store: GraphStore, ttlMs?: number);
  get(intent: string): PackedEnvelope | null;
  set(intent: string, envelope: PackedEnvelope, sourceNodeIds: string[]): void;
  invalidate(intent: string): void;
}
```

Reads/writes PackedSummary nodes in the GraphStore. Validates entries via TTL and source node freshness — if any source node has been updated since the cache entry was written, the entry is stale.

### `normalizeIntent(intent)`

```typescript
function normalizeIntent(intent: string): string;
```

Normalizes an intent string for deterministic cache keying.

**Types:** `CacheableEnvelope`

---

## Query

### `ContextQL`

Graph query engine. Takes seed nodes and traversal parameters, returns a subgraph with relevance scores.

```typescript
const cql = new ContextQL(store);
const result = cql.execute({
  rootNodeIds: ['file:src/server.ts'],
  maxDepth: 3,
  includeTypes: ['file', 'function'],
});
```

**Types:** `ContextQLParams`, `ContextQLResult`

### `project(result, spec)`

Applies a projection to a query result, filtering fields and nodes.

**Types:** `ProjectionSpec`

### `queryTraceability(store, options?)`

Queries the graph for requirement-to-code traceability. Groups requirement nodes by spec file, traces `requires` and `verified_by` edges to code and test files, and computes coverage status per requirement.

```typescript
const results = queryTraceability(store, { featureName: 'auth' });
// results[0].summary.coveragePercent → 80
```

- `store: GraphStore` — graph store containing ingested requirements
- `options?: TraceabilityOptions` — optional filter by `specPath` or `featureName`
- Returns `TraceabilityResult[]` grouped by spec file

**Types:** `TraceabilityResult`, `TraceabilityOptions`, `RequirementCoverage`, `TracedFile`

### `groupNodesByImpact(nodes, excludeId?)`

Groups graph nodes into impact categories (tests, docs, code, other), excluding the root node. Shared by the NLQ orchestrator and the MCP `get_impact` handler.

```typescript
const groups = groupNodesByImpact(result.nodes, 'file:src/index.ts');
// groups.code, groups.tests, groups.docs, groups.other
```

**Types:** `ImpactGroups`, `NodeCategory`

### `classifyNodeCategory(node)`

Classifies a single graph node into an impact category: `'tests'`, `'docs'`, `'code'`, or `'other'`.

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

### `RequirementIngestor`

Scans a specs directory for `<feature>/proposal.md` files, extracts numbered requirements from recognized sections (Observable Truths, Success Criteria, Acceptance Criteria), and creates requirement nodes with convention-based edges to code and test files.

```typescript
const ingestor = new RequirementIngestor(store);
const result = await ingestor.ingestSpecs('./specs');
```

- `ingestSpecs(specsDir: string): Promise<IngestResult>` — parse spec files and ingest requirement nodes
- Creates `specifies` edges from requirements to their spec document
- Links requirements to code via path-pattern and keyword-overlap conventions
- Detects EARS patterns (ubiquitous, event-driven, state-driven, optional, unwanted) in requirement text

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

### `GraphAnomalyAdapter`

Detects graph anomalies using z-score statistical outlier analysis and Tarjan's algorithm for articulation points. Combines complexity, coupling, and fan-in/fan-out metrics to surface nodes that are statistically unusual or structurally critical.

```typescript
const adapter = new GraphAnomalyAdapter(store);
const report = adapter.detect({ threshold: 2.0, metrics: ['fanIn', 'hotspotScore'] });
// report.statisticalOutliers, report.articulationPoints, report.overlapping
```

- `detect(options?: AnomalyDetectionOptions): AnomalyReport` — run full anomaly detection
- Default metrics: `cyclomaticComplexity`, `fanIn`, `fanOut`, `hotspotScore`, `transitiveDepth`
- Default z-score threshold: `2.0`

**Types:** `AnomalyDetectionOptions`, `StatisticalOutlier`, `ArticulationPoint`, `AnomalyReport`

---

## Context Assembly

### `Assembler`

Assembles context for AI agents by selecting relevant graph nodes within a token budget.

```typescript
const assembler = new Assembler(store);
const context = assembler.assemble({ rootNodeIds: ['file:src/api/handler.ts'], maxDepth: 3 });
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

---

## Independence

### `TaskIndependenceAnalyzer`

Analyzes whether parallel tasks can run independently by detecting file-level and transitive dependency overlaps. Uses `ContextQL` graph expansion when a store is provided, falls back to file-only comparison otherwise.

```typescript
const analyzer = new TaskIndependenceAnalyzer(store);
const result = analyzer.analyze({
  tasks: [
    { id: 'task-a', files: ['src/auth.ts'] },
    { id: 'task-b', files: ['src/api.ts'] },
  ],
  depth: 2,
});
// result.verdict, result.pairs, result.groups
```

- `constructor(store?: GraphStore)` — store is optional; without it, analysis is file-only
- `analyze(params: IndependenceCheckParams): IndependenceResult` — run pairwise independence check
- Groups non-independent tasks via union-find for parallel scheduling

**Types:** `TaskDefinition`, `IndependenceCheckParams`, `OverlapDetail`, `PairResult`, `IndependenceResult`

### `ConflictPredictor`

Extends `TaskIndependenceAnalyzer` with severity classification. Enriches overlap findings with churn frequency and coupling data to classify conflicts as high, medium, or low severity. Regroups tasks using only high-severity edges.

```typescript
const predictor = new ConflictPredictor(store);
const prediction = predictor.predict({
  tasks: [
    { id: 'task-a', files: ['src/auth.ts'] },
    { id: 'task-b', files: ['src/auth.ts', 'src/db.ts'] },
  ],
});
// prediction.conflicts[0].severity → 'high'
// prediction.summary → { high: 1, medium: 0, low: 0, regrouped: false }
```

- `constructor(store?: GraphStore)` — store enables churn/coupling-based severity classification
- `predict(params: IndependenceCheckParams): ConflictPrediction` — run conflict analysis with severity
- Direct file overlaps are always `high`; transitive overlaps are classified by churn/coupling thresholds

**Types:** `ConflictSeverity`, `ConflictDetail`, `ConflictPrediction`

---

## Blast Radius

### `CascadeSimulator`

Simulates failure propagation through the graph using BFS with cumulative probability decay. Starting from a source node, traverses outbound edges and computes the probability that each downstream node is affected.

```typescript
const simulator = new CascadeSimulator(store);
const result = simulator.simulate('file:src/core/auth.ts', {
  probabilityFloor: 0.05,
  maxDepth: 5,
});
// result.layers — affected nodes grouped by depth
// result.summary.totalAffected, result.summary.highRisk
```

- `constructor(store: GraphStore)`
- `simulate(sourceNodeId: string, options?: CascadeSimulationOptions): CascadeResult` — run cascade simulation
- Nodes with cumulative probability >= 0.5 are high risk, >= 0.2 medium, rest low
- Detects amplification points (nodes with fan-out > 3 in the cascade)

**Types:** `CascadeSimulationOptions`, `CascadeNode`, `CascadeLayer`, `CascadeResult`

### `CompositeProbabilityStrategy`

Default probability strategy blending three signals: 50% edge-type base weight, 30% normalized change frequency, 20% normalized coupling strength. Implements `ProbabilityStrategy`.

```typescript
const strategy = new CompositeProbabilityStrategy(changeFreqMap, couplingMap);
const prob = strategy.getEdgeProbability(edge, fromNode, toNode);
```

- `constructor(changeFreqMap: Map<string, number>, couplingMap: Map<string, number>)`
- `getEdgeProbability(edge, fromNode, toNode): number` — returns 0..1 probability

**Types:** `ProbabilityStrategy`

---

## Natural Language Query (NLQ)

### `askGraph(store, question)`

Ask a natural language question about the codebase knowledge graph. Translates the question into graph operations via an intent classification and entity resolution pipeline, returning a human-readable summary alongside raw graph data.

```typescript
const result = await askGraph(store, 'what breaks if I change AuthService?');
// result.intent → 'impact'
// result.summary → "Changing AuthService affects 12 nodes..."
// result.data → ImpactGroups
```

- `store: GraphStore` — the graph store to query against
- `question: string` — natural language question about the codebase
- Returns `Promise<AskGraphResult>` with intent, entities, summary, and raw data
- Supports intents: `impact`, `find`, `relationships`, `explain`, `anomaly`
- Routes "blast radius" / "cascade" questions to `CascadeSimulator`

**Types:** `AskGraphResult`, `Intent`, `ClassificationResult`, `ResolvedEntity`

### `INTENTS`

Runtime-accessible array of all supported intent categories: `['impact', 'find', 'relationships', 'explain', 'anomaly']`.

### `IntentClassifier`

Classifies a natural language question into one of the supported intents using keyword, question-word, and verb-pattern signals with weighted scoring.

- `classify(question: string): ClassificationResult` — returns intent, confidence (0-1), and signal scores

### `EntityExtractor`

Extracts entity mentions (function names, class names, file paths) from a natural language question using tokenization and filtering.

- `extract(question: string): string[]` — returns raw entity strings

### `EntityResolver`

Resolves raw entity strings to graph nodes using a 3-step fuzzy cascade: exact name match, FusionLayer search (score > 0.5), and path match on file nodes.

- `constructor(store: GraphStore, fusion?: FusionLayer)`
- `resolve(rawEntities: string[]): ResolvedEntity[]` — returns resolved entities with confidence and method

### `ResponseFormatter`

Template-based response formatter that generates human-readable summaries from graph operation results, one template per intent.

- `format(intent: Intent, entities: readonly ResolvedEntity[], data: unknown, query?: string): string`
