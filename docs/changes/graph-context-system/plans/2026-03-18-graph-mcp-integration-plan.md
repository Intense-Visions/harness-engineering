# Plan: Graph MCP Integration (Phase 2b of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 12
**Estimated time:** 50-70 minutes

## Goal

Wire the knowledge graph into the MCP server with 6 new tools and 3 new resources, enabling AI agents to query the graph, search semantically, analyze impact, and trigger ingestion — all via the standard MCP protocol.

## Observable Truths (Acceptance Criteria)

1. When `query_graph` MCP tool is called with ContextQL parameters, the system shall return filtered nodes and edges from the graph.
2. When `search_similar` MCP tool is called with a natural language query, the system shall return ranked results from the FusionLayer.
3. When `find_context_for` MCP tool is called with an intent string and token budget, the system shall return assembled context using FusionLayer + ContextQL combined.
4. When `get_relationships` MCP tool is called with a node ID and direction, the system shall return connected nodes via graph traversal.
5. When `get_impact` MCP tool is called with a node ID or file path, the system shall return all affected downstream nodes (reverse dependency traversal).
6. When `ingest_source` MCP tool is called with a source name, the system shall trigger the appropriate ingestor and return counts.
7. When `harness://graph` resource is read, the system shall return graph statistics (node/edge counts by type, staleness).
8. When `harness://entities` resource is read, the system shall return all entity nodes with types and metadata.
9. When `harness://relationships` resource is read, the system shall return all edges with types and confidence scores.
10. `pnpm build --filter @harness-engineering/mcp-server` succeeds.
11. `pnpm test --filter @harness-engineering/mcp-server` passes with new tests.

## File Map

```
CREATE packages/mcp-server/src/tools/graph.ts
CREATE packages/mcp-server/src/resources/graph.ts
CREATE packages/mcp-server/tests/tools/graph.test.ts
CREATE packages/mcp-server/tests/resources/graph.test.ts
MODIFY packages/mcp-server/src/server.ts (register new tools + resources)
MODIFY packages/mcp-server/package.json (add @harness-engineering/graph dependency)
```

## Tasks

### Task 1: Add graph dependency to mcp-server

**Depends on:** none
**Files:** packages/mcp-server/package.json

1. Add `"@harness-engineering/graph": "workspace:*"` to dependencies in `packages/mcp-server/package.json`
2. Run: `pnpm install`
3. Verify: `pnpm build --filter @harness-engineering/mcp-server` succeeds
4. Commit: `chore(mcp-server): add @harness-engineering/graph dependency`

---

### Task 2: Implement graph tools — query_graph and search_similar

**Depends on:** Task 1
**Files:** packages/mcp-server/src/tools/graph.ts (create)

1. Create `packages/mcp-server/src/tools/graph.ts` with the first two tools:

   **query_graph**: Accepts `path` (project root), `rootNodeIds`, `maxDepth`, `includeTypes`, `excludeTypes`, `includeEdges`, `bidirectional`, `pruneObservability`. Loads graph from `.harness/graph/`, creates GraphStore + ContextQL, executes query, returns nodes + edges + stats as JSON.

   **search_similar**: Accepts `path` (project root), `query` (string), `topK`. Loads graph, creates FusionLayer, runs search, returns ranked results as JSON.

   Both tools should use a shared `loadGraphStore(projectPath)` helper that:
   - Creates a GraphStore
   - Loads from `.harness/graph/` directory
   - Returns null with a helpful message if graph doesn't exist ("Run `harness scan` first")

   Follow the existing tool pattern:

   ```typescript
   export const queryGraphDefinition = {
     name: 'query_graph',
     description: '...',
     inputSchema: { type: 'object' as const, properties: {...}, required: [...] },
   };
   export async function handleQueryGraph(input: {...}) { ... }
   ```

2. Commit: `feat(mcp-server): add query_graph and search_similar tools`

---

### Task 3: Implement graph tools — find_context_for and get_relationships

**Depends on:** Task 2
**Files:** packages/mcp-server/src/tools/graph.ts (modify)

1. Add two more tools to the graph.ts file:

   **find_context_for**: Accepts `path`, `intent` (string), `tokenBudget` (number, default 4000). Uses FusionLayer to find relevant nodes, then ContextQL to expand context around top results, then truncates to fit token budget (rough estimate: 4 chars per token). Returns assembled context with relationship metadata.

   **get_relationships**: Accepts `path`, `nodeId` (string), `direction` ('outbound' | 'inbound' | 'both', default 'both'), `depth` (number, default 1). Uses ContextQL to traverse from the node, returns connected nodes and edges.

2. Commit: `feat(mcp-server): add find_context_for and get_relationships tools`

---

### Task 4: Implement graph tools — get_impact and ingest_source

**Depends on:** Task 2
**Files:** packages/mcp-server/src/tools/graph.ts (modify)

1. Add the final two tools:

   **get_impact**: Accepts `path`, `nodeId` or `filePath` (string). If filePath is provided, resolves to node ID (`file:<relativePath>`). Uses ContextQL with `bidirectional: true` and `maxDepth: 3` to find all affected nodes. Groups results by type (tests, docs, consumers). Returns structured impact report.

   **ingest_source**: Accepts `path`, `source` ('code' | 'knowledge' | 'git' | 'all'). Runs the appropriate ingestor(s) on the project, saves graph to `.harness/graph/`. Returns IngestResult with counts. This is the MCP equivalent of `harness scan`.

2. Commit: `feat(mcp-server): add get_impact and ingest_source tools`

---

### Task 5: Implement graph resources

**Depends on:** Task 1
**Files:** packages/mcp-server/src/resources/graph.ts (create)

1. Create `packages/mcp-server/src/resources/graph.ts` with three resource handlers:

   **getGraphResource**: Loads graph from `.harness/graph/`, returns JSON with:
   - nodeCount, edgeCount
   - Counts by node type (file: N, function: N, class: N, etc.)
   - Counts by edge type (imports: N, contains: N, calls: N, etc.)
   - lastScanTimestamp from metadata.json
   - staleness warning if older than 24 hours

   **getEntitiesResource**: Loads graph, returns JSON array of all nodes with id, type, name, path, metadata. Excludes content and embedding fields to keep payload small.

   **getRelationshipsResource**: Loads graph, returns JSON array of all edges with from, to, type, confidence, metadata.

   Use the same `loadGraphStore` helper from tools/graph.ts (extract to a shared util if needed).

2. Commit: `feat(mcp-server): add graph, entities, and relationships resources`

---

### Task 6: Register tools and resources in server.ts

**Depends on:** Tasks 2, 3, 4, 5
**Files:** packages/mcp-server/src/server.ts (modify)

1. Add imports for all 6 tool definitions + handlers and 3 resource handlers from the new files.
2. Add 6 tool definitions to `TOOL_DEFINITIONS` array.
3. Add 6 tool handlers to `TOOL_HANDLERS` map.
4. Add 3 resource definitions to `RESOURCE_DEFINITIONS` array:
   ```typescript
   { uri: 'harness://graph', name: 'Knowledge Graph', description: 'Graph statistics, node/edge counts by type, staleness', mimeType: 'application/json' },
   { uri: 'harness://entities', name: 'Graph Entities', description: 'All entity nodes with types and metadata', mimeType: 'application/json' },
   { uri: 'harness://relationships', name: 'Graph Relationships', description: 'All edges with types, confidence scores, and timestamps', mimeType: 'application/json' },
   ```
5. Add 3 resource handlers to `RESOURCE_HANDLERS` map.
6. Commit: `feat(mcp-server): register graph tools and resources in server`

---

### Task 7: Write tests for graph tools

**Depends on:** Tasks 2, 3, 4
**Files:** packages/mcp-server/tests/tools/graph.test.ts (create)

1. Create tests that:
   - Mock a GraphStore with known data (populate with test nodes/edges)
   - Test `handleQueryGraph` returns correct nodes for given params
   - Test `handleSearchSimilar` returns ranked results
   - Test `handleFindContextFor` returns context within token budget
   - Test `handleGetRelationships` returns neighbors in correct direction
   - Test `handleGetImpact` returns affected nodes grouped by type
   - Test `handleIngestSource` runs ingestor and returns counts
   - Test graceful error when graph doesn't exist ("Run `harness scan` first")

   For testing without a real graph on disk, create a helper that writes a temporary graph.json + metadata.json to a tmpdir.

2. Commit: `test(mcp-server): add tests for graph tools`

---

### Task 8: Write tests for graph resources

**Depends on:** Task 5
**Files:** packages/mcp-server/tests/resources/graph.test.ts (create)

1. Create tests that:
   - Test `getGraphResource` returns correct node/edge counts by type
   - Test `getGraphResource` includes staleness warning when graph is old
   - Test `getGraphResource` returns helpful message when no graph exists
   - Test `getEntitiesResource` returns all nodes without content/embedding fields
   - Test `getRelationshipsResource` returns all edges with correct types

   Use tmpdir with pre-built graph.json + metadata.json files.

2. Commit: `test(mcp-server): add tests for graph resources`

---

### Task 9: Build and test verification

**Depends on:** Tasks 6, 7, 8
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `pnpm build --filter @harness-engineering/mcp-server`
2. Run: `pnpm test --filter @harness-engineering/mcp-server`
3. Run: `cd packages/graph && npx vitest run` (verify graph tests still pass)
4. Observe: all pass
5. Commit: `chore(mcp-server): verify graph integration build and tests`

---

## Dependency Graph

```
Task 1 (dependency) ──→ Task 2 (query + search tools) ──→ Task 3 (context + relationships) ──┐
                   │                                                                            │
                   │                                  ──→ Task 4 (impact + ingest)  ────────────→ Task 6 (register) ──→ Task 9 (verify)
                   │                                                                            │
                   └──→ Task 5 (resources) ────────────────────────────────────────────────────┘
                                                                                                │
                        Task 7 (tool tests) ←── Tasks 2,3,4 ──────────────────────────────────→│
                        Task 8 (resource tests) ←── Task 5 ───────────────────────────────────→│
```

**Parallelizable:**

- Tasks 2 and 5 can run in parallel (tools vs resources)
- Tasks 3 and 4 can run in parallel (both extend tools/graph.ts, but modify different sections)
- Tasks 7 and 8 can run in parallel (tool tests vs resource tests)

## Traceability Matrix

| Observable Truth                    | Delivered By |
| ----------------------------------- | ------------ |
| 1. query_graph tool                 | Task 2       |
| 2. search_similar tool              | Task 2       |
| 3. find_context_for tool            | Task 3       |
| 4. get_relationships tool           | Task 3       |
| 5. get_impact tool                  | Task 4       |
| 6. ingest_source tool               | Task 4       |
| 7. harness://graph resource         | Task 5       |
| 8. harness://entities resource      | Task 5       |
| 9. harness://relationships resource | Task 5       |
| 10. Build succeeds                  | Task 9       |
| 11. Tests pass                      | Task 9       |
