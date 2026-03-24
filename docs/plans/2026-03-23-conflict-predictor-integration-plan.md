# Plan: Conflict Predictor Integration (Phases 3-6)

**Date:** 2026-03-23
**Spec:** docs/changes/conflict-prediction/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Wire the existing `ConflictPredictor` class into the MCP server as `predict_conflicts`, add tests, update the parallel-agents skill, and export from index files.

## Observable Truths (Acceptance Criteria)

1. When calling `predict_conflicts` via MCP with two tasks sharing a file, the tool returns a `ConflictPrediction` JSON with high-severity conflict and regrouped groups.
2. When calling `predict_conflicts` in summary mode, overlap details are stripped from conflict entries.
3. When calling `predict_conflicts` without a graph, the tool returns file-only analysis with degraded verdict.
4. The MCP server registers 45 tools (up from 44) and the tool name `predict_conflicts` appears in `getToolDefinitions()`.
5. `npx vitest run packages/cli/tests/mcp/tools/conflict-prediction.test.ts` passes with 10+ tests.
6. `npx vitest run packages/cli/tests/mcp/server.test.ts` passes (tool count updated to 45).
7. The `harness-parallel-agents/SKILL.md` step 1 references `predict_conflicts` with fallback to `check_task_independence`.
8. `ConflictPredictor`, `ConflictSeverity`, `ConflictDetail`, and `ConflictPrediction` are exported from `packages/graph/src/independence/index.ts` and `packages/graph/src/index.ts`.
9. `harness validate` passes.

## File Map

- CREATE `packages/cli/src/mcp/tools/conflict-prediction.ts`
- CREATE `packages/cli/tests/mcp/tools/conflict-prediction.test.ts`
- MODIFY `packages/cli/src/mcp/server.ts` (add import, definition, handler)
- MODIFY `packages/cli/tests/mcp/server.test.ts` (tool count 44 -> 45)
- MODIFY `packages/cli/tests/mcp/server-integration.test.ts` (tool count 42 -> 43, add `predict_conflicts` check)
- MODIFY `agents/skills/claude-code/harness-parallel-agents/SKILL.md` (update step 1)
- MODIFY `packages/graph/src/independence/index.ts` (add ConflictPredictor exports)
- MODIFY `packages/graph/src/index.ts` (add ConflictPredictor exports)

## Tasks

### Task 1: Create MCP tool handler and register in server

**Depends on:** none
**Files:** `packages/cli/src/mcp/tools/conflict-prediction.ts`, `packages/cli/src/mcp/server.ts`, `packages/cli/tests/mcp/server.test.ts`, `packages/cli/tests/mcp/server-integration.test.ts`

1. Create `packages/cli/src/mcp/tools/conflict-prediction.ts`:

   ```typescript
   import { loadGraphStore } from '../utils/graph-loader.js';
   import { sanitizePath } from '../utils/sanitize-path.js';

   // ── predict_conflicts ────────────────────────────────────────────

   export const predictConflictsDefinition = {
     name: 'predict_conflicts',
     description:
       'Predict conflict severity for task pairs with automatic parallel group recomputation. Returns severity-classified conflicts, revised groups, and human-readable reasoning.',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: { type: 'string', description: 'Path to project root' },
         tasks: {
           type: 'array',
           items: {
             type: 'object',
             properties: {
               id: { type: 'string' },
               files: { type: 'array', items: { type: 'string' } },
             },
             required: ['id', 'files'],
           },
           minItems: 2,
           description: 'Tasks to check. Each task has an id and a list of file paths.',
         },
         depth: {
           type: 'number',
           description: 'Expansion depth (0=file-only, 1=default, 2-3=thorough)',
         },
         edgeTypes: {
           type: 'array',
           items: { type: 'string' },
           description: 'Edge types for graph expansion. Default: imports, calls, references',
         },
         mode: {
           type: 'string',
           enum: ['summary', 'detailed'],
           description: 'summary omits overlap details from conflicts. Default: detailed',
         },
       },
       required: ['path', 'tasks'],
     },
   };

   export async function handlePredictConflicts(input: {
     path: string;
     tasks: Array<{ id: string; files: string[] }>;
     depth?: number;
     edgeTypes?: string[];
     mode?: 'summary' | 'detailed';
   }) {
     try {
       const projectPath = sanitizePath(input.path);

       // Graceful degradation: load graph but do not error if absent
       const store = await loadGraphStore(projectPath);

       const { ConflictPredictor } = await import('@harness-engineering/graph');
       const predictor = new ConflictPredictor(store ?? undefined);

       const result = predictor.predict({
         tasks: input.tasks,
         ...(input.depth !== undefined && { depth: input.depth }),
         ...(input.edgeTypes !== undefined && { edgeTypes: input.edgeTypes }),
       });

       if (input.mode === 'summary') {
         // Strip overlap details from conflicts for summary mode
         const summaryConflicts = result.conflicts.map((c) => ({
           taskA: c.taskA,
           taskB: c.taskB,
           severity: c.severity,
           reason: c.reason,
           mitigation: c.mitigation,
         }));

         return {
           content: [
             {
               type: 'text' as const,
               text: JSON.stringify({
                 mode: 'summary',
                 tasks: result.tasks,
                 analysisLevel: result.analysisLevel,
                 depth: result.depth,
                 conflicts: summaryConflicts,
                 groups: result.groups,
                 summary: result.summary,
                 verdict: result.verdict,
               }),
             },
           ],
         };
       }

       // Detailed mode (default): return full result
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

2. Add import to `packages/cli/src/mcp/server.ts` after the `task-independence` import (line 113):

   ```typescript
   import {
     predictConflictsDefinition,
     handlePredictConflicts,
   } from './tools/conflict-prediction.js';
   ```

3. Add `predictConflictsDefinition` to `TOOL_DEFINITIONS` array after `checkTaskIndependenceDefinition` (line 167).

4. Add `predict_conflicts: handlePredictConflicts as ToolHandler,` to `TOOL_HANDLERS` after `check_task_independence` entry (line 213).

5. Update `packages/cli/tests/mcp/server.test.ts` line 16: change `toHaveLength(44)` to `toHaveLength(45)`.

6. Update `packages/cli/tests/mcp/server-integration.test.ts`:
   - After line 43 (`expect(names).toContain('check_task_independence');`), add: `expect(names).toContain('predict_conflicts');`
   - Change line 44: `toHaveLength(42)` to `toHaveLength(43)`.

7. Run: `npx vitest run packages/cli/tests/mcp/server.test.ts`
8. Run: `harness validate`
9. Commit: `feat(mcp): add predict_conflicts tool handler and server registration`

### Task 2: Create MCP tool tests

**Depends on:** Task 1
**Files:** `packages/cli/tests/mcp/tools/conflict-prediction.test.ts`

1. Create `packages/cli/tests/mcp/tools/conflict-prediction.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as os from 'os';
   import * as path from 'path';
   import * as fs from 'fs/promises';
   import {
     predictConflictsDefinition,
     handlePredictConflicts,
   } from '../../../src/mcp/tools/conflict-prediction.js';

   let tmpDir: string;

   /**
    * Create a test graph with:
    *   file:a.ts --imports--> file:b.ts --imports--> file:c.ts
    *   file:d.ts (isolated)
    */
   async function createTestGraph(dir: string) {
     const { GraphStore } = await import('@harness-engineering/graph');
     const store = new GraphStore();

     store.addNode({ id: 'file:a.ts', type: 'file', name: 'a.ts', path: 'a.ts', metadata: {} });
     store.addNode({ id: 'file:b.ts', type: 'file', name: 'b.ts', path: 'b.ts', metadata: {} });
     store.addNode({ id: 'file:c.ts', type: 'file', name: 'c.ts', path: 'c.ts', metadata: {} });
     store.addNode({ id: 'file:d.ts', type: 'file', name: 'd.ts', path: 'd.ts', metadata: {} });

     store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
     store.addEdge({ from: 'file:b.ts', to: 'file:c.ts', type: 'imports' });

     const graphDir = path.join(dir, '.harness', 'graph');
     await store.save(graphDir);
     return store;
   }

   function parseResult(result: { content: { text: string }[] }) {
     return JSON.parse(result.content[0].text);
   }

   beforeEach(async () => {
     tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conflict-prediction-test-'));
   });

   afterEach(async () => {
     await fs.rm(tmpDir, { recursive: true, force: true });
   });

   // ── Definition tests ──────────────────────────────────────────────

   describe('predict_conflicts definition', () => {
     it('has correct name', () => {
       expect(predictConflictsDefinition.name).toBe('predict_conflicts');
     });

     it('requires path and tasks parameters', () => {
       expect(predictConflictsDefinition.inputSchema.required).toEqual(['path', 'tasks']);
     });

     it('tasks schema has minItems 2', () => {
       const tasksProp = predictConflictsDefinition.inputSchema.properties.tasks;
       expect(tasksProp.minItems).toBe(2);
     });

     it('has optional depth, edgeTypes, and mode parameters', () => {
       const props = predictConflictsDefinition.inputSchema.properties;
       expect(props).toHaveProperty('depth');
       expect(props).toHaveProperty('edgeTypes');
       expect(props).toHaveProperty('mode');
       expect(props.mode.enum).toEqual(['summary', 'detailed']);
     });
   });

   // ── Handler tests ─────────────────────────────────────────────────

   describe('handlePredictConflicts', () => {
     it('returns ConflictPrediction shape with no conflicts for independent tasks', async () => {
       await createTestGraph(tmpDir);
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task2', files: ['d.ts'] },
         ],
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);
       expect(data.tasks).toEqual(['task1', 'task2']);
       expect(data.analysisLevel).toBe('graph-expanded');
       expect(data.conflicts).toHaveLength(0);
       expect(data.groups).toBeDefined();
       expect(data.summary).toEqual({ high: 0, medium: 0, low: 0, regrouped: false });
       expect(data.verdict).toBeDefined();
     });

     it('returns high-severity conflict for direct file overlap', async () => {
       await createTestGraph(tmpDir);
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task2', files: ['a.ts'] },
         ],
       });

       const data = parseResult(result);
       expect(data.conflicts).toHaveLength(1);
       expect(data.conflicts[0].severity).toBe('high');
       expect(data.conflicts[0].reason).toContain('Both tasks write to');
       expect(data.conflicts[0].reason).toContain('a.ts');
       expect(data.conflicts[0].mitigation).toContain('Serialize');
       expect(data.summary.high).toBe(1);
       expect(data.summary.regrouped).toBe(false); // both already in same group
     });

     it('returns conflict for transitive overlap via graph expansion', async () => {
       await createTestGraph(tmpDir);
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task2', files: ['b.ts'] },
         ],
       });

       const data = parseResult(result);
       expect(data.conflicts).toHaveLength(1);
       expect(data.conflicts[0].taskA).toBe('task1');
       expect(data.conflicts[0].taskB).toBe('task2');
       expect(data.conflicts[0].overlaps.length).toBeGreaterThan(0);
     });

     it('returns file-only result when graph does not exist (graceful degradation)', async () => {
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task2', files: ['b.ts'] },
         ],
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);
       expect(data.analysisLevel).toBe('file-only');
       expect(data.conflicts).toHaveLength(0);
       expect(data.verdict).toContain('Graph unavailable');
     });

     it('returns high-severity for direct overlap without graph', async () => {
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['shared.ts', 'a.ts'] },
           { id: 'task2', files: ['shared.ts', 'b.ts'] },
         ],
       });

       const data = parseResult(result);
       expect(data.conflicts).toHaveLength(1);
       expect(data.conflicts[0].severity).toBe('high');
       expect(data.conflicts[0].reason).toContain('shared.ts');
     });

     it('returns summary mode without overlap details in conflicts', async () => {
       await createTestGraph(tmpDir);
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task2', files: ['a.ts'] },
         ],
         mode: 'summary',
       });

       const data = parseResult(result);
       expect(data.mode).toBe('summary');
       expect(data.verdict).toBeDefined();
       expect(data.groups).toBeDefined();
       expect(data.summary).toBeDefined();
       expect(data.conflicts).toHaveLength(1);
       expect(data.conflicts[0]).not.toHaveProperty('overlaps');
       expect(data.conflicts[0]).toHaveProperty('severity');
       expect(data.conflicts[0]).toHaveProperty('reason');
       expect(data.conflicts[0]).toHaveProperty('mitigation');
     });

     it('returns detailed mode with full overlap details by default', async () => {
       await createTestGraph(tmpDir);
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task2', files: ['a.ts'] },
         ],
       });

       const data = parseResult(result);
       expect(data.conflicts[0].overlaps).toBeDefined();
       expect(data.conflicts[0].overlaps.length).toBeGreaterThan(0);
     });

     it('respects depth parameter (depth 0 = file-only even with graph)', async () => {
       await createTestGraph(tmpDir);
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task2', files: ['b.ts'] },
         ],
         depth: 0,
       });

       const data = parseResult(result);
       expect(data.analysisLevel).toBe('file-only');
       expect(data.depth).toBe(0);
       expect(data.conflicts).toHaveLength(0);
     });

     it('handles 4 tasks with mixed conflicts producing revised groups', async () => {
       await createTestGraph(tmpDir);
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task2', files: ['a.ts'] },
           { id: 'task3', files: ['c.ts'] },
           { id: 'task4', files: ['d.ts'] },
         ],
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);

       // task1 and task2 share a.ts — high severity
       const highConflict = data.conflicts.find((c: { severity: string }) => c.severity === 'high');
       expect(highConflict).toBeDefined();

       // Groups should reflect high-severity merging
       expect(data.groups.length).toBeGreaterThanOrEqual(2);
       expect(data.verdict).toBeDefined();
     });

     it('returns complete ConflictPrediction JSON shape', async () => {
       await createTestGraph(tmpDir);
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task2', files: ['a.ts'] },
         ],
       });

       expect(result.isError).toBeUndefined();
       const data = parseResult(result);

       // Top-level fields
       expect(data).toHaveProperty('tasks');
       expect(data).toHaveProperty('analysisLevel');
       expect(data).toHaveProperty('depth');
       expect(data).toHaveProperty('conflicts');
       expect(data).toHaveProperty('groups');
       expect(data).toHaveProperty('summary');
       expect(data).toHaveProperty('verdict');

       // Summary shape
       expect(data.summary).toHaveProperty('high');
       expect(data.summary).toHaveProperty('medium');
       expect(data.summary).toHaveProperty('low');
       expect(data.summary).toHaveProperty('regrouped');

       // Conflict shape
       const conflict = data.conflicts[0];
       expect(conflict).toHaveProperty('taskA');
       expect(conflict).toHaveProperty('taskB');
       expect(conflict).toHaveProperty('severity');
       expect(conflict).toHaveProperty('reason');
       expect(conflict).toHaveProperty('mitigation');
       expect(conflict).toHaveProperty('overlaps');
     });

     it('returns error for fewer than 2 tasks', async () => {
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [{ id: 'task1', files: ['a.ts'] }],
       });

       expect(result.isError).toBe(true);
       expect(result.content[0].text).toContain('At least 2 tasks');
     });

     it('returns error for task with empty files', async () => {
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: [] },
           { id: 'task2', files: ['b.ts'] },
         ],
       });

       expect(result.isError).toBe(true);
       expect(result.content[0].text).toContain('empty files array');
     });

     it('returns error for duplicate task IDs', async () => {
       const result = await handlePredictConflicts({
         path: tmpDir,
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task1', files: ['b.ts'] },
         ],
       });

       expect(result.isError).toBe(true);
       expect(result.content[0].text).toContain('Duplicate task ID');
     });

     it('rejects filesystem root path', async () => {
       const result = await handlePredictConflicts({
         path: '/',
         tasks: [
           { id: 'task1', files: ['a.ts'] },
           { id: 'task2', files: ['b.ts'] },
         ],
       });

       expect(result.isError).toBe(true);
       expect(result.content[0].text).toContain('filesystem root');
     });
   });
   ```

2. Run: `npx vitest run packages/cli/tests/mcp/tools/conflict-prediction.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(mcp): add predict_conflicts tool tests`

### Task 3: Update parallel-agents skill step 1

**Depends on:** none (text-only change)
**Files:** `agents/skills/claude-code/harness-parallel-agents/SKILL.md`

1. In `agents/skills/claude-code/harness-parallel-agents/SKILL.md`, replace Step 1 content.

   Replace the current step 1 intro paragraph (line 21-22):

   ```
   Before dispatching anything in parallel, verify independence using `check_task_independence`:
   ```

   With:

   ```
   Before dispatching anything in parallel, predict conflicts using `predict_conflicts` (preferred) or `check_task_independence` (fallback):
   ```

   Replace the current step 1 item 2 call description (lines 25-36) to add `predict_conflicts` as preferred:

   After the existing `check_task_independence` JSON example block, add a new block:

   ````markdown
   **Preferred: Use `predict_conflicts`** for severity-aware analysis with automatic regrouping:

   ```json
   {
     "path": "<project-root>",
     "tasks": [
       { "id": "task-a", "files": ["src/module-a/index.ts", "src/module-a/index.test.ts"] },
       { "id": "task-b", "files": ["src/module-b/index.ts", "src/module-b/index.test.ts"] }
     ],
     "depth": 1
   }
   ```
   ````

   The `predict_conflicts` tool extends independence checking with:
   - **`conflicts`**: Severity-classified conflict details with human-readable reasoning
   - **`groups`**: Revised parallel dispatch groups (high-severity conflicts force serialization)
   - **`summary`**: Conflict counts by severity and whether regrouping occurred
   - **`verdict`**: Human-readable summary including severity breakdown

   If `predict_conflicts` is unavailable, fall back to `check_task_independence`.

   ```

   Replace the current step 3 "Act on the result" (lines 43-44) with:
   ```

   3. **Act on the result.** Use the returned `groups` for dispatch. Flag any medium-severity conflicts to the coordinator. If high-severity conflicts forced regrouping (`summary.regrouped === true`), log which tasks were serialized and why. If all tasks are in one group, dispatch them all in parallel. If tasks are split across groups, dispatch each group as a separate parallel wave.

   ```

   ```

2. Run: `harness validate`
3. Commit: `docs(skills): update parallel-agents step 1 to prefer predict_conflicts`

### Task 4: Update exports in independence/index.ts and graph/index.ts

**Depends on:** none
**Files:** `packages/graph/src/independence/index.ts`, `packages/graph/src/index.ts`

1. Replace `packages/graph/src/independence/index.ts` with:

   ```typescript
   export type {
     TaskDefinition,
     IndependenceCheckParams,
     OverlapDetail,
     PairResult,
     IndependenceResult,
   } from './TaskIndependenceAnalyzer.js';
   export { TaskIndependenceAnalyzer } from './TaskIndependenceAnalyzer.js';

   export type {
     ConflictSeverity,
     ConflictDetail,
     ConflictPrediction,
   } from './ConflictPredictor.js';
   export { ConflictPredictor } from './ConflictPredictor.js';
   ```

2. In `packages/graph/src/index.ts`, after the existing Independence section (lines 127-134), add:

   ```typescript
   export { ConflictPredictor } from './independence/index.js';
   export type {
     ConflictSeverity,
     ConflictDetail,
     ConflictPrediction,
   } from './independence/index.js';
   ```

3. Run: `npx vitest run packages/graph/tests/independence/ConflictPredictor.test.ts` (verify existing tests still pass)
4. Run: `harness validate`
5. Commit: `feat(graph): export ConflictPredictor types and class from index`

## Traceability

| Observable Truth                                                            | Task(s)        |
| --------------------------------------------------------------------------- | -------------- |
| 1. predict_conflicts returns ConflictPrediction with high-severity conflict | Task 1, Task 2 |
| 2. Summary mode strips overlap details                                      | Task 1, Task 2 |
| 3. Graceful degradation without graph                                       | Task 1, Task 2 |
| 4. Server registers 45 tools including predict_conflicts                    | Task 1         |
| 5. conflict-prediction.test.ts passes with 10+ tests                        | Task 2         |
| 6. server.test.ts passes with updated count                                 | Task 1         |
| 7. Skill step 1 references predict_conflicts                                | Task 3         |
| 8. Exports available from index files                                       | Task 4         |
| 9. harness validate passes                                                  | All tasks      |
