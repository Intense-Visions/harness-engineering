import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getGraphResource,
  getEntitiesResource,
  getRelationshipsResource,
} from '../../src/resources/graph.js';

async function createTestGraph(tmpDir: string) {
  const { GraphStore } = await import('@harness-engineering/graph');
  const store = new GraphStore();

  store.addNode({ id: 'file:a.ts', type: 'file', name: 'a.ts', path: 'src/a.ts', metadata: {} });
  store.addNode({ id: 'file:b.ts', type: 'file', name: 'b.ts', path: 'src/b.ts', metadata: {} });
  store.addNode({ id: 'fn:hello', type: 'function', name: 'hello', metadata: {} });
  store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
  store.addEdge({ from: 'file:a.ts', to: 'fn:hello', type: 'contains' });

  const graphDir = path.join(tmpDir, '.harness', 'graph');
  await store.save(graphDir);
  return store;
}

let tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe('getGraphResource', () => {
  it('returns node/edge counts by type for a valid graph', async () => {
    const tmpDir = makeTmpDir();
    await createTestGraph(tmpDir);

    const result = JSON.parse(await getGraphResource(tmpDir));

    expect(result.nodeCount).toBe(3);
    expect(result.edgeCount).toBe(2);
    expect(result.nodesByType).toEqual({ file: 2, function: 1 });
    expect(result.edgesByType).toEqual({ imports: 1, contains: 1 });
  });

  it('returns status "ok" for a fresh graph', async () => {
    const tmpDir = makeTmpDir();
    await createTestGraph(tmpDir);

    const result = JSON.parse(await getGraphResource(tmpDir));

    expect(result.status).toBe('ok');
  });

  it('returns "no_graph" status when no graph exists', async () => {
    const tmpDir = makeTmpDir();

    const result = JSON.parse(await getGraphResource(tmpDir));

    expect(result.status).toBe('no_graph');
    expect(result.message).toContain('No knowledge graph found');
  });

  it('includes lastScanTimestamp', async () => {
    const tmpDir = makeTmpDir();
    await createTestGraph(tmpDir);

    const result = JSON.parse(await getGraphResource(tmpDir));

    expect(result.lastScanTimestamp).toBeDefined();
    expect(typeof result.lastScanTimestamp).toBe('string');
    // Verify it parses as a valid ISO date
    const parsed = new Date(result.lastScanTimestamp);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('returns status "stale" when graph is older than 24 hours', async () => {
    const tmpDir = makeTmpDir();
    await createTestGraph(tmpDir);

    // Overwrite metadata.json with a timestamp 25 hours ago
    const metaPath = path.join(tmpDir, '.harness', 'graph', 'metadata.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    meta.lastScanTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta));

    const result = JSON.parse(await getGraphResource(tmpDir));

    expect(result.status).toBe('stale');
  });
});

describe('getEntitiesResource', () => {
  it('returns JSON array of all nodes', async () => {
    const tmpDir = makeTmpDir();
    await createTestGraph(tmpDir);

    const result = JSON.parse(await getEntitiesResource(tmpDir));

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);

    const ids = result.map((n: { id: string }) => n.id).sort();
    expect(ids).toEqual(['file:a.ts', 'file:b.ts', 'fn:hello']);
  });

  it('nodes do not include content or embedding fields', async () => {
    const tmpDir = makeTmpDir();
    await createTestGraph(tmpDir);

    const result = JSON.parse(await getEntitiesResource(tmpDir));

    for (const node of result) {
      expect(node).not.toHaveProperty('content');
      expect(node).not.toHaveProperty('embedding');
      // Verify expected fields are present
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('name');
    }
  });

  it('returns empty array when no graph exists', async () => {
    const tmpDir = makeTmpDir();

    const result = JSON.parse(await getEntitiesResource(tmpDir));

    expect(result).toEqual([]);
  });
});

describe('getRelationshipsResource', () => {
  it('returns JSON array of all edges with from/to/type', async () => {
    const tmpDir = makeTmpDir();
    await createTestGraph(tmpDir);

    const result = JSON.parse(await getRelationshipsResource(tmpDir));

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);

    for (const edge of result) {
      expect(edge).toHaveProperty('from');
      expect(edge).toHaveProperty('to');
      expect(edge).toHaveProperty('type');
    }

    const types = result.map((e: { type: string }) => e.type).sort();
    expect(types).toEqual(['contains', 'imports']);
  });

  it('returns empty array when no graph exists', async () => {
    const tmpDir = makeTmpDir();

    const result = JSON.parse(await getRelationshipsResource(tmpDir));

    expect(result).toEqual([]);
  });
});
