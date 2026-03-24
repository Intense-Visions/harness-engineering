# Plan: NLQ MCP Tool (`ask_graph`)

**Date:** 2026-03-23
**Spec:** docs/changes/natural-language-graph-queries/proposal.md (Phase 7)
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Goal

Register the `ask_graph` MCP tool in the CLI package so that Claude Code and Gemini CLI can call `askGraph()` from the graph package via the MCP server.

## Observable Truths (Acceptance Criteria)

1. When the MCP server starts, the `ask_graph` tool appears in the tool list with name `ask_graph`, two required properties (`path`, `question`), and a description mentioning natural language questions.
2. When `handleAskGraph` is called with a valid `path` (containing a graph) and `question`, the system shall return a JSON text content block containing `intent`, `intentConfidence`, `entities`, `summary`, and `data` fields.
3. When `handleAskGraph` is called with a `path` that has no graph, the system shall return the standard `graphNotFoundError()` response with `isError: true`.
4. When `handleAskGraph` is called and `askGraph()` throws, the system shall return an error content block with the error message and `isError: true`.
5. The server test at `packages/cli/tests/mcp/server.test.ts` passes with the updated tool count (43) and `ask_graph` in the tool list.
6. `npx vitest run packages/cli/tests/mcp/tools/graph-ask.test.ts` passes with all tests green.
7. `harness validate` passes.

## File Map

- MODIFY `packages/cli/src/mcp/tools/graph.ts` (add `askGraphDefinition` and `handleAskGraph`)
- MODIFY `packages/cli/src/mcp/server.ts` (import and register the new tool)
- CREATE `packages/cli/tests/mcp/tools/graph-ask.test.ts` (handler tests)
- MODIFY `packages/cli/tests/mcp/server.test.ts` (update tool count from 42 to 43, add `ask_graph` assertion)

## Tasks

### Task 1: Add `askGraphDefinition` and `handleAskGraph` to graph tools

**Depends on:** none
**Files:** `packages/cli/src/mcp/tools/graph.ts`

1. Open `packages/cli/src/mcp/tools/graph.ts`.

2. At the end of the file (after the `handleDetectAnomalies` function, before the closing), add the following code block:

   ```typescript
   // ── ask_graph ──────────────────────────────────────────────────────

   export const askGraphDefinition = {
     name: 'ask_graph',
     description:
       'Ask a natural language question about the codebase knowledge graph. ' +
       'Supports questions about impact ("what breaks if I change X?"), ' +
       'finding entities ("where is the auth middleware?"), ' +
       'relationships ("what calls UserService?"), ' +
       'explanations ("what is GraphStore?"), ' +
       'and anomalies ("what looks wrong?"). ' +
       'Returns a human-readable summary and raw graph data.',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: { type: 'string', description: 'Path to project root' },
         question: { type: 'string', description: 'Natural language question about the codebase' },
       },
       required: ['path', 'question'],
     },
   };

   export async function handleAskGraph(input: { path: string; question: string }) {
     try {
       const projectPath = sanitizePath(input.path);
       const store = await loadGraphStore(projectPath);
       if (!store) return graphNotFoundError();

       const { askGraph } = await import('@harness-engineering/graph');
       const result = await askGraph(store, input.question);

       return {
         content: [{ type: 'text' as const, text: JSON.stringify(result) }],
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

3. Run: `harness validate`
4. Commit: `feat(mcp): add askGraphDefinition and handleAskGraph to graph tools`

### Task 2: Register `ask_graph` in MCP server and update server test

**Depends on:** Task 1
**Files:** `packages/cli/src/mcp/server.ts`, `packages/cli/tests/mcp/server.test.ts`

1. In `packages/cli/src/mcp/server.ts`, update the import from `./tools/graph.js` to also include `askGraphDefinition` and `handleAskGraph`:

   Change:

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
   } from './tools/graph.js';
   ```

   To:

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
   } from './tools/graph.js';
   ```

2. In the `TOOL_DEFINITIONS` array, add `askGraphDefinition` after `detectAnomaliesDefinition`:

   Change:

   ```typescript
     detectAnomaliesDefinition,
     checkTaskIndependenceDefinition,
   ```

   To:

   ```typescript
     detectAnomaliesDefinition,
     askGraphDefinition,
     checkTaskIndependenceDefinition,
   ```

3. In the `TOOL_HANDLERS` record, add the `ask_graph` handler after `detect_anomalies`:

   Change:

   ```typescript
     detect_anomalies: handleDetectAnomalies as ToolHandler,
     check_task_independence: handleCheckTaskIndependence as ToolHandler,
   ```

   To:

   ```typescript
     detect_anomalies: handleDetectAnomalies as ToolHandler,
     ask_graph: handleAskGraph as ToolHandler,
     check_task_independence: handleCheckTaskIndependence as ToolHandler,
   ```

4. In `packages/cli/tests/mcp/server.test.ts`, update the tool count assertion:

   Change:

   ```typescript
   it('registers all 42 tools', () => {
     const tools = getToolDefinitions();
     expect(tools).toHaveLength(42);
   });
   ```

   To:

   ```typescript
   it('registers all 43 tools', () => {
     const tools = getToolDefinitions();
     expect(tools).toHaveLength(43);
   });
   ```

5. In the same test file, add `ask_graph` to the graph tools assertion:

   Change:

   ```typescript
   it('registers graph tools', () => {
     const names = getToolDefinitions().map((t) => t.name);
     expect(names).toContain('query_graph');
     expect(names).toContain('search_similar');
     expect(names).toContain('find_context_for');
     expect(names).toContain('get_relationships');
     expect(names).toContain('get_impact');
     expect(names).toContain('ingest_source');
   });
   ```

   To:

   ```typescript
   it('registers graph tools', () => {
     const names = getToolDefinitions().map((t) => t.name);
     expect(names).toContain('query_graph');
     expect(names).toContain('search_similar');
     expect(names).toContain('find_context_for');
     expect(names).toContain('get_relationships');
     expect(names).toContain('get_impact');
     expect(names).toContain('ingest_source');
     expect(names).toContain('ask_graph');
   });
   ```

6. Run: `npx vitest run packages/cli/tests/mcp/server.test.ts`
7. Run: `harness validate`
8. Commit: `feat(mcp): register ask_graph tool in MCP server`

### Task 3: Create handler tests for `handleAskGraph`

**Depends on:** Task 1
**Files:** `packages/cli/tests/mcp/tools/graph-ask.test.ts`

1. Create `packages/cli/tests/mcp/tools/graph-ask.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as os from 'os';
   import * as path from 'path';
   import * as fs from 'fs/promises';
   import { handleAskGraph, askGraphDefinition } from '../../../src/mcp/tools/graph.js';

   let tmpDir: string;

   async function createTestGraph(dir: string) {
     const { GraphStore } = await import('@harness-engineering/graph');
     const store = new GraphStore();

     store.addNode({
       id: 'file:src/index.ts',
       type: 'file',
       name: 'index.ts',
       path: 'src/index.ts',
       metadata: {},
     });
     store.addNode({
       id: 'file:src/utils.ts',
       type: 'file',
       name: 'utils.ts',
       path: 'src/utils.ts',
       metadata: {},
     });
     store.addNode({
       id: 'fn:hello',
       type: 'function',
       name: 'hello',
       path: 'src/index.ts',
       metadata: {},
     });
     store.addNode({
       id: 'class:UserService',
       type: 'class',
       name: 'UserService',
       path: 'src/index.ts',
       metadata: {},
     });

     store.addEdge({ from: 'file:src/index.ts', to: 'fn:hello', type: 'contains' });
     store.addEdge({ from: 'file:src/index.ts', to: 'class:UserService', type: 'contains' });
     store.addEdge({ from: 'file:src/index.ts', to: 'file:src/utils.ts', type: 'imports' });

     const graphDir = path.join(dir, '.harness', 'graph');
     await store.save(graphDir);
     return store;
   }

   function parseResult(result: { content: { text: string }[] }) {
     return JSON.parse(result.content[0].text);
   }

   beforeEach(async () => {
     tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ask-graph-test-'));
   });

   afterEach(async () => {
     await fs.rm(tmpDir, { recursive: true, force: true });
   });

   // ── Definition tests ──────────────────────────────────────────────

   describe('ask_graph definition', () => {
     it('has correct name', () => {
       expect(askGraphDefinition.name).toBe('ask_graph');
     });

     it('requires path and question', () => {
       expect(askGraphDefinition.inputSchema.required).toEqual(['path', 'question']);
     });

     it('has path and question properties', () => {
       const props = askGraphDefinition.inputSchema.properties;
       expect(props).toHaveProperty('path');
       expect(props).toHaveProperty('question');
       expect(props.path.type).toBe('string');
       expect(props.question.type).toBe('string');
     });

     it('description mentions natural language', () => {
       expect(askGraphDefinition.description).toContain('natural language');
     });
   });

   // ── Handler tests ─────────────────────────────────────────────────

   describe('handleAskGraph', () => {
     it('returns AskGraphResult with all expected fields', async () => {
       await createTestGraph(tmpDir);
       const result = await handleAskGraph({
         path: tmpDir,
         question: 'what is UserService?',
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);
       expect(data).toHaveProperty('intent');
       expect(data).toHaveProperty('intentConfidence');
       expect(data).toHaveProperty('entities');
       expect(data).toHaveProperty('summary');
       expect(data).toHaveProperty('data');
       expect(typeof data.summary).toBe('string');
       expect(data.summary.length).toBeGreaterThan(0);
     });

     it('returns error when graph does not exist', async () => {
       const result = await handleAskGraph({
         path: tmpDir,
         question: 'what is UserService?',
       });

       expect(result.isError).toBe(true);
       expect(result.content[0].text).toContain('No graph found');
     });

     it('handles impact questions', async () => {
       await createTestGraph(tmpDir);
       const result = await handleAskGraph({
         path: tmpDir,
         question: 'what breaks if I change UserService?',
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);
       expect(data.intent).toBe('impact');
     });

     it('handles find questions', async () => {
       await createTestGraph(tmpDir);
       const result = await handleAskGraph({
         path: tmpDir,
         question: 'where is the hello function?',
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);
       expect(data.intent).toBe('find');
     });

     it('handles anomaly questions', async () => {
       await createTestGraph(tmpDir);
       const result = await handleAskGraph({
         path: tmpDir,
         question: 'what looks wrong?',
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);
       expect(data.intent).toBe('anomaly');
     });

     it('returns suggestions for ambiguous questions', async () => {
       await createTestGraph(tmpDir);
       const result = await handleAskGraph({
         path: tmpDir,
         question: 'hmm',
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);
       expect(data.suggestions).toBeDefined();
       expect(data.suggestions.length).toBeGreaterThan(0);
     });
   });
   ```

2. Run: `npx vitest run packages/cli/tests/mcp/tools/graph-ask.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(mcp): add handler tests for ask_graph tool`
