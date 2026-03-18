import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import type { GraphNode, GraphEdge } from '../../src/types.js';
import { CURRENT_SCHEMA_VERSION } from '../../src/types.js';

function makeNode(
  overrides: Partial<GraphNode> & { id: string; type: GraphNode['type']; name: string }
): GraphNode {
  return {
    metadata: {},
    ...overrides,
  };
}

function makeEdge(
  overrides: Partial<GraphEdge> & { from: string; to: string; type: GraphEdge['type'] }
): GraphEdge {
  return { ...overrides };
}

describe('GraphStore', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
  });

  // --- Node CRUD ---

  describe('addNode / getNode', () => {
    it('should add and retrieve a node', () => {
      const node = makeNode({ id: 'n1', type: 'file', name: 'index.ts' });
      store.addNode(node);
      const result = store.getNode('n1');
      expect(result).toEqual(node);
    });

    it('should return null for missing node', () => {
      expect(store.getNode('missing')).toBeNull();
    });

    it('should not include $loki or meta in returned node', () => {
      store.addNode(makeNode({ id: 'n1', type: 'file', name: 'a.ts' }));
      const result = store.getNode('n1');
      expect(result).not.toHaveProperty('$loki');
      expect(result).not.toHaveProperty('meta');
    });

    it('should upsert node by id', () => {
      store.addNode(makeNode({ id: 'n1', type: 'file', name: 'old.ts' }));
      store.addNode(makeNode({ id: 'n1', type: 'file', name: 'new.ts' }));
      expect(store.getNode('n1')?.name).toBe('new.ts');
      expect(store.nodeCount).toBe(1);
    });
  });

  describe('batchAddNodes', () => {
    it('should add multiple nodes', () => {
      const nodes = [
        makeNode({ id: 'n1', type: 'file', name: 'a.ts' }),
        makeNode({ id: 'n2', type: 'file', name: 'b.ts' }),
        makeNode({ id: 'n3', type: 'class', name: 'Foo' }),
      ];
      store.batchAddNodes(nodes);
      expect(store.nodeCount).toBe(3);
      expect(store.getNode('n2')?.name).toBe('b.ts');
    });

    it('should upsert during batch', () => {
      store.addNode(makeNode({ id: 'n1', type: 'file', name: 'old.ts' }));
      store.batchAddNodes([
        makeNode({ id: 'n1', type: 'file', name: 'updated.ts' }),
        makeNode({ id: 'n2', type: 'file', name: 'new.ts' }),
      ]);
      expect(store.nodeCount).toBe(2);
      expect(store.getNode('n1')?.name).toBe('updated.ts');
    });
  });

  describe('findNodes', () => {
    beforeEach(() => {
      store.batchAddNodes([
        makeNode({ id: 'n1', type: 'file', name: 'a.ts', path: '/src/a.ts' }),
        makeNode({ id: 'n2', type: 'file', name: 'b.ts', path: '/src/b.ts' }),
        makeNode({ id: 'n3', type: 'class', name: 'Foo', path: '/src/a.ts' }),
        makeNode({ id: 'n4', type: 'function', name: 'bar' }),
      ]);
    });

    it('should find nodes by type', () => {
      const files = store.findNodes({ type: 'file' });
      expect(files).toHaveLength(2);
    });

    it('should find nodes by name', () => {
      const results = store.findNodes({ name: 'Foo' });
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('n3');
    });

    it('should find nodes by path', () => {
      const results = store.findNodes({ path: '/src/a.ts' });
      expect(results).toHaveLength(2);
    });

    it('should return empty array for no matches', () => {
      expect(store.findNodes({ type: 'repository' })).toHaveLength(0);
    });
  });

  describe('removeNode', () => {
    it('should remove a node', () => {
      store.addNode(makeNode({ id: 'n1', type: 'file', name: 'a.ts' }));
      store.removeNode('n1');
      expect(store.getNode('n1')).toBeNull();
      expect(store.nodeCount).toBe(0);
    });

    it('should cascade to edges referencing the node', () => {
      store.addNode(makeNode({ id: 'n1', type: 'file', name: 'a.ts' }));
      store.addNode(makeNode({ id: 'n2', type: 'file', name: 'b.ts' }));
      store.addNode(makeNode({ id: 'n3', type: 'file', name: 'c.ts' }));
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports' }));
      store.addEdge(makeEdge({ from: 'n3', to: 'n1', type: 'imports' }));
      store.addEdge(makeEdge({ from: 'n2', to: 'n3', type: 'imports' }));

      store.removeNode('n1');
      expect(store.edgeCount).toBe(1); // only n2->n3 remains
    });

    it('should be a no-op for missing node', () => {
      store.removeNode('missing');
      expect(store.nodeCount).toBe(0);
    });
  });

  // --- Edge operations ---

  describe('addEdge / getEdges', () => {
    it('should add and retrieve edges', () => {
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports' }));
      const edges = store.getEdges({ from: 'n1' });
      expect(edges).toHaveLength(1);
      expect(edges[0]!.to).toBe('n2');
    });

    it('should not include $loki or meta in returned edges', () => {
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports' }));
      const edges = store.getEdges({ from: 'n1' });
      expect(edges[0]).not.toHaveProperty('$loki');
      expect(edges[0]).not.toHaveProperty('meta');
    });

    it('should find edges by type', () => {
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports' }));
      store.addEdge(makeEdge({ from: 'n1', to: 'n3', type: 'calls' }));
      store.addEdge(makeEdge({ from: 'n2', to: 'n3', type: 'imports' }));

      const imports = store.getEdges({ type: 'imports' });
      expect(imports).toHaveLength(2);
    });

    it('should find edges by from and to', () => {
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports' }));
      store.addEdge(makeEdge({ from: 'n1', to: 'n3', type: 'imports' }));

      const edges = store.getEdges({ from: 'n1', to: 'n2' });
      expect(edges).toHaveLength(1);
    });

    it('does not create duplicate edges with same from/to/type', () => {
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports' }));
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports' }));
      expect(store.edgeCount).toBe(1);
    });

    it('updates edge metadata on re-add', () => {
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports', metadata: { weight: 1 } }));
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports', metadata: { weight: 5 } }));
      expect(store.edgeCount).toBe(1);
      const edges = store.getEdges({ from: 'n1', to: 'n2', type: 'imports' });
      expect(edges).toHaveLength(1);
      expect((edges[0] as any).metadata).toEqual({ weight: 5 });
    });
  });

  describe('batchAddEdges', () => {
    it('should add multiple edges', () => {
      store.batchAddEdges([
        makeEdge({ from: 'n1', to: 'n2', type: 'imports' }),
        makeEdge({ from: 'n2', to: 'n3', type: 'calls' }),
      ]);
      expect(store.edgeCount).toBe(2);
    });
  });

  // --- Neighbors ---

  describe('getNeighbors', () => {
    beforeEach(() => {
      store.batchAddNodes([
        makeNode({ id: 'n1', type: 'file', name: 'a.ts' }),
        makeNode({ id: 'n2', type: 'file', name: 'b.ts' }),
        makeNode({ id: 'n3', type: 'file', name: 'c.ts' }),
      ]);
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports' }));
      store.addEdge(makeEdge({ from: 'n3', to: 'n1', type: 'imports' }));
    });

    it('should get outbound neighbors', () => {
      const neighbors = store.getNeighbors('n1', 'outbound');
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0]!.id).toBe('n2');
    });

    it('should get inbound neighbors', () => {
      const neighbors = store.getNeighbors('n1', 'inbound');
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0]!.id).toBe('n3');
    });

    it('should get both directions by default', () => {
      const neighbors = store.getNeighbors('n1');
      expect(neighbors).toHaveLength(2);
      const ids = neighbors.map((n) => n.id).sort();
      expect(ids).toEqual(['n2', 'n3']);
    });

    it('should return empty for isolated node', () => {
      store.addNode(makeNode({ id: 'n4', type: 'file', name: 'd.ts' }));
      expect(store.getNeighbors('n4')).toHaveLength(0);
    });
  });

  // --- Counts and Clear ---

  describe('nodeCount / edgeCount / clear', () => {
    it('should report correct counts', () => {
      expect(store.nodeCount).toBe(0);
      expect(store.edgeCount).toBe(0);

      store.addNode(makeNode({ id: 'n1', type: 'file', name: 'a.ts' }));
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports' }));

      expect(store.nodeCount).toBe(1);
      expect(store.edgeCount).toBe(1);
    });

    it('should clear all data', () => {
      store.addNode(makeNode({ id: 'n1', type: 'file', name: 'a.ts' }));
      store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports' }));
      store.clear();

      expect(store.nodeCount).toBe(0);
      expect(store.edgeCount).toBe(0);
      expect(store.getNode('n1')).toBeNull();
    });
  });

  // --- Persistence ---

  describe('save / load', () => {
    it('should round-trip nodes and edges', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'graph-test-'));

      store.batchAddNodes([
        makeNode({ id: 'n1', type: 'file', name: 'a.ts', path: '/src/a.ts' }),
        makeNode({ id: 'n2', type: 'class', name: 'Foo' }),
      ]);
      store.batchAddEdges([makeEdge({ from: 'n1', to: 'n2', type: 'contains' })]);

      await store.save(dir);

      const store2 = new GraphStore();
      const loaded = await store2.load(dir);

      expect(loaded).toBe(true);
      expect(store2.nodeCount).toBe(2);
      expect(store2.edgeCount).toBe(1);
      expect(store2.getNode('n1')?.name).toBe('a.ts');
      expect(store2.getNode('n2')?.name).toBe('Foo');
      expect(store2.getEdges({ from: 'n1' })).toHaveLength(1);
    });

    it('should write metadata.json with schema version', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'graph-test-'));
      store.addNode(makeNode({ id: 'n1', type: 'file', name: 'a.ts' }));
      await store.save(dir);

      const meta = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf-8'));
      expect(meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(meta.nodeCount).toBe(1);
      expect(meta.edgeCount).toBe(0);
    });

    it('should return false for missing directory', async () => {
      const result = await store.load('/nonexistent/path/to/graph');
      expect(result).toBe(false);
    });

    it('should return false for schema version mismatch', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'graph-test-'));

      // Write files with wrong schema version
      await writeFile(
        join(dir, 'graph.json'),
        JSON.stringify({
          nodes: [{ id: 'n1', type: 'file', name: 'a.ts', metadata: {} }],
          edges: [],
        })
      );
      await writeFile(
        join(dir, 'metadata.json'),
        JSON.stringify({
          schemaVersion: 999,
          lastScanTimestamp: new Date().toISOString(),
          nodeCount: 1,
          edgeCount: 0,
        })
      );

      store.addNode(makeNode({ id: 'existing', type: 'file', name: 'keep.ts' }));
      const result = await store.load(dir);

      expect(result).toBe(false);
      // Store should remain unchanged
      expect(store.nodeCount).toBe(1);
      expect(store.getNode('existing')?.name).toBe('keep.ts');
    });

    it('should clear existing data on successful load', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'graph-test-'));

      // Save some data
      store.addNode(makeNode({ id: 'n1', type: 'file', name: 'original.ts' }));
      await store.save(dir);

      // Add more data that should be cleared on load
      store.addNode(makeNode({ id: 'n2', type: 'file', name: 'extra.ts' }));
      expect(store.nodeCount).toBe(2);

      const loaded = await store.load(dir);
      expect(loaded).toBe(true);
      expect(store.nodeCount).toBe(1);
      expect(store.getNode('n1')?.name).toBe('original.ts');
      expect(store.getNode('n2')).toBeNull();
    });
  });
});
