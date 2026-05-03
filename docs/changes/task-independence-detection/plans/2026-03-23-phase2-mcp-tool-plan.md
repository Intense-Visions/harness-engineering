# Plan: Phase 2 — MCP Tool for Task Independence Detection

**Date:** 2026-03-23
**Spec:** docs/changes/task-independence-detection/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Expose the `TaskIndependenceAnalyzer` (from Phase 1) as a `check_task_independence` MCP tool with summary/detailed output modes and graceful degradation when the graph is unavailable.

## Observable Truths (Acceptance Criteria)

1. When `check_task_independence` is called with 2+ tasks and a valid project path containing a graph, the tool returns an `IndependenceResult` with `analysisLevel: 'graph-expanded'`, pairwise results, groups, and a verdict.
2. When `check_task_independence` is called with a project path that has no graph, the tool returns a result with `analysisLevel: 'file-only'` (graceful degradation — no error).
3. When `mode` is `'summary'`, the tool returns `verdict`, `groups`, and pair verdicts (with `independent` boolean) but omits `overlaps` detail arrays from each pair.
4. When `mode` is `'detailed'` (or omitted), the tool returns the full `IndependenceResult` including overlap details with `type` and `via` fields.
5. When fewer than 2 tasks are provided, the tool returns `isError: true` with a descriptive message.
6. When a task has an empty files array, the tool returns `isError: true` with a descriptive message.
7. The tool definition appears in `TOOL_DEFINITIONS` in `server.ts` and `handleCheckTaskIndependence` appears in `TOOL_HANDLERS`.
8. `npx vitest run packages/cli/tests/mcp/tools/task-independence.test.ts` passes with 8+ tests covering: definition schema, handler with graph, handler without graph, summary mode, detailed mode, validation errors, custom depth, custom edgeTypes.
9. `harness validate` passes.

## File Map

- CREATE `packages/cli/src/mcp/tools/task-independence.ts`
- MODIFY `packages/cli/src/mcp/server.ts` (add import + registration)
- CREATE `packages/cli/tests/mcp/tools/task-independence.test.ts`

## Tasks

### Task 1: Create MCP tool definition and handler

**Depends on:** none (Phase 1 complete — `TaskIndependenceAnalyzer` exists and is exported)
**Files:** `packages/cli/src/mcp/tools/task-independence.ts`

1. Create `packages/cli/src/mcp/tools/task-independence.ts`:

```typescript
import { loadGraphStore } from '../utils/graph-loader.js';
import { sanitizePath } from '../utils/sanitize-path.js';

// ── check_task_independence ─────────────────────────────────────────

export const checkTaskIndependenceDefinition = {
  name: 'check_task_independence',
  description:
    'Check whether N tasks can safely run in parallel by detecting file overlaps and transitive dependency conflicts. Returns pairwise independence matrix and parallel groupings.',
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
        description: 'summary omits overlap details. Default: detailed',
      },
    },
    required: ['path', 'tasks'],
  },
};

export async function handleCheckTaskIndependence(input: {
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

    const { TaskIndependenceAnalyzer } = await import('@harness-engineering/graph');
    const analyzer = new TaskIndependenceAnalyzer(store ?? undefined);

    const result = analyzer.analyze({
      tasks: input.tasks,
      ...(input.depth !== undefined && { depth: input.depth }),
      ...(input.edgeTypes !== undefined && { edgeTypes: input.edgeTypes }),
    });

    if (input.mode === 'summary') {
      // Strip overlap details from pairs for summary mode
      const summaryPairs = result.pairs.map((p) => ({
        taskA: p.taskA,
        taskB: p.taskB,
        independent: p.independent,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              mode: 'summary',
              verdict: result.verdict,
              analysisLevel: result.analysisLevel,
              depth: result.depth,
              groups: result.groups,
              pairs: summaryPairs,
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

2. Run: `harness validate`
3. Commit: `feat(mcp): add check_task_independence tool definition and handler`

---

### Task 2: Register tool in server.ts

**Depends on:** Task 1
**Files:** `packages/cli/src/mcp/server.ts`

1. Add import at the end of the import block (after the `reviewChangesDefinition` import, around line 107):

```typescript
import {
  checkTaskIndependenceDefinition,
  handleCheckTaskIndependence,
} from './tools/task-independence.js';
```

2. Add `checkTaskIndependenceDefinition` to the `TOOL_DEFINITIONS` array (after `detectAnomaliesDefinition`, line 155):

```typescript
  detectAnomaliesDefinition,
  checkTaskIndependenceDefinition,
];
```

3. Add handler to `TOOL_HANDLERS` record (after `detect_anomalies` entry, line 198):

```typescript
  detect_anomalies: handleDetectAnomalies as ToolHandler,
  check_task_independence: handleCheckTaskIndependence as ToolHandler,
};
```

4. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json` — verify no type errors
5. Run: `harness validate`
6. Commit: `feat(mcp): register check_task_independence in server`

---

### Task 3: Create integration tests for MCP tool

**Depends on:** Task 1, Task 2
**Files:** `packages/cli/tests/mcp/tools/task-independence.test.ts`

1. Create `packages/cli/tests/mcp/tools/task-independence.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  checkTaskIndependenceDefinition,
  handleCheckTaskIndependence,
} from '../../../src/mcp/tools/task-independence.js';

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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-independence-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Definition tests ──────────────────────────────────────────────

describe('check_task_independence definition', () => {
  it('has correct name', () => {
    expect(checkTaskIndependenceDefinition.name).toBe('check_task_independence');
  });

  it('requires path and tasks parameters', () => {
    expect(checkTaskIndependenceDefinition.inputSchema.required).toEqual(['path', 'tasks']);
  });

  it('tasks schema has minItems 2', () => {
    const tasksProp = checkTaskIndependenceDefinition.inputSchema.properties.tasks;
    expect(tasksProp.minItems).toBe(2);
  });

  it('has optional depth, edgeTypes, and mode parameters', () => {
    const props = checkTaskIndependenceDefinition.inputSchema.properties;
    expect(props).toHaveProperty('depth');
    expect(props).toHaveProperty('edgeTypes');
    expect(props).toHaveProperty('mode');
    expect(props.mode.enum).toEqual(['summary', 'detailed']);
  });
});

// ── Handler tests ─────────────────────────────────────────────────

describe('handleCheckTaskIndependence', () => {
  it('returns graph-expanded result with groups and verdict when graph exists', async () => {
    await createTestGraph(tmpDir);
    const result = await handleCheckTaskIndependence({
      path: tmpDir,
      tasks: [
        { id: 'task1', files: ['a.ts'] },
        { id: 'task2', files: ['d.ts'] },
      ],
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.analysisLevel).toBe('graph-expanded');
    expect(data.tasks).toEqual(['task1', 'task2']);
    expect(data.groups).toBeDefined();
    expect(data.verdict).toBeDefined();
    expect(data.pairs).toHaveLength(1);
    expect(data.pairs[0].independent).toBe(true);
  });

  it('detects transitive overlap via graph expansion', async () => {
    await createTestGraph(tmpDir);
    // task1 has a.ts (which imports b.ts), task2 has b.ts
    // At depth 1, a.ts expands to include b.ts — transitive overlap with task2
    const result = await handleCheckTaskIndependence({
      path: tmpDir,
      tasks: [
        { id: 'task1', files: ['a.ts'] },
        { id: 'task2', files: ['b.ts'] },
      ],
    });

    const data = parseResult(result);
    expect(data.pairs[0].independent).toBe(false);
    const transitiveOverlaps = data.pairs[0].overlaps.filter(
      (o: { type: string }) => o.type === 'transitive'
    );
    expect(transitiveOverlaps.length).toBeGreaterThan(0);
  });

  it('returns file-only result when graph does not exist (graceful degradation)', async () => {
    // No graph created — tmpDir has no .harness/graph
    const result = await handleCheckTaskIndependence({
      path: tmpDir,
      tasks: [
        { id: 'task1', files: ['a.ts'] },
        { id: 'task2', files: ['b.ts'] },
      ],
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.analysisLevel).toBe('file-only');
    expect(data.pairs[0].independent).toBe(true);
    expect(data.verdict).toContain('Graph unavailable');
  });

  it('detects direct file overlap without graph', async () => {
    const result = await handleCheckTaskIndependence({
      path: tmpDir,
      tasks: [
        { id: 'task1', files: ['shared.ts', 'a.ts'] },
        { id: 'task2', files: ['shared.ts', 'b.ts'] },
      ],
    });

    const data = parseResult(result);
    expect(data.pairs[0].independent).toBe(false);
    expect(data.pairs[0].overlaps[0].type).toBe('direct');
    expect(data.pairs[0].overlaps[0].file).toBe('shared.ts');
  });

  it('returns summary mode without overlap details', async () => {
    await createTestGraph(tmpDir);
    const result = await handleCheckTaskIndependence({
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
    expect(data.pairs[0]).not.toHaveProperty('overlaps');
    expect(data.pairs[0]).toHaveProperty('independent');
    expect(data.pairs[0]).toHaveProperty('taskA');
    expect(data.pairs[0]).toHaveProperty('taskB');
  });

  it('returns detailed mode with full overlap details by default', async () => {
    await createTestGraph(tmpDir);
    const result = await handleCheckTaskIndependence({
      path: tmpDir,
      tasks: [
        { id: 'task1', files: ['a.ts'] },
        { id: 'task2', files: ['a.ts'] },
      ],
    });

    const data = parseResult(result);
    expect(data.pairs[0].overlaps).toBeDefined();
    expect(data.pairs[0].overlaps.length).toBeGreaterThan(0);
    expect(data.pairs[0].overlaps[0]).toHaveProperty('type');
    expect(data.pairs[0].overlaps[0]).toHaveProperty('file');
  });

  it('respects depth parameter (depth 0 = file-only even with graph)', async () => {
    await createTestGraph(tmpDir);
    // task1 has a.ts, task2 has b.ts. At depth 0, no expansion, so they are independent.
    const result = await handleCheckTaskIndependence({
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
    expect(data.pairs[0].independent).toBe(true);
  });

  it('passes custom edgeTypes to analyzer', async () => {
    await createTestGraph(tmpDir);
    // Our graph only has 'imports' edges. Using edgeTypes: ['calls'] should find no transitive overlaps.
    const result = await handleCheckTaskIndependence({
      path: tmpDir,
      tasks: [
        { id: 'task1', files: ['a.ts'] },
        { id: 'task2', files: ['b.ts'] },
      ],
      edgeTypes: ['calls'],
    });

    const data = parseResult(result);
    expect(data.pairs[0].independent).toBe(true);
  });

  it('returns error for fewer than 2 tasks', async () => {
    const result = await handleCheckTaskIndependence({
      path: tmpDir,
      tasks: [{ id: 'task1', files: ['a.ts'] }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('At least 2 tasks');
  });

  it('returns error for task with empty files', async () => {
    const result = await handleCheckTaskIndependence({
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
    const result = await handleCheckTaskIndependence({
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
    const result = await handleCheckTaskIndependence({
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

2. Run: `npx vitest run packages/cli/tests/mcp/tools/task-independence.test.ts`
3. Observe: all 13 tests pass
4. Run: `harness validate`
5. Commit: `test(mcp): add integration tests for check_task_independence tool`

---

### Task 4: Verify end-to-end registration

**Depends on:** Task 2, Task 3
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `npx vitest run packages/cli/tests/mcp/server.test.ts` — verify existing server tests still pass
2. Run: `npx vitest run packages/cli/tests/mcp/` — verify full MCP test suite passes
3. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json` — verify no type errors
4. Run: `harness validate`
5. Verify: the tool name `check_task_independence` appears in the `TOOL_DEFINITIONS` array and `TOOL_HANDLERS` record in `packages/cli/src/mcp/server.ts`

## Traceability

| Observable Truth                  | Delivered By                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1. Graph-expanded result          | Task 1 (handler), Task 3 (test: "returns graph-expanded result")                                       |
| 2. Graceful degradation           | Task 1 (handler passes `undefined` store), Task 3 (test: "file-only result when graph does not exist") |
| 3. Summary mode omits overlaps    | Task 1 (summary branch), Task 3 (test: "returns summary mode without overlap details")                 |
| 4. Detailed mode full result      | Task 1 (default branch), Task 3 (test: "returns detailed mode with full overlap details")              |
| 5. Validation: fewer than 2 tasks | Task 1 (error catch), Task 3 (test: "returns error for fewer than 2 tasks")                            |
| 6. Validation: empty files        | Task 1 (error catch), Task 3 (test: "returns error for task with empty files")                         |
| 7. Registration in server.ts      | Task 2                                                                                                 |
| 8. 8+ tests pass                  | Task 3 (13 tests)                                                                                      |
| 9. harness validate passes        | All tasks                                                                                              |
