# Plan: Paged MCP Tool Responses -- Phase 2: Graph Tools

**Date:** 2026-04-11
**Spec:** docs/changes/paged-mcp-tool-responses/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Add offset/limit pagination to `query_graph`, `get_relationships`, and `detect_anomalies` graph tools, using the `paginate()` utility from `@harness-engineering/core` (delivered in Phase 1).

## Observable Truths (Acceptance Criteria)

1. When `query_graph` is called in detailed mode with `offset: 2, limit: 2` on a graph with 5 nodes, the system shall return `nodes` containing only nodes at positions 2-3 (zero-indexed) sorted by edge count desc, with `pagination: { offset: 2, limit: 2, total: 5, hasMore: true }`.
2. When `query_graph` is called in detailed mode without `offset`/`limit`, the system shall return up to 50 nodes sorted by connectivity (edge count desc) with `pagination.hasMore` reflecting whether more than 50 exist.
3. When `query_graph` is called in summary mode, the system shall NOT paginate nodes (summary computes aggregates over the full result set) and shall NOT include a `pagination` field.
4. When `get_relationships` is called in detailed mode with `offset: 1, limit: 1` on a result with 3 edges, the system shall return `edges` containing 1 edge at position 1, sorted by confidence desc (defaulting to 1 for edges without confidence), with `pagination: { offset: 1, limit: 1, total: 3, hasMore: true }`.
5. When `get_relationships` is called in detailed mode without `offset`/`limit`, the system shall return up to 50 edges with `pagination` metadata.
6. When `detect_anomalies` is called with `offset: 0, limit: 1` on a report with outliers, the system shall return only the top outlier by Z-score desc in `statisticalOutliers`, with `pagination: { offset: 0, limit: 1, total: <outlier count>, hasMore: true }`.
7. When `detect_anomalies` is called without `offset`/`limit`, the system shall return up to 30 outliers with `pagination` metadata.
8. All 3 tool input schemas include `offset` (number, optional) and `limit` (number, optional) property definitions with descriptions that document the default and sort key.
9. `npx vitest run packages/cli/tests/mcp/tools/graph.test.ts` passes.
10. `npx vitest run packages/cli/tests/mcp/tools/graph-anomaly.test.ts` passes.
11. `harness validate` passes.

## File Map

- MODIFY `packages/cli/src/mcp/tools/graph/query-graph.ts` (add offset/limit to schema and handler, sort nodes by connectivity, call paginate)
- MODIFY `packages/cli/src/mcp/tools/graph/get-relationships.ts` (add offset/limit to schema and handler, sort edges by confidence, call paginate)
- MODIFY `packages/cli/src/mcp/tools/graph/detect-anomalies.ts` (add offset/limit to schema and handler, paginate statisticalOutliers)
- MODIFY `packages/cli/tests/mcp/tools/graph.test.ts` (add pagination tests for query_graph and get_relationships)
- MODIFY `packages/cli/tests/mcp/tools/graph-anomaly.test.ts` (add pagination tests for detect_anomalies)

## Tasks

### Task 1: Add pagination to query_graph definition and handler

**Depends on:** none (Phase 1 complete)
**Files:** `packages/cli/src/mcp/tools/graph/query-graph.ts`

1. Add import at top of file:

   ```typescript
   import { paginate } from '@harness-engineering/core';
   ```

2. Add `offset` and `limit` to `queryGraphDefinition.inputSchema.properties`:

   ```typescript
   offset: {
     type: 'number',
     description: 'Number of nodes to skip (pagination). Default: 0. Nodes are sorted by connectivity (edge count desc).',
   },
   limit: {
     type: 'number',
     description: 'Max nodes to return (pagination). Default: 50.',
   },
   ```

3. Add `offset?: number` and `limit?: number` to the `handleQueryGraph` input type.

4. In `handleQueryGraph`, after the `ContextQL` execute call and before the `input.mode === 'summary'` branch, add connectivity sorting and pagination for detailed mode. The detailed branch currently does `JSON.stringify(result)`. Change it to:

   ```typescript
   if (input.mode === 'summary') {
     const text = buildSummaryText(result);
     return { content: [{ type: 'text' as const, text }] };
   }

   // Detailed mode: sort nodes by connectivity (edge count desc), then paginate
   const edgeCountByNode = new Map<string, number>();
   for (const edge of result.edges) {
     edgeCountByNode.set(edge.from, (edgeCountByNode.get(edge.from) ?? 0) + 1);
     edgeCountByNode.set(edge.to, (edgeCountByNode.get(edge.to) ?? 0) + 1);
   }
   const sortedNodes = [...result.nodes].sort(
     (a, b) => (edgeCountByNode.get(b.id) ?? 0) - (edgeCountByNode.get(a.id) ?? 0)
   );

   const offset = input.offset ?? 0;
   const limit = input.limit ?? 50;
   const paged = paginate(sortedNodes, offset, limit);

   const response = {
     nodes: paged.items,
     edges: result.edges,
     stats: result.stats,
     pagination: paged.pagination,
   };
   return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] };
   ```

5. Remove the old ternary that handled `input.mode === 'summary'` since both branches now return explicitly.

6. Run: `harness validate`
7. Commit: `feat(graph): add offset/limit pagination to query_graph detailed mode`

### Task 2: Add pagination tests for query_graph

**Depends on:** Task 1
**Files:** `packages/cli/tests/mcp/tools/graph.test.ts`

1. Add the following tests inside the existing `describe('handleQueryGraph', ...)` block at the end:

   ```typescript
   it('paginates nodes in detailed mode with default limit', async () => {
     await createTestGraph(tmpDir);
     const result = await handleQueryGraph({
       path: tmpDir,
       rootNodeIds: ['file:src/index.ts'],
     });

     expect(result.isError).toBeUndefined();
     const data = parseResult(result);
     expect(data.pagination).toBeDefined();
     expect(data.pagination.offset).toBe(0);
     expect(data.pagination.limit).toBe(50);
     expect(data.pagination.total).toBe(data.pagination.total); // sanity
     expect(typeof data.pagination.hasMore).toBe('boolean');
   });

   it('respects offset and limit for node pagination', async () => {
     await createTestGraph(tmpDir);
     const full = await handleQueryGraph({
       path: tmpDir,
       rootNodeIds: ['file:src/index.ts'],
       limit: 100,
     });
     const fullData = parseResult(full);
     const totalNodes = fullData.pagination.total;

     // Request page with limit=2, offset=1
     const paged = await handleQueryGraph({
       path: tmpDir,
       rootNodeIds: ['file:src/index.ts'],
       offset: 1,
       limit: 2,
     });

     const pagedData = parseResult(paged);
     expect(pagedData.nodes.length).toBe(2);
     expect(pagedData.pagination.offset).toBe(1);
     expect(pagedData.pagination.limit).toBe(2);
     expect(pagedData.pagination.total).toBe(totalNodes);
     expect(pagedData.pagination.hasMore).toBe(1 + 2 < totalNodes);
   });

   it('sorts nodes by connectivity (edge count desc) in detailed mode', async () => {
     await createTestGraph(tmpDir);
     const result = await handleQueryGraph({
       path: tmpDir,
       rootNodeIds: ['file:src/index.ts'],
       limit: 100,
     });

     const data = parseResult(result);
     // file:src/index.ts has 4 edges (3 outbound + 1 inbound from adr)
     // It should appear first or near the top
     expect(data.nodes[0].id).toBe('file:src/index.ts');
   });

   it('does not include pagination in summary mode', async () => {
     await createTestGraph(tmpDir);
     const result = await handleQueryGraph({
       path: tmpDir,
       rootNodeIds: ['file:src/index.ts'],
       mode: 'summary',
     });

     expect(result.isError).toBeUndefined();
     // Summary mode returns plain text, not JSON with pagination
     expect(result.content[0].text).toContain('Nodes (');
     expect(result.content[0].text).not.toContain('"pagination"');
   });
   ```

2. Run tests: `cd packages/cli && npx vitest run tests/mcp/tools/graph.test.ts`
3. Observe: all tests pass (including new pagination tests).
4. Run: `harness validate`
5. Commit: `test(graph): add pagination tests for query_graph`

### Task 3: Add pagination to get_relationships definition and handler

**Depends on:** none (Phase 1 complete)
**Files:** `packages/cli/src/mcp/tools/graph/get-relationships.ts`

1. Add import at top of file:

   ```typescript
   import { paginate } from '@harness-engineering/core';
   ```

2. Add `offset` and `limit` to `getRelationshipsDefinition.inputSchema.properties`:

   ```typescript
   offset: {
     type: 'number',
     description: 'Number of edges to skip (pagination). Default: 0. Edges are sorted by weight (confidence desc).',
   },
   limit: {
     type: 'number',
     description: 'Max edges to return (pagination). Default: 50.',
   },
   ```

3. Add `offset?: number` and `limit?: number` to the `handleGetRelationships` input type.

4. In the detailed response branch (the final `return` before the `catch`), sort edges by confidence desc and paginate:

   ```typescript
   // Sort edges by confidence (weight) desc, defaulting to 1
   const sortedEdges = [...filteredEdges].sort((a, b) => (b.confidence ?? 1) - (a.confidence ?? 1));

   const offset = input.offset ?? 0;
   const limit = input.limit ?? 50;
   const paged = paginate(sortedEdges, offset, limit);

   return {
     content: [
       {
         type: 'text' as const,
         text: JSON.stringify({
           nodeId: input.nodeId,
           direction,
           depth: input.depth ?? 1,
           nodes: filteredNodes,
           edges: paged.items,
           stats: result.stats,
           pagination: paged.pagination,
         }),
       },
     ],
   };
   ```

5. Replace the existing detailed-mode return block with the above.

6. Run: `harness validate`
7. Commit: `feat(graph): add offset/limit pagination to get_relationships detailed mode`

### Task 4: Add pagination tests for get_relationships

**Depends on:** Task 3
**Files:** `packages/cli/tests/mcp/tools/graph.test.ts`

1. Add the following tests inside the existing `describe('handleGetRelationships', ...)` block:

   ```typescript
   it('includes pagination metadata in detailed mode', async () => {
     await createTestGraph(tmpDir);
     const result = await handleGetRelationships({
       path: tmpDir,
       nodeId: 'file:src/index.ts',
       direction: 'outbound',
     });

     expect(result.isError).toBeUndefined();
     const data = parseResult(result);
     expect(data.pagination).toBeDefined();
     expect(data.pagination.offset).toBe(0);
     expect(data.pagination.limit).toBe(50);
     expect(data.pagination.total).toBe(data.edges.length);
     expect(data.pagination.hasMore).toBe(false);
   });

   it('respects offset and limit for edge pagination', async () => {
     await createTestGraph(tmpDir);
     const result = await handleGetRelationships({
       path: tmpDir,
       nodeId: 'file:src/index.ts',
       direction: 'outbound',
       offset: 0,
       limit: 1,
     });

     expect(result.isError).toBeUndefined();
     const data = parseResult(result);
     expect(data.edges.length).toBe(1);
     expect(data.pagination.offset).toBe(0);
     expect(data.pagination.limit).toBe(1);
     expect(data.pagination.hasMore).toBe(true);
   });
   ```

2. Run tests: `cd packages/cli && npx vitest run tests/mcp/tools/graph.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(graph): add pagination tests for get_relationships`

### Task 5: Add pagination to detect_anomalies definition and handler

**Depends on:** none (Phase 1 complete)
**Files:** `packages/cli/src/mcp/tools/graph/detect-anomalies.ts`

1. Add import at top of file:

   ```typescript
   import { paginate } from '@harness-engineering/core';
   ```

2. Add `offset` and `limit` to `detectAnomaliesDefinition.inputSchema.properties`:

   ```typescript
   offset: {
     type: 'number',
     description: 'Number of anomaly entries to skip (pagination). Default: 0. Anomalies are sorted by Z-score desc.',
   },
   limit: {
     type: 'number',
     description: 'Max anomaly entries to return (pagination). Default: 30.',
   },
   ```

3. Add `offset?: number` and `limit?: number` to the `handleDetectAnomalies` input type.

4. After `const report = adapter.detect(...)`, paginate `statisticalOutliers` (they are already sorted by Z-score desc in `GraphAnomalyAdapter.computeAllOutliers`):

   ```typescript
   const offset = input.offset ?? 0;
   const limit = input.limit ?? 30;
   const paged = paginate(report.statisticalOutliers, offset, limit);

   const response = {
     ...report,
     statisticalOutliers: paged.items,
     pagination: paged.pagination,
   };

   return {
     content: [{ type: 'text' as const, text: JSON.stringify(response) }],
   };
   ```

5. Replace the existing return with the above.

6. Run: `harness validate`
7. Commit: `feat(graph): add offset/limit pagination to detect_anomalies`

### Task 6: Add pagination tests for detect_anomalies

**Depends on:** Task 5
**Files:** `packages/cli/tests/mcp/tools/graph-anomaly.test.ts`

1. Add the following tests inside the existing `describe('handleDetectAnomalies', ...)` block:

   ```typescript
   it('includes pagination metadata with default limit', async () => {
     await createAnomalyTestGraph(tmpDir);
     const result = await handleDetectAnomalies({ path: tmpDir });

     expect(result.isError).toBeUndefined();
     const data = parseResult(result);
     expect(data.pagination).toBeDefined();
     expect(data.pagination.offset).toBe(0);
     expect(data.pagination.limit).toBe(30);
     expect(typeof data.pagination.total).toBe('number');
     expect(typeof data.pagination.hasMore).toBe('boolean');
   });

   it('respects offset and limit for anomaly pagination', async () => {
     await createAnomalyTestGraph(tmpDir);

     // First get all outliers to know the count
     const full = await handleDetectAnomalies({
       path: tmpDir,
       metrics: ['cyclomaticComplexity'],
       limit: 100,
     });
     const fullData = parseResult(full);
     const totalOutliers = fullData.pagination.total;

     // Now request with limit=1
     const paged = await handleDetectAnomalies({
       path: tmpDir,
       metrics: ['cyclomaticComplexity'],
       offset: 0,
       limit: 1,
     });

     const pagedData = parseResult(paged);
     expect(pagedData.statisticalOutliers.length).toBeLessThanOrEqual(1);
     expect(pagedData.pagination.offset).toBe(0);
     expect(pagedData.pagination.limit).toBe(1);
     expect(pagedData.pagination.total).toBe(totalOutliers);
     if (totalOutliers > 1) {
       expect(pagedData.pagination.hasMore).toBe(true);
     }
   });

   it('outliers are sorted by Z-score desc (page 1 has highest Z-score)', async () => {
     await createAnomalyTestGraph(tmpDir);
     const result = await handleDetectAnomalies({
       path: tmpDir,
       metrics: ['cyclomaticComplexity'],
       limit: 100,
     });

     const data = parseResult(result);
     const zScores = data.statisticalOutliers.map((o: { zScore: number }) => o.zScore);
     for (let i = 1; i < zScores.length; i++) {
       expect(zScores[i - 1]).toBeGreaterThanOrEqual(zScores[i]);
     }
   });
   ```

2. Run tests: `cd packages/cli && npx vitest run tests/mcp/tools/graph-anomaly.test.ts`
3. Observe: all tests pass (including new pagination tests).
4. Run: `harness validate`
5. Commit: `test(graph): add pagination tests for detect_anomalies`

## Dependency Graph

```
Task 1 (query_graph impl)    Task 3 (get_relationships impl)    Task 5 (detect_anomalies impl)
     |                              |                                   |
     v                              v                                   v
Task 2 (query_graph tests)   Task 4 (get_relationships tests)   Task 6 (detect_anomalies tests)
```

Tasks 1, 3, and 5 are independent and can be executed in parallel.
Tasks 2, 4, and 6 depend only on their respective implementation task.

## Key Design Decisions

1. **Summary mode is NOT paginated in query_graph.** Summary mode computes aggregates (node/edge counts by type) over the full result set. Paginating the underlying data would produce incorrect aggregates. Only detailed mode paginates.
2. **Edge weight = confidence field.** `GraphEdge` has no `weight` field. The `confidence` field (0-1) is the closest semantic match. Edges without `confidence` default to 1 so they sort first (no information loss for unweighted edges).
3. **Nodes in get_relationships are NOT paginated.** The spec says to paginate the `edges` array. Nodes remain unsliced since they provide context for the edges returned.
4. **detect_anomalies outliers are already Z-score sorted.** `GraphAnomalyAdapter.computeAllOutliers` sorts by `zScore` desc (line 125 of `GraphAnomalyAdapter.ts`). No re-sort needed, just slice.
5. **articulationPoints and overlapping are NOT paginated.** The spec says to paginate "anomaly entries" which maps to `statisticalOutliers`. Articulation points and overlapping are structural metadata that should always be complete.
