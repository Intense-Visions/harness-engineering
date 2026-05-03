# Plan: Phase 3 — MCP Tool & NLQ Integration for Cascading Failure Simulation

**Date:** 2026-04-06
**Spec:** docs/changes/cascading-failure-simulation/proposal.md
**Estimated tasks:** 7
**Estimated time:** ~28 minutes

## Goal

Expose the `CascadeSimulator` (Phase 2) to users through a `compute_blast_radius` MCP tool and route NLQ "blast radius" / "cascade" queries to it instead of `get_impact`.

## Observable Truths (Acceptance Criteria)

1. **Event-driven:** When the MCP server receives a `compute_blast_radius` call with `{ path, file: "src/index.ts" }`, the system shall return a JSON response containing `sourceNodeId`, `layers`, `flatSummary`, and `summary` fields.
2. **Event-driven:** When `compute_blast_radius` is called with `mode: "compact"`, the system shall return `summary` stats plus the top 10 highest-risk nodes from `flatSummary` (not the full layered cascade chain).
3. **Event-driven:** When `compute_blast_radius` is called with `mode: "detailed"`, the system shall return the full layered cascade chain with all `CascadeLayer` objects.
4. **Event-driven:** When `compute_blast_radius` is called with a `file` that does not exist in the graph, the system shall return an error: `"No file node found matching path..."`.
5. **Event-driven:** When `compute_blast_radius` is called with neither `file` nor `nodeId`, the system shall return an error: `"either nodeId or file is required"`.
6. **Event-driven:** When the graph store does not exist, the system shall return `graphNotFoundError()`.
7. **Event-driven:** When a user asks "what is the blast radius of AuthService?" via `askGraph`, the system shall route to `CascadeSimulator` instead of `ContextQL` and return a `CascadeResult`-shaped `data` field.
8. **Event-driven:** When a user asks "what cascades from index.ts?" via `askGraph`, the system shall route to `CascadeSimulator`.
9. The `compute_blast_radius` tool definition appears in `TOOL_DEFINITIONS` array in `server.ts` and `handleComputeBlastRadius` appears in `TOOL_HANDLERS`.
10. `npx vitest run packages/cli/tests/mcp/tools/graph-blast-radius.test.ts` passes with all tests green.
11. `npx vitest run packages/graph/tests/nlq/askGraph.test.ts` passes (existing tests unbroken + new blast-radius routing test).
12. `harness validate` passes.

## File Map

- CREATE `packages/cli/src/mcp/tools/graph/compute-blast-radius.ts`
- MODIFY `packages/cli/src/mcp/tools/graph/index.ts` (add export)
- MODIFY `packages/cli/src/mcp/server.ts` (add import + register definition + handler)
- MODIFY `packages/graph/src/index.ts` (add `CascadeSimulator` export)
- MODIFY `packages/graph/src/nlq/index.ts` (add blast-radius/cascade routing in `executeOperation`)
- CREATE `packages/cli/tests/mcp/tools/graph-blast-radius.test.ts`
- MODIFY `packages/graph/tests/nlq/askGraph.test.ts` (add blast-radius routing test)

_Skeleton not produced -- task count (7) below threshold (8)._

## Tasks

### Task 1: Export CascadeSimulator from graph package barrel

**Depends on:** none
**Files:** `packages/graph/src/index.ts`

1. Open `packages/graph/src/index.ts`.
2. In the "Blast Radius" section (around line 150), add `CascadeSimulator` to the named export:

   ```typescript
   // Blast Radius
   export { CompositeProbabilityStrategy, CascadeSimulator } from './blast-radius/index.js';
   export type {
     ProbabilityStrategy,
     CascadeSimulationOptions,
     CascadeNode,
     CascadeLayer,
     CascadeResult,
   } from './blast-radius/index.js';
   ```

3. Run: `npx vitest run packages/graph/tests/blast-radius/CascadeSimulator.test.ts` -- confirm still passes.
4. Run: `harness validate`
5. Commit: `feat(graph): export CascadeSimulator from package barrel`

---

### Task 2: Create compute-blast-radius MCP tool definition + handler

**Depends on:** Task 1
**Files:** `packages/cli/src/mcp/tools/graph/compute-blast-radius.ts`

1. Create `packages/cli/src/mcp/tools/graph/compute-blast-radius.ts` with the following content:

   ```typescript
   import { loadGraphStore } from '../../utils/graph-loader.js';
   import { sanitizePath } from '../../utils/sanitize-path.js';
   import { graphNotFoundError } from './shared.js';

   export const computeBlastRadiusDefinition = {
     name: 'compute_blast_radius',
     description:
       'Simulate cascading failure propagation from a source node using probability-weighted BFS. Returns cumulative failure probability for each affected node.',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: { type: 'string', description: 'Path to project root' },
         file: {
           type: 'string',
           description: 'File path (relative to project root) to simulate failure for',
         },
         nodeId: { type: 'string', description: 'Node ID to simulate failure for' },
         probabilityFloor: {
           type: 'number',
           description: 'Minimum cumulative probability to continue traversal (default 0.05)',
         },
         maxDepth: {
           type: 'number',
           description: 'Maximum BFS depth (default 10)',
         },
         mode: {
           type: 'string',
           enum: ['compact', 'detailed'],
           description:
             'Response density: compact returns summary + top 10 highest-risk nodes, detailed returns full layered cascade chain. Default: compact',
         },
       },
       required: ['path'],
     },
   };

   export async function handleComputeBlastRadius(input: {
     path: string;
     file?: string;
     nodeId?: string;
     probabilityFloor?: number;
     maxDepth?: number;
     mode?: 'compact' | 'detailed';
   }) {
     try {
       if (!input.nodeId && !input.file) {
         return {
           content: [
             {
               type: 'text' as const,
               text: 'Error: either nodeId or file is required',
             },
           ],
           isError: true,
         };
       }

       const projectPath = sanitizePath(input.path);
       const store = await loadGraphStore(projectPath);
       if (!store) return graphNotFoundError();

       const { CascadeSimulator } = await import('@harness-engineering/graph');

       let targetNodeId = input.nodeId;

       // If file provided, resolve to nodeId
       if (!targetNodeId && input.file) {
         const fileNodes = store.findNodes({ type: 'file' });
         const match = fileNodes.find(
           (n) => n.path === input.file || n.id === `file:${input.file}`
         );
         if (!match) {
           return {
             content: [
               {
                 type: 'text' as const,
                 text: `Error: no file node found matching path "${input.file}"`,
               },
             ],
             isError: true,
           };
         }
         targetNodeId = match.id;
       }

       const simulator = new CascadeSimulator(store);
       const result = simulator.simulate(targetNodeId!, {
         ...(input.probabilityFloor !== undefined && {
           probabilityFloor: input.probabilityFloor,
         }),
         ...(input.maxDepth !== undefined && { maxDepth: input.maxDepth }),
       });

       if (input.mode === 'detailed') {
         return {
           content: [
             {
               type: 'text' as const,
               text: JSON.stringify({
                 mode: 'detailed',
                 sourceNodeId: result.sourceNodeId,
                 sourceName: result.sourceName,
                 layers: result.layers,
                 flatSummary: result.flatSummary,
                 summary: result.summary,
               }),
             },
           ],
         };
       }

       // compact mode (default): summary + top 10
       return {
         content: [
           {
             type: 'text' as const,
             text: JSON.stringify({
               mode: 'compact',
               sourceNodeId: result.sourceNodeId,
               sourceName: result.sourceName,
               topRisks: result.flatSummary.slice(0, 10),
               summary: result.summary,
             }),
           },
         ],
       };
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Error: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }
   }
   ```

2. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json 2>&1 | head -20` -- confirm no type errors in the new file.
3. Run: `harness validate`
4. Commit: `feat(mcp): add compute_blast_radius tool definition and handler`

---

### Task 3: Register compute_blast_radius in graph tool barrel and server.ts

**Depends on:** Task 2
**Files:** `packages/cli/src/mcp/tools/graph/index.ts`, `packages/cli/src/mcp/server.ts`

1. Add export to `packages/cli/src/mcp/tools/graph/index.ts`:

   ```typescript
   export {
     computeBlastRadiusDefinition,
     handleComputeBlastRadius,
   } from './compute-blast-radius.js';
   ```

2. In `packages/cli/src/mcp/server.ts`, add import (alongside the existing graph imports around line 94):

   ```typescript
   import {
     queryGraphDefinition,
     handleQueryGraph,
     searchSimilarDefinition,
     handleSearchSimilar,
     findContextForDefinition,
     handleFindContextFor,
     getRelationshipsDefinition,
     handleGetRelationships,
     getImpactDefinition,
     handleGetImpact,
     ingestSourceDefinition,
     handleIngestSource,
     detectAnomaliesDefinition,
     handleDetectAnomalies,
     askGraphDefinition,
     handleAskGraph,
     computeBlastRadiusDefinition,
     handleComputeBlastRadius,
   } from './tools/graph/index.js';
   ```

3. Add `computeBlastRadiusDefinition` to the `TOOL_DEFINITIONS` array (after `recommendSkillsDefinition`, around line 201):

   ```typescript
   recommendSkillsDefinition,
   computeBlastRadiusDefinition,
   ```

4. Add handler to `TOOL_HANDLERS` record (after `recommend_skills`, around line 256):

   ```typescript
   recommend_skills: handleRecommendSkills as ToolHandler,
   compute_blast_radius: handleComputeBlastRadius as ToolHandler,
   ```

5. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json 2>&1 | head -20` -- confirm clean.
6. Run: `harness validate`
7. Commit: `feat(mcp): register compute_blast_radius in server tool definitions`

---

### Task 4: Write MCP tool integration tests

**Depends on:** Task 3
**Files:** `packages/cli/tests/mcp/tools/graph-blast-radius.test.ts`

1. Create `packages/cli/tests/mcp/tools/graph-blast-radius.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as os from 'os';
   import * as path from 'path';
   import * as fs from 'fs/promises';
   import {
     handleComputeBlastRadius,
     computeBlastRadiusDefinition,
   } from '../../../src/mcp/tools/graph/index.js';

   let tmpDir: string;

   async function createBlastRadiusTestGraph(dir: string) {
     const { GraphStore } = await import('@harness-engineering/graph');
     const store = new GraphStore();

     // Chain: A -> B -> C -> D (imports edges)
     // Branch: B -> E (imports)
     store.addNode({
       id: 'file:a.ts',
       type: 'file',
       name: 'a.ts',
       path: 'src/a.ts',
       metadata: {},
     });
     store.addNode({
       id: 'file:b.ts',
       type: 'file',
       name: 'b.ts',
       path: 'src/b.ts',
       metadata: {},
     });
     store.addNode({
       id: 'file:c.ts',
       type: 'file',
       name: 'c.ts',
       path: 'src/c.ts',
       metadata: {},
     });
     store.addNode({
       id: 'file:d.ts',
       type: 'file',
       name: 'd.ts',
       path: 'src/d.ts',
       metadata: {},
     });
     store.addNode({
       id: 'file:e.ts',
       type: 'file',
       name: 'e.ts',
       path: 'src/e.ts',
       metadata: {},
     });
     store.addNode({
       id: 'test:a.test.ts',
       type: 'test_result',
       name: 'a.test.ts',
       path: 'tests/a.test.ts',
       metadata: {},
     });

     store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
     store.addEdge({ from: 'file:b.ts', to: 'file:c.ts', type: 'imports' });
     store.addEdge({ from: 'file:c.ts', to: 'file:d.ts', type: 'imports' });
     store.addEdge({ from: 'file:b.ts', to: 'file:e.ts', type: 'imports' });
     store.addEdge({
       from: 'test:a.test.ts',
       to: 'file:a.ts',
       type: 'references',
     });

     const graphDir = path.join(dir, '.harness', 'graph');
     await store.save(graphDir);
     return store;
   }

   function parseResult(result: { content: { text: string }[] }) {
     return JSON.parse(result.content[0].text);
   }

   beforeEach(async () => {
     tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blast-radius-test-'));
   });

   afterEach(async () => {
     await fs.rm(tmpDir, { recursive: true, force: true });
   });

   // -- Definition tests --

   describe('compute_blast_radius definition', () => {
     it('has correct name', () => {
       expect(computeBlastRadiusDefinition.name).toBe('compute_blast_radius');
     });

     it('requires path parameter', () => {
       expect(computeBlastRadiusDefinition.inputSchema.required).toEqual(['path']);
     });

     it('has file, nodeId, probabilityFloor, maxDepth, mode as optional parameters', () => {
       const props = computeBlastRadiusDefinition.inputSchema.properties;
       expect(props).toHaveProperty('file');
       expect(props).toHaveProperty('nodeId');
       expect(props).toHaveProperty('probabilityFloor');
       expect(props).toHaveProperty('maxDepth');
       expect(props).toHaveProperty('mode');
     });
   });

   // -- Handler tests --

   describe('handleComputeBlastRadius', () => {
     it('returns error when neither nodeId nor file provided', async () => {
       const result = await handleComputeBlastRadius({ path: tmpDir });
       expect(result.isError).toBe(true);
       expect(result.content[0].text).toContain('either nodeId or file is required');
     });

     it('returns error when graph does not exist', async () => {
       const result = await handleComputeBlastRadius({
         path: tmpDir,
         nodeId: 'file:a.ts',
       });
       expect(result.isError).toBe(true);
       expect(result.content[0].text).toContain('No graph found');
     });

     it('returns error when file not found in graph', async () => {
       await createBlastRadiusTestGraph(tmpDir);
       const result = await handleComputeBlastRadius({
         path: tmpDir,
         file: 'nonexistent.ts',
       });
       expect(result.isError).toBe(true);
       expect(result.content[0].text).toContain('no file node found matching path');
     });

     it('returns compact result by default with summary and topRisks', async () => {
       await createBlastRadiusTestGraph(tmpDir);
       const result = await handleComputeBlastRadius({
         path: tmpDir,
         nodeId: 'file:a.ts',
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);
       expect(data.mode).toBe('compact');
       expect(data.sourceNodeId).toBe('file:a.ts');
       expect(data).toHaveProperty('topRisks');
       expect(data).toHaveProperty('summary');
       expect(data.summary).toHaveProperty('totalAffected');
       expect(data.summary).toHaveProperty('highRisk');
       expect(data.summary).toHaveProperty('mediumRisk');
       expect(data.summary).toHaveProperty('lowRisk');
       expect(data.summary).toHaveProperty('categoryBreakdown');
       expect(data.summary.totalAffected).toBeGreaterThan(0);
       expect(Array.isArray(data.topRisks)).toBe(true);
       expect(data.topRisks.length).toBeLessThanOrEqual(10);
     });

     it('returns detailed result with full layers when mode=detailed', async () => {
       await createBlastRadiusTestGraph(tmpDir);
       const result = await handleComputeBlastRadius({
         path: tmpDir,
         nodeId: 'file:a.ts',
         mode: 'detailed',
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);
       expect(data.mode).toBe('detailed');
       expect(data).toHaveProperty('layers');
       expect(data).toHaveProperty('flatSummary');
       expect(data).toHaveProperty('summary');
       expect(Array.isArray(data.layers)).toBe(true);
       expect(data.layers.length).toBeGreaterThan(0);
       // Verify layer structure
       const firstLayer = data.layers[0];
       expect(firstLayer).toHaveProperty('depth');
       expect(firstLayer).toHaveProperty('nodes');
       expect(firstLayer).toHaveProperty('categoryBreakdown');
     });

     it('resolves file path to nodeId', async () => {
       await createBlastRadiusTestGraph(tmpDir);
       const result = await handleComputeBlastRadius({
         path: tmpDir,
         file: 'src/a.ts',
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);
       expect(data.sourceNodeId).toBe('file:a.ts');
       expect(data.summary.totalAffected).toBeGreaterThan(0);
     });

     it('respects probabilityFloor parameter', async () => {
       await createBlastRadiusTestGraph(tmpDir);

       // Very high floor: should prune most/all cascade
       const highFloor = await handleComputeBlastRadius({
         path: tmpDir,
         nodeId: 'file:a.ts',
         probabilityFloor: 0.99,
       });
       const highData = parseResult(highFloor);

       // Low floor: should include more nodes
       const lowFloor = await handleComputeBlastRadius({
         path: tmpDir,
         nodeId: 'file:a.ts',
         probabilityFloor: 0.01,
       });
       const lowData = parseResult(lowFloor);

       expect(lowData.summary.totalAffected).toBeGreaterThanOrEqual(highData.summary.totalAffected);
     });

     it('respects maxDepth parameter', async () => {
       await createBlastRadiusTestGraph(tmpDir);
       const result = await handleComputeBlastRadius({
         path: tmpDir,
         nodeId: 'file:a.ts',
         maxDepth: 1,
         mode: 'detailed',
       });

       const data = parseResult(result);
       // With maxDepth=1, only direct imports from a.ts
       for (const layer of data.layers) {
         expect(layer.depth).toBeLessThanOrEqual(1);
       }
     });
   });
   ```

2. Run: `npx vitest run packages/cli/tests/mcp/tools/graph-blast-radius.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(mcp): add integration tests for compute_blast_radius tool`

---

### Task 5: Add blast-radius / cascade routing in NLQ orchestrator

**Depends on:** Task 1
**Files:** `packages/graph/src/nlq/index.ts`

1. Add import at the top of `packages/graph/src/nlq/index.ts`:

   ```typescript
   import { CascadeSimulator } from '../blast-radius/index.js';
   ```

2. In the `executeOperation` function, modify the `'impact'` case to detect blast-radius/cascade queries and route accordingly. Replace the existing `case 'impact':` block with:

   ```typescript
   case 'impact': {
     const rootId = entities[0]!.nodeId;

     // Route "blast radius" / "cascade" queries to CascadeSimulator
     const lowerQuestion = question.toLowerCase();
     if (lowerQuestion.includes('blast radius') || lowerQuestion.includes('cascade')) {
       const simulator = new CascadeSimulator(store);
       return simulator.simulate(rootId);
     }

     const result = cql.execute({
       rootNodeIds: [rootId],
       bidirectional: true,
       maxDepth: 3,
     });

     return groupNodesByImpact(result.nodes, rootId);
   }
   ```

3. Run: `npx vitest run packages/graph/tests/nlq/askGraph.test.ts` -- confirm existing tests still pass.
4. Run: `harness validate`
5. Commit: `feat(nlq): route blast-radius and cascade queries to CascadeSimulator`

---

### Task 6: Add NLQ blast-radius routing tests

**Depends on:** Task 5
**Files:** `packages/graph/tests/nlq/askGraph.test.ts`

1. Open `packages/graph/tests/nlq/askGraph.test.ts` and add the following test cases at the end of the `describe('askGraph (integration)')` block:

   ```typescript
   it('routes "blast radius" query to CascadeSimulator', async () => {
     const result = await askGraph(store, 'what is the blast radius of AuthService?');
     expect(result.intent).toBe('impact');
     expect(result.data).not.toBeNull();
     // CascadeResult has sourceNodeId, layers, flatSummary, summary
     const data = result.data as Record<string, unknown>;
     expect(data).toHaveProperty('sourceNodeId');
     expect(data).toHaveProperty('layers');
     expect(data).toHaveProperty('flatSummary');
     expect(data).toHaveProperty('summary');
   });

   it('routes "cascade" query to CascadeSimulator', async () => {
     const result = await askGraph(store, 'what cascades from AuthService?');
     expect(result.intent).toBe('impact');
     expect(result.data).not.toBeNull();
     const data = result.data as Record<string, unknown>;
     expect(data).toHaveProperty('sourceNodeId');
     expect(data).toHaveProperty('layers');
     expect(data).toHaveProperty('flatSummary');
     expect(data).toHaveProperty('summary');
   });

   it('still routes plain impact query to ContextQL', async () => {
     const result = await askGraph(store, 'what breaks if I change AuthService?');
     expect(result.intent).toBe('impact');
     expect(result.data).not.toBeNull();
     // ContextQL/groupNodesByImpact returns { code, tests, docs, other }
     const data = result.data as Record<string, unknown>;
     expect(data).toHaveProperty('code');
     expect(data).toHaveProperty('tests');
   });
   ```

2. Run: `npx vitest run packages/graph/tests/nlq/askGraph.test.ts` -- all tests pass (existing + new).
3. Run: `harness validate`
4. Commit: `test(nlq): add blast-radius and cascade routing tests for askGraph`

---

### Task 7: Update ResponseFormatter for blast-radius impact data

**Depends on:** Task 5
**Files:** `packages/graph/src/nlq/ResponseFormatter.ts`

[checkpoint:human-verify] -- Verify that the ResponseFormatter `formatImpact` method does not crash when receiving `CascadeResult` instead of the `groupNodesByImpact` result. If it does crash, this task adds graceful handling.

1. Open `packages/graph/src/nlq/ResponseFormatter.ts` and update `formatImpact` to handle both `CascadeResult` and legacy `groupNodesByImpact` data:

   ```typescript
   private formatImpact(entityName: string, data: unknown): string {
     const d = data as Record<string, unknown>;

     // CascadeResult shape: has sourceNodeId, layers, flatSummary, summary
     if ('sourceNodeId' in d && 'summary' in d) {
       const summary = d.summary as {
         totalAffected: number;
         highRisk: number;
         mediumRisk: number;
         lowRisk: number;
       };
       return `Blast radius of **${entityName}**: ${summary.totalAffected} affected nodes (${summary.highRisk} high risk, ${summary.mediumRisk} medium, ${summary.lowRisk} low).`;
     }

     // Legacy groupNodesByImpact shape: { code, tests, docs, other }
     const code = this.safeArrayLength(d?.code);
     const tests = this.safeArrayLength(d?.tests);
     const docs = this.safeArrayLength(d?.docs);
     return `Changing **${entityName}** affects ${this.p(code, 'code file')}, ${this.p(tests, 'test')}, and ${this.p(docs, 'doc')}.`;
   }
   ```

2. Run: `npx vitest run packages/graph/tests/nlq/ResponseFormatter.test.ts` -- confirm existing tests pass.
3. Run: `npx vitest run packages/graph/tests/nlq/askGraph.test.ts` -- confirm the blast-radius routing tests produce readable summaries.
4. Run: `harness validate`
5. Commit: `feat(nlq): teach ResponseFormatter to format CascadeResult for blast-radius queries`

## Dependency Graph

```
Task 1 (export CascadeSimulator)
  ├── Task 2 (MCP tool definition) → Task 3 (register in server) → Task 4 (MCP integration tests)
  └── Task 5 (NLQ routing) → Task 6 (NLQ routing tests)
                             → Task 7 (ResponseFormatter update)
```

Tasks 2-4 and Tasks 5-7 are two independent chains that both depend only on Task 1. They can be executed in parallel by separate agents.

## Traceability

| Observable Truth                             | Delivered by Task(s) |
| -------------------------------------------- | -------------------- |
| 1. MCP tool returns CascadeResult fields     | Tasks 2, 3, 4        |
| 2. Compact mode returns summary + top 10     | Tasks 2, 4           |
| 3. Detailed mode returns full layers         | Tasks 2, 4           |
| 4. Error on missing file                     | Tasks 2, 4           |
| 5. Error on missing nodeId + file            | Tasks 2, 4           |
| 6. graphNotFoundError on missing store       | Tasks 2, 4           |
| 7. "blast radius" routes to CascadeSimulator | Tasks 5, 6           |
| 8. "cascade" routes to CascadeSimulator      | Tasks 5, 6           |
| 9. Tool registered in server.ts              | Task 3               |
| 10. MCP tests pass                           | Task 4               |
| 11. NLQ tests pass                           | Task 6               |
| 12. harness validate passes                  | All tasks            |
