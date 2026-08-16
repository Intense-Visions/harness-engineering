import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleGetGraphSchema, getGraphSchemaDefinition } from './get-graph-schema';
import { clearGraphStoreCache } from '../../utils/graph-loader.js';

/**
 * Observable-contract coverage for the `get_graph_schema` MCP handler.
 *
 * Covers the handler's own responsibilities — input sanitization, the
 * graph-not-found guard, and the aggregation shape/counts over a seeded graph.
 */

beforeEach(() => {
  clearGraphStoreCache();
});

type SchemaPayload = {
  nodeTypes: Array<{ label: string; count: number; properties: string[] }>;
  edgeTypes: Array<{ type: string; count: number }>;
  patterns: Array<{ from: string; edge: string; to: string; count: number }>;
  totals: { nodeCount: number; edgeCount: number };
};

/** Build and persist a tiny graph under a fresh temp project root. */
async function seedGraph(): Promise<string> {
  const { GraphStore, resolveGraphDir } = await import('@harness-engineering/graph');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'get-graph-schema-'));
  const store = new GraphStore();

  // 2 files, 2 functions, 1 class
  store.batchAddNodes([
    { id: 'f1', type: 'file', name: 'a.ts', path: 'src/a.ts', metadata: { lang: 'ts' } },
    { id: 'f2', type: 'file', name: 'b.ts', path: 'src/b.ts', metadata: { lang: 'ts', loc: 10 } },
    { id: 'fn1', type: 'function', name: 'doA', metadata: {} },
    { id: 'fn2', type: 'function', name: 'doB', metadata: { async: true } },
    { id: 'c1', type: 'class', name: 'Widget', metadata: {} },
  ]);

  // files contain functions/class; one function calls another
  store.batchAddEdges([
    { from: 'f1', to: 'fn1', type: 'contains' },
    { from: 'f2', to: 'fn2', type: 'contains' },
    { from: 'f2', to: 'c1', type: 'contains' },
    { from: 'fn1', to: 'fn2', type: 'calls' },
  ]);

  const graphDir = resolveGraphDir(dir);
  fs.mkdirSync(graphDir, { recursive: true });
  await store.save(graphDir);
  return dir;
}

describe('getGraphSchemaDefinition', () => {
  it('declares the tool name and required inputs', () => {
    expect(getGraphSchemaDefinition.name).toBe('get_graph_schema');
    expect(getGraphSchemaDefinition.inputSchema.required).toEqual(['path']);
  });
});

describe('handleGetGraphSchema — guard paths', () => {
  it('returns an error envelope when the path resolves to the filesystem root', async () => {
    const res = await handleGetGraphSchema({ path: '/' });
    expect('isError' in res && res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('Error:');
  });

  it('returns the graph-not-found envelope when no graph exists', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'get-graph-schema-empty-'));
    try {
      const res = await handleGetGraphSchema({ path: dir });
      expect('isError' in res && res.isError).toBe(true);
      expect(res.content[0]!.text).toContain('No graph found');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('handleGetGraphSchema — seeded graph', () => {
  it('reports node-type counts, edge-type counts, patterns, and property unions', async () => {
    const dir = await seedGraph();
    try {
      const res = await handleGetGraphSchema({ path: dir });
      expect('isError' in res && res.isError).toBeFalsy();
      const payload = JSON.parse(res.content[0]!.text) as SchemaPayload;

      // totals
      expect(payload.totals).toEqual({ nodeCount: 5, edgeCount: 4 });

      // node-type counts (order-independent lookup)
      const byLabel = Object.fromEntries(payload.nodeTypes.map((n) => [n.label, n]));
      expect(byLabel.file!.count).toBe(2);
      expect(byLabel.function!.count).toBe(2);
      expect(byLabel.class!.count).toBe(1);

      // property union for `file`: top-level `name`+`path` present, metadata keys lang+loc
      expect(byLabel.file!.properties).toContain('name');
      expect(byLabel.file!.properties).toContain('path');
      expect(byLabel.file!.properties).toContain('lang');
      expect(byLabel.file!.properties).toContain('loc');
      // deterministic sort
      expect(byLabel.file!.properties).toEqual([...byLabel.file!.properties].sort());

      // edge-type counts
      const byEdge = Object.fromEntries(payload.edgeTypes.map((e) => [e.type, e.count]));
      expect(byEdge.contains).toBe(3);
      expect(byEdge.calls).toBe(1);

      // patterns include (file, contains, function) and (function, calls, function)
      const hasPattern = (from: string, edge: string, to: string, count: number) =>
        payload.patterns.some(
          (p) => p.from === from && p.edge === edge && p.to === to && p.count === count
        );
      expect(hasPattern('file', 'contains', 'function', 2)).toBe(true);
      expect(hasPattern('file', 'contains', 'class', 1)).toBe(true);
      expect(hasPattern('function', 'calls', 'function', 1)).toBe(true);

      // pattern counts reconcile with edge totals
      const patternSum = payload.patterns.reduce((s, p) => s + p.count, 0);
      expect(patternSum).toBe(payload.totals.edgeCount);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not write to disk (read-only)', async () => {
    const dir = await seedGraph();
    try {
      const { resolveGraphDir } = await import('@harness-engineering/graph');
      const graphPath = path.join(resolveGraphDir(dir), 'graph.json');
      const before = fs.statSync(graphPath).mtimeMs;
      await handleGetGraphSchema({ path: dir });
      const after = fs.statSync(graphPath).mtimeMs;
      expect(after).toBe(before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
