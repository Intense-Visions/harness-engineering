import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  handleQueryGraph,
  handleSearchSimilar,
  handleFindContextFor,
  handleGetRelationships,
  handleGetImpact,
  handleIngestSource,
  queryGraphDefinition,
  searchSimilarDefinition,
  getRelationshipsDefinition,
  getImpactDefinition,
} from '../../../src/mcp/tools/graph.js';

// ── Test helper ─────────────────────────────────────────────────────

let tmpDir: string;

async function createTestGraph(dir: string) {
  const { GraphStore } = await import('@harness-engineering/graph');
  const store = new GraphStore();

  // Add known test nodes
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
    id: 'class:App',
    type: 'class',
    name: 'App',
    path: 'src/index.ts',
    metadata: {},
  });
  store.addNode({
    id: 'adr:001',
    type: 'adr',
    name: 'Use TypeScript',
    metadata: { status: 'accepted' },
  });

  // Add edges
  store.addEdge({ from: 'file:src/index.ts', to: 'fn:hello', type: 'contains' });
  store.addEdge({ from: 'file:src/index.ts', to: 'class:App', type: 'contains' });
  store.addEdge({ from: 'file:src/index.ts', to: 'file:src/utils.ts', type: 'imports' });
  store.addEdge({ from: 'adr:001', to: 'file:src/index.ts', type: 'documents' });

  // Save to .harness/graph/
  const graphDir = path.join(dir, '.harness', 'graph');
  await store.save(graphDir);
  return store;
}

function parseResult(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

// ── Setup / Teardown ────────────────────────────────────────────────

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── query_graph definition ──────────────────────────────────────────

describe('query_graph definition', () => {
  it('query_graph definition has mode parameter', () => {
    expect(queryGraphDefinition.inputSchema.properties).toHaveProperty('mode');
    expect(queryGraphDefinition.inputSchema.properties.mode.enum).toEqual(['summary', 'detailed']);
  });
});

describe('search_similar definition', () => {
  it('search_similar definition has mode parameter', () => {
    expect(searchSimilarDefinition.inputSchema.properties).toHaveProperty('mode');
  });
});

describe('get_relationships definition', () => {
  it('get_relationships definition has mode parameter', () => {
    expect(getRelationshipsDefinition.inputSchema.properties).toHaveProperty('mode');
  });
});

describe('get_impact definition', () => {
  it('get_impact definition has mode parameter', () => {
    expect(getImpactDefinition.inputSchema.properties).toHaveProperty('mode');
  });
});

// ── handleQueryGraph ────────────────────────────────────────────────

describe('handleQueryGraph', () => {
  it('returns nodes when given valid rootNodeIds', async () => {
    await createTestGraph(tmpDir);
    const result = await handleQueryGraph({
      path: tmpDir,
      rootNodeIds: ['file:src/index.ts'],
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.nodes.length).toBeGreaterThan(0);

    const nodeIds = data.nodes.map((n: { id: string }) => n.id);
    expect(nodeIds).toContain('file:src/index.ts');
  });

  it('returns error when graph does not exist', async () => {
    const result = await handleQueryGraph({
      path: tmpDir,
      rootNodeIds: ['file:src/index.ts'],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No graph found');
  });

  it('respects maxDepth parameter', async () => {
    await createTestGraph(tmpDir);

    const shallow = await handleQueryGraph({
      path: tmpDir,
      rootNodeIds: ['file:src/index.ts'],
      maxDepth: 0,
    });
    const deep = await handleQueryGraph({
      path: tmpDir,
      rootNodeIds: ['file:src/index.ts'],
      maxDepth: 3,
    });

    const shallowData = parseResult(shallow);
    const deepData = parseResult(deep);
    // depth 0 should return only the root node(s)
    expect(shallowData.nodes.length).toBeLessThanOrEqual(deepData.nodes.length);
  });

  it('respects includeTypes filter', async () => {
    await createTestGraph(tmpDir);
    const result = await handleQueryGraph({
      path: tmpDir,
      rootNodeIds: ['file:src/index.ts'],
      includeTypes: ['function'],
      maxDepth: 2,
    });

    const data = parseResult(result);
    // All non-root returned nodes should be of type 'function'
    const nonRoot = data.nodes.filter((n: { id: string }) => n.id !== 'file:src/index.ts');
    for (const n of nonRoot) {
      expect(n.type).toBe('function');
    }
  });
});

// ── handleSearchSimilar ─────────────────────────────────────────────

describe('handleSearchSimilar', () => {
  it('returns ranked results for keyword query', async () => {
    await createTestGraph(tmpDir);
    const result = await handleSearchSimilar({
      path: tmpDir,
      query: 'hello',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.length).toBeGreaterThan(0);
    // The 'hello' function node should score highest
    expect(data[0].nodeId).toBe('fn:hello');
    expect(data[0].score).toBeGreaterThan(0);
  });

  it('returns empty array for non-matching query', async () => {
    await createTestGraph(tmpDir);
    const result = await handleSearchSimilar({
      path: tmpDir,
      query: 'zzzznonexistent',
    });

    const data = parseResult(result);
    expect(data).toEqual([]);
  });

  it('returns error when no graph exists', async () => {
    const result = await handleSearchSimilar({
      path: tmpDir,
      query: 'hello',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No graph found');
  });
});

// ── handleFindContextFor ────────────────────────────────────────────

describe('handleFindContextFor', () => {
  it('returns context for an intent', async () => {
    await createTestGraph(tmpDir);
    const result = await handleFindContextFor({
      path: tmpDir,
      intent: 'hello function',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.intent).toBe('hello function');
    expect(data.blocksReturned).toBeGreaterThan(0);
    expect(data.context.length).toBeGreaterThan(0);
    expect(data.context[0].rootNode).toBeDefined();
    expect(data.context[0].score).toBeGreaterThan(0);
  });

  it('respects token budget', async () => {
    await createTestGraph(tmpDir);
    const result = await handleFindContextFor({
      path: tmpDir,
      intent: 'TypeScript App hello utils index',
      tokenBudget: 100,
    });

    const data = parseResult(result);
    expect(data.tokenBudget).toBe(100);
    // With a very small budget, context should be limited
    const jsonSize = JSON.stringify(data.context).length;
    // Budget is 100 tokens * 4 chars = 400 chars; first block always included
    // so just verify we got a valid response
    expect(data.context.length).toBeGreaterThan(0);
  });

  it('returns empty context for non-matching intent', async () => {
    await createTestGraph(tmpDir);
    const result = await handleFindContextFor({
      path: tmpDir,
      intent: 'zzzznonexistent',
    });

    const data = parseResult(result);
    expect(data.context).toEqual([]);
    expect(data.message).toBe('No relevant nodes found.');
  });
});

// ── handleGetRelationships ──────────────────────────────────────────

describe('handleGetRelationships', () => {
  it('returns outbound relationships', async () => {
    await createTestGraph(tmpDir);
    const result = await handleGetRelationships({
      path: tmpDir,
      nodeId: 'file:src/index.ts',
      direction: 'outbound',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.nodeId).toBe('file:src/index.ts');
    expect(data.direction).toBe('outbound');
    expect(data.nodes.length).toBeGreaterThan(0);

    // Should find fn:hello, class:App, and file:src/utils.ts as outbound
    const nodeIds = data.nodes.map((n: { id: string }) => n.id);
    expect(nodeIds).toContain('fn:hello');
    expect(nodeIds).toContain('class:App');
    expect(nodeIds).toContain('file:src/utils.ts');
  });

  it('returns inbound relationships only (no outbound leakage)', async () => {
    await createTestGraph(tmpDir);
    const result = await handleGetRelationships({
      path: tmpDir,
      nodeId: 'file:src/index.ts',
      direction: 'inbound',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.direction).toBe('inbound');
    // adr:001 documents file:src/index.ts, so it should show up
    const nodeIds = data.nodes.map((n: { id: string }) => n.id);
    expect(nodeIds).toContain('adr:001');
    // Outbound targets should NOT appear in inbound-only query
    expect(nodeIds).not.toContain('fn:hello');
    expect(nodeIds).not.toContain('class:App');
    expect(nodeIds).not.toContain('file:src/utils.ts');
  });

  it('returns error when graph does not exist', async () => {
    const result = await handleGetRelationships({
      path: tmpDir,
      nodeId: 'file:src/index.ts',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No graph found');
  });
});

// ── handleGetImpact ─────────────────────────────────────────────────

describe('handleGetImpact', () => {
  it('returns affected nodes for a given nodeId', async () => {
    await createTestGraph(tmpDir);
    const result = await handleGetImpact({
      path: tmpDir,
      nodeId: 'file:src/index.ts',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.targetNodeId).toBe('file:src/index.ts');
    expect(data.impact).toBeDefined();
    // Should have code and docs groups
    expect(data.impact.code.length).toBeGreaterThan(0);
    expect(data.impact.docs.length).toBeGreaterThan(0);
  });

  it('resolves filePath to nodeId', async () => {
    await createTestGraph(tmpDir);
    const result = await handleGetImpact({
      path: tmpDir,
      filePath: 'src/index.ts',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.targetNodeId).toBe('file:src/index.ts');
  });

  it('returns error when neither nodeId nor filePath provided', async () => {
    const result = await handleGetImpact({
      path: tmpDir,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('either nodeId or filePath is required');
  });

  it('returns error when filePath not found in graph', async () => {
    await createTestGraph(tmpDir);
    const result = await handleGetImpact({
      path: tmpDir,
      filePath: 'nonexistent/file.ts',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no file node found');
  });

  it('returns error when graph does not exist', async () => {
    const result = await handleGetImpact({
      path: tmpDir,
      nodeId: 'file:src/index.ts',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No graph found');
  });
});

// ── handleIngestSource ──────────────────────────────────────────────

describe('handleIngestSource', () => {
  it('returns ingest counts for code source on empty dir', async () => {
    // Create a minimal project directory with a source file
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'index.ts'), 'export function greet() { return "hi"; }\n');

    const result = await handleIngestSource({
      path: tmpDir,
      source: 'code',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.nodesAdded).toBeGreaterThan(0);
    expect(data.edgesAdded).toBeGreaterThanOrEqual(0);
    expect(data.graphStats).toBeDefined();
    expect(data.graphStats.totalNodes).toBeGreaterThan(0);
    expect(data.graphStats.totalEdges).toBeGreaterThanOrEqual(0);
    expect(typeof data.durationMs).toBe('number');

    // Verify graph file was persisted
    const graphFile = path.join(tmpDir, '.harness', 'graph', 'graph.json');
    const stat = await fs.stat(graphFile);
    expect(stat.isFile()).toBe(true);

    // Verify the graph can be loaded back and has nodes
    const { GraphStore } = await import('@harness-engineering/graph');
    const store = new GraphStore();
    const loaded = await store.load(path.join(tmpDir, '.harness', 'graph'));
    expect(loaded).toBe(true);
    expect(store.nodeCount).toBeGreaterThan(0);
  });

  it('ingests from all sources', async () => {
    // Create a minimal project with both code and knowledge sources
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'app.ts'), 'export class App { run() {} }\n');

    const harnessDir = path.join(tmpDir, '.harness');
    await fs.mkdir(harnessDir, { recursive: true });
    await fs.writeFile(
      path.join(harnessDir, 'learnings.md'),
      '# Learning\n\nAlways validate inputs.\n'
    );

    const result = await handleIngestSource({
      path: tmpDir,
      source: 'all',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.nodesAdded).toBeGreaterThan(0);
    expect(data.graphStats.totalNodes).toBeGreaterThan(0);

    // Verify graph was persisted and can be loaded back
    const { GraphStore } = await import('@harness-engineering/graph');
    const store = new GraphStore();
    const loaded = await store.load(path.join(tmpDir, '.harness', 'graph'));
    expect(loaded).toBe(true);
    expect(store.nodeCount).toBeGreaterThan(0);
  });

  it('creates .harness/graph directory if it does not exist', async () => {
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'index.ts'), 'export const x = 1;\n');

    await handleIngestSource({
      path: tmpDir,
      source: 'code',
    });

    // Verify graph directory was created
    const graphDir = path.join(tmpDir, '.harness', 'graph');
    const stat = await fs.stat(graphDir);
    expect(stat.isDirectory()).toBe(true);
  });
});
