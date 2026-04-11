# Plan: Paged MCP Tool Responses — Phase 5: Schema & Documentation

**Date:** 2026-04-11
**Spec:** docs/changes/paged-mcp-tool-responses/proposal.md
**Session:** changes--paged-mcp-tool-responses--proposal
**Estimated tasks:** 3
**Estimated time:** 12 minutes

## Goal

Verify that all 8 paginated MCP tools have complete input schemas (offset/limit with sort-key
documentation, plus section for gather_context), and add an integration test that simulates an
agent doing a multi-page fetch across two tools — calling once, seeing `hasMore: true`, then
calling again with an offset and verifying different items are returned.

## Observable Truths (Acceptance Criteria)

1. The system shall have `offset` and `limit` properties present in the `inputSchema` of all 8
   tools, each with descriptions that name the sort key and default value.
2. Where the tool is `gather_context`, the system shall also have a `section` property with enum
   `['graphContext', 'learnings', 'sessionSections']` in the `inputSchema`.
3. When an agent calls `query_graph` with `limit=2`, receives `hasMore: true`, then calls again
   with `offset=2, limit=2`, the system shall return a different, non-overlapping set of nodes
   compared to the first page.
4. When an agent calls `get_relationships` with `limit=1`, receives `hasMore: true`, then calls
   again with `offset=1, limit=1`, the system shall return a different edge compared to the first
   page.
5. `npx vitest run packages/cli/tests/mcp/tools/pagination-integration.test.ts` passes with all
   assertions green.
6. `harness validate` passes.

## Schema Audit Results (Phase 1 of this plan — already verified by reading tool files)

All 8 tools confirmed complete. Evidence:

| Tool                | File                                                          | offset present | limit present | sort key doc                                        | section              |
| ------------------- | ------------------------------------------------------------- | -------------- | ------------- | --------------------------------------------------- | -------------------- |
| `query_graph`       | `packages/cli/src/mcp/tools/graph/query-graph.ts:49-57`       | yes            | yes           | "connectivity (edge count desc)"                    | N/A                  |
| `get_relationships` | `packages/cli/src/mcp/tools/graph/get-relationships.ts:27-35` | yes            | yes           | "weight (confidence desc)"                          | N/A                  |
| `detect_anomalies`  | `packages/cli/src/mcp/tools/graph/detect-anomalies.ts:21-29`  | yes            | yes           | "Z-score desc"                                      | N/A                  |
| `code_outline`      | `packages/cli/src/mcp/tools/code-nav.ts:22-33`                | yes            | yes           | "modification time desc"                            | N/A                  |
| `review_changes`    | `packages/cli/src/mcp/tools/review-changes.ts:29-37`          | yes            | yes           | "severity desc (error > warning > info)"            | N/A                  |
| `run_code_review`   | `packages/cli/src/mcp/tools/review-pipeline.ts:43-52`         | yes            | yes           | "severity desc (critical > important > suggestion)" | N/A                  |
| `gather_context`    | `packages/cli/src/mcp/tools/gather-context.ts:150-168`        | yes            | yes           | section-dependent                                   | yes, with mode guard |
| `get_decay_trends`  | `packages/cli/src/mcp/tools/decay-trends.ts:33-45`            | yes            | yes           | "decay magnitude (absolute delta) desc"             | N/A                  |

No schema changes are needed. Phase 5 work is verification + integration test authorship only.

## File Map

- CREATE `packages/cli/tests/mcp/tools/pagination-integration.test.ts`

## Tasks

---

### Task 1: Write schema completeness verification tests

**Depends on:** none
**Files:** `packages/cli/tests/mcp/tools/pagination-integration.test.ts`

The schema audit above was performed by inspection. This task encodes those findings as
executable assertions so they are enforced by CI going forward. These tests import the
definition objects and verify each schema property exists with the correct type and a
description that mentions the sort key.

1. Create `packages/cli/tests/mcp/tools/pagination-integration.test.ts` with the following
   content:

   ```typescript
   /**
    * Pagination integration tests — Phase 5
    *
    * Two concerns:
    * 1. Schema completeness: all 8 tool definitions have offset/limit (and section for
    *    gather_context) with sort-key descriptions.
    * 2. Multi-page fetch: agent-style calls to query_graph and get_relationships where
    *    page 1 has hasMore=true and page 2 returns non-overlapping items.
    */
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as os from 'os';
   import * as path from 'path';
   import * as fs from 'fs/promises';

   import { queryGraphDefinition, handleQueryGraph } from '../../../src/mcp/tools/graph/index.js';
   import {
     getRelationshipsDefinition,
     handleGetRelationships,
   } from '../../../src/mcp/tools/graph/index.js';
   import { detectAnomaliesDefinition } from '../../../src/mcp/tools/graph/index.js';
   import { codeOutlineDefinition } from '../../../src/mcp/tools/code-nav.js';
   import { reviewChangesDefinition } from '../../../src/mcp/tools/review-changes.js';
   import { runCodeReviewDefinition } from '../../../src/mcp/tools/review-pipeline.js';
   import { gatherContextDefinition } from '../../../src/mcp/tools/gather-context.js';
   import { getDecayTrendsDefinition } from '../../../src/mcp/tools/decay-trends.js';

   // ── helpers ────────────────────────────────────────────────────────────

   function assertPaginationSchema(
     def: { inputSchema: { properties: Record<string, { type?: string; description?: string }> } },
     toolName: string,
     expectedSortKeyFragment: string
   ) {
     const props = def.inputSchema.properties;
     expect(props, `${toolName}: offset missing from schema`).toHaveProperty('offset');
     expect(props, `${toolName}: limit missing from schema`).toHaveProperty('limit');
     expect(props.offset.type, `${toolName}: offset.type`).toBe('number');
     expect(props.limit.type, `${toolName}: limit.type`).toBe('number');
     expect(
       props.offset.description,
       `${toolName}: offset description must mention sort key`
     ).toContain(expectedSortKeyFragment);
     expect(props.limit.description, `${toolName}: limit description must mention default`).toMatch(
       /default:\s*\d+/i
     );
   }

   let tmpDir: string;

   async function createTestGraph(dir: string) {
     const { GraphStore } = await import('@harness-engineering/graph');
     const store = new GraphStore();

     // 6 nodes with varying connectivity so sort order is deterministic
     const nodes = [
       { id: 'file:a.ts', name: 'a.ts', path: 'a.ts' },
       { id: 'file:b.ts', name: 'b.ts', path: 'b.ts' },
       { id: 'file:c.ts', name: 'c.ts', path: 'c.ts' },
       { id: 'file:d.ts', name: 'd.ts', path: 'd.ts' },
       { id: 'file:e.ts', name: 'e.ts', path: 'e.ts' },
       { id: 'file:f.ts', name: 'f.ts', path: 'f.ts' },
     ];
     for (const n of nodes) {
       store.addNode({ ...n, type: 'file', metadata: {} });
     }

     // Hub edges: a.ts has the most edges, b.ts has fewer, rest minimal
     store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
     store.addEdge({ from: 'file:a.ts', to: 'file:c.ts', type: 'imports' });
     store.addEdge({ from: 'file:a.ts', to: 'file:d.ts', type: 'imports' });
     store.addEdge({ from: 'file:b.ts', to: 'file:e.ts', type: 'imports' });
     store.addEdge({ from: 'file:b.ts', to: 'file:f.ts', type: 'imports' });

     const graphDir = path.join(dir, '.harness', 'graph');
     await store.save(graphDir);
     return store;
   }

   beforeEach(async () => {
     tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pagination-integration-'));
   });

   afterEach(async () => {
     await fs.rm(tmpDir, { recursive: true, force: true });
   });

   // ── Part 1: Schema completeness ────────────────────────────────────────

   describe('schema completeness — all 8 tools have offset/limit with sort-key docs', () => {
     it('query_graph schema: offset/limit present, sort key documented', () => {
       assertPaginationSchema(queryGraphDefinition, 'query_graph', 'connectivity');
     });

     it('get_relationships schema: offset/limit present, sort key documented', () => {
       assertPaginationSchema(getRelationshipsDefinition, 'get_relationships', 'weight');
     });

     it('detect_anomalies schema: offset/limit present, sort key documented', () => {
       assertPaginationSchema(detectAnomaliesDefinition, 'detect_anomalies', 'Z-score');
     });

     it('code_outline schema: offset/limit present, sort key documented', () => {
       assertPaginationSchema(codeOutlineDefinition, 'code_outline', 'modification time');
     });

     it('review_changes schema: offset/limit present, sort key documented', () => {
       assertPaginationSchema(reviewChangesDefinition, 'review_changes', 'severity');
     });

     it('run_code_review schema: offset/limit present, sort key documented', () => {
       assertPaginationSchema(runCodeReviewDefinition, 'run_code_review', 'severity');
     });

     it('gather_context schema: offset/limit/section present', () => {
       const props = gatherContextDefinition.inputSchema.properties as Record<
         string,
         { type?: string; enum?: string[] }
       >;
       expect(props).toHaveProperty('offset');
       expect(props).toHaveProperty('limit');
       expect(props).toHaveProperty('section');
       expect(props.offset.type).toBe('number');
       expect(props.limit.type).toBe('number');
       expect(props.section.enum).toEqual(['graphContext', 'learnings', 'sessionSections']);
     });

     it('get_decay_trends schema: offset/limit present, sort key documented', () => {
       assertPaginationSchema(getDecayTrendsDefinition, 'get_decay_trends', 'decay magnitude');
     });
   });

   // ── Part 2: Multi-page fetch (agent-style) ─────────────────────────────

   describe('multi-page fetch — query_graph', () => {
     it('page 1 with limit=2 returns hasMore=true when graph has >2 nodes', async () => {
       await createTestGraph(tmpDir);
       const page1 = await handleQueryGraph({
         path: tmpDir,
         rootNodeIds: ['file:a.ts'],
         limit: 2,
       });

       expect(page1.isError).toBeUndefined();
       const data1 = JSON.parse(page1.content[0].text);
       expect(data1.nodes).toHaveLength(2);
       expect(data1.pagination.offset).toBe(0);
       expect(data1.pagination.limit).toBe(2);
       expect(data1.pagination.hasMore).toBe(true);
     });

     it('page 2 (offset=2, limit=2) returns non-overlapping nodes vs page 1', async () => {
       await createTestGraph(tmpDir);

       const page1 = await handleQueryGraph({
         path: tmpDir,
         rootNodeIds: ['file:a.ts'],
         limit: 2,
       });
       const data1 = JSON.parse(page1.content[0].text);
       const page1Ids = new Set(data1.nodes.map((n: { id: string }) => n.id));

       const page2 = await handleQueryGraph({
         path: tmpDir,
         rootNodeIds: ['file:a.ts'],
         offset: 2,
         limit: 2,
       });
       expect(page2.isError).toBeUndefined();
       const data2 = JSON.parse(page2.content[0].text);

       // page 2 offset is reported correctly
       expect(data2.pagination.offset).toBe(2);

       // No node id overlap between page 1 and page 2
       for (const node of data2.nodes as Array<{ id: string }>) {
         expect(page1Ids.has(node.id)).toBe(false);
       }
     });

     it('all pages combined cover the full node set', async () => {
       await createTestGraph(tmpDir);

       // Fetch all nodes in one call to know total
       const allResult = await handleQueryGraph({
         path: tmpDir,
         rootNodeIds: ['file:a.ts'],
         limit: 100,
       });
       const allData = JSON.parse(allResult.content[0].text);
       const totalNodes: number = allData.pagination.total;

       // Now page through with limit=2 and collect all ids
       const collectedIds = new Set<string>();
       let offset = 0;
       let hasMore = true;
       while (hasMore) {
         const result = await handleQueryGraph({
           path: tmpDir,
           rootNodeIds: ['file:a.ts'],
           offset,
           limit: 2,
         });
         const data = JSON.parse(result.content[0].text);
         for (const node of data.nodes as Array<{ id: string }>) {
           collectedIds.add(node.id);
         }
         hasMore = data.pagination.hasMore;
         offset += 2;
       }

       expect(collectedIds.size).toBe(totalNodes);
     });
   });

   describe('multi-page fetch — get_relationships', () => {
     it('page 1 with limit=1 returns hasMore=true when node has >1 outbound edge', async () => {
       await createTestGraph(tmpDir);
       const page1 = await handleGetRelationships({
         path: tmpDir,
         nodeId: 'file:a.ts',
         direction: 'outbound',
         limit: 1,
       });

       expect(page1.isError).toBeUndefined();
       const data1 = JSON.parse(page1.content[0].text);
       expect(data1.edges).toHaveLength(1);
       expect(data1.pagination.offset).toBe(0);
       expect(data1.pagination.limit).toBe(1);
       // a.ts has 3 outbound edges, so hasMore must be true
       expect(data1.pagination.hasMore).toBe(true);
     });

     it('page 2 (offset=1, limit=1) returns a different edge than page 1', async () => {
       await createTestGraph(tmpDir);

       const page1 = await handleGetRelationships({
         path: tmpDir,
         nodeId: 'file:a.ts',
         direction: 'outbound',
         limit: 1,
       });
       const data1 = JSON.parse(page1.content[0].text);
       const page1EdgeTo = data1.edges[0].to;

       const page2 = await handleGetRelationships({
         path: tmpDir,
         nodeId: 'file:a.ts',
         direction: 'outbound',
         offset: 1,
         limit: 1,
       });
       expect(page2.isError).toBeUndefined();
       const data2 = JSON.parse(page2.content[0].text);

       expect(data2.pagination.offset).toBe(1);
       expect(data2.edges).toHaveLength(1);
       // The edge on page 2 must be a different edge than page 1
       expect(data2.edges[0].to).not.toBe(page1EdgeTo);
     });

     it('all pages combined cover the complete edge set', async () => {
       await createTestGraph(tmpDir);

       const allResult = await handleGetRelationships({
         path: tmpDir,
         nodeId: 'file:a.ts',
         direction: 'outbound',
         limit: 100,
       });
       const allData = JSON.parse(allResult.content[0].text);
       const totalEdges: number = allData.pagination.total;

       const collectedEdges = new Set<string>();
       let offset = 0;
       let hasMore = true;
       while (hasMore) {
         const result = await handleGetRelationships({
           path: tmpDir,
           nodeId: 'file:a.ts',
           direction: 'outbound',
           offset,
           limit: 1,
         });
         const data = JSON.parse(result.content[0].text);
         for (const edge of data.edges as Array<{ from: string; to: string }>) {
           collectedEdges.add(`${edge.from}->${edge.to}`);
         }
         hasMore = data.pagination.hasMore;
         offset += 1;
       }

       expect(collectedEdges.size).toBe(totalEdges);
     });
   });
   ```

2. Run the test to observe it fail (module resolution is expected to pass since all imports exist,
   but verify the test file is syntactically valid):
   ```
   cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/mcp/tools/pagination-integration.test.ts 2>&1 | tail -30
   ```
3. Run `harness validate`
4. Commit: `test(mcp): add phase-5 pagination integration tests — schema completeness and multi-page fetch`

---

### Task 2: Fix any schema assertion failures discovered in Task 1

**Depends on:** Task 1 (run tests first to discover actual failures)
**Files:** Any tool definition file that fails the schema assertions

This task is conditional. If all schema assertions in Task 1 pass, skip to Task 3.

If any assertion fails, the fix is:

- Open the failing tool's definition file.
- Locate the `offset` or `limit` property in `inputSchema.properties`.
- Add or update the `description` field to include the sort key name and a "Default: N" phrase.
- Example of a compliant description:
  `"Number of items to skip (pagination). Default: 0. Items are sorted by <sort key> desc."`
- Re-run the test to confirm it passes.
- Run `harness validate`
- Commit: `fix(<tool-name>): add sort-key and default to offset/limit schema descriptions`

Tool files to check if failures occur (all were verified by inspection in Phase 4 of this plan,
but execution may reveal edge cases in the `assertPaginationSchema` helper's exact string
matching):

- `packages/cli/src/mcp/tools/graph/query-graph.ts` (sort key: "connectivity")
- `packages/cli/src/mcp/tools/graph/get-relationships.ts` (sort key: "weight")
- `packages/cli/src/mcp/tools/graph/detect-anomalies.ts` (sort key: "Z-score")
- `packages/cli/src/mcp/tools/code-nav.ts` (sort key: "modification time")
- `packages/cli/src/mcp/tools/review-changes.ts` (sort key: "severity")
- `packages/cli/src/mcp/tools/review-pipeline.ts` (sort key: "severity")
- `packages/cli/src/mcp/tools/decay-trends.ts` (sort key: "decay magnitude")

---

### Task 3: Run full test suite and confirm green

**Depends on:** Task 2
**Files:** none (verification only)

1. Run:
   ```
   cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/mcp/tools/pagination-integration.test.ts 2>&1 | tail -20
   ```
2. Verify: all tests pass, no failures.
3. Run `harness validate`
4. No commit needed — this is a verification step.

[checkpoint:human-verify] — Confirm the integration test output before marking Phase 5 complete.
Show the test output to verify:

- All schema completeness assertions pass (8 tools x offset/limit/sort-key)
- `query_graph` multi-page fetch: page 1 has hasMore=true, page 2 returns different nodes,
  all pages combined cover full set
- `get_relationships` multi-page fetch: same pattern across 3 edges

---

## Observable Truth Traceability

| Observable Truth                                   | Delivered by                                       |
| -------------------------------------------------- | -------------------------------------------------- |
| All 8 schemas have offset/limit with sort-key docs | Task 1 (schema assertions), Task 2 (fix if needed) |
| gather_context has section param                   | Task 1 (schema assertion)                          |
| query_graph multi-page fetch works                 | Task 1 (multi-page fetch tests)                    |
| get_relationships multi-page fetch works           | Task 1 (multi-page fetch tests)                    |
| Tests pass                                         | Task 3                                             |
| harness validate passes                            | Every task                                         |
