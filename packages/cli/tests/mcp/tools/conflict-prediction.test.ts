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
