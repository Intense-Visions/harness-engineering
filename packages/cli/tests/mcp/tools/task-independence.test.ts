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
