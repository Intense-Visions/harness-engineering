import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  handleComputeBlastRadius,
  computeBlastRadiusDefinition,
} from '../../../src/mcp/tools/graph/index.js';

let tmpDir: string;

function fileNode(name: string) {
  return { id: `file:${name}`, type: 'file', name, path: `src/${name}`, metadata: {} };
}

async function createBlastRadiusTestGraph(dir: string) {
  const { GraphStore } = await import('@harness-engineering/graph');
  const store = new GraphStore();

  // Chain: A -> B -> C -> D (imports), Branch: B -> E (imports)
  for (const n of ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']) store.addNode(fileNode(n));
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
  store.addEdge({ from: 'test:a.test.ts', to: 'file:a.ts', type: 'references' });

  await store.save(path.join(dir, '.harness', 'graph'));
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
