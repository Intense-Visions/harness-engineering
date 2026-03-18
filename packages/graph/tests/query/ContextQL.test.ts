import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { ContextQL } from '../../src/query/ContextQL.js';
import type { GraphNode, GraphEdge } from '../../src/types.js';

describe('ContextQL', () => {
  let store: GraphStore;
  let cql: ContextQL;

  // Helper to create a node
  const mkNode = (id: string, type: GraphNode['type'], name: string): GraphNode => ({
    id,
    type,
    name,
    metadata: {},
  });

  // Helper to create an edge
  const mkEdge = (from: string, to: string, type: GraphEdge['type']): GraphEdge => ({
    from,
    to,
    type,
  });

  beforeEach(() => {
    store = new GraphStore();
    cql = new ContextQL(store);

    // Build graph:
    // file:app.ts --contains--> fn:main
    // file:app.ts --imports--> file:utils.ts
    // file:utils.ts --contains--> fn:hash
    // fn:main --calls--> fn:hash
    // span:req1 --executed_by--> fn:main (observability node)
    store.addNode(mkNode('file:app.ts', 'file', 'app.ts'));
    store.addNode(mkNode('fn:main', 'function', 'main'));
    store.addNode(mkNode('file:utils.ts', 'file', 'utils.ts'));
    store.addNode(mkNode('fn:hash', 'function', 'hash'));
    store.addNode(mkNode('span:req1', 'span', 'req1'));

    store.addEdge(mkEdge('file:app.ts', 'fn:main', 'contains'));
    store.addEdge(mkEdge('file:app.ts', 'file:utils.ts', 'imports'));
    store.addEdge(mkEdge('file:utils.ts', 'fn:hash', 'contains'));
    store.addEdge(mkEdge('fn:main', 'fn:hash', 'calls'));
    store.addEdge(mkEdge('span:req1', 'fn:main', 'executed_by'));
  });

  it('traverses outbound from root to depth 1', () => {
    const result = cql.execute({
      rootNodeIds: ['file:app.ts'],
      maxDepth: 1,
    });

    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['file:app.ts', 'file:utils.ts', 'fn:main'].sort());
  });

  it('traverses to depth 2', () => {
    const result = cql.execute({
      rootNodeIds: ['file:app.ts'],
      maxDepth: 2,
    });

    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['file:app.ts', 'file:utils.ts', 'fn:hash', 'fn:main'].sort());
  });

  it('prunes observability nodes by default', () => {
    const result = cql.execute({
      rootNodeIds: ['file:app.ts'],
      maxDepth: 3,
      bidirectional: true,
    });

    const ids = result.nodes.map((n) => n.id);
    expect(ids).not.toContain('span:req1');
  });

  it('includes observability when pruning disabled', () => {
    const result = cql.execute({
      rootNodeIds: ['fn:main'],
      maxDepth: 3,
      bidirectional: true,
      pruneObservability: false,
    });

    const ids = result.nodes.map((n) => n.id);
    expect(ids).toContain('span:req1');
  });

  it('filters by node type (includeTypes)', () => {
    const result = cql.execute({
      rootNodeIds: ['file:app.ts'],
      maxDepth: 3,
      includeTypes: ['function'],
    });

    // Root node (file) is always included even though it doesn't match includeTypes
    const nonRootNodes = result.nodes.filter((n) => n.id !== 'file:app.ts');
    for (const node of nonRootNodes) {
      expect(node.type).toBe('function');
    }
    expect(nonRootNodes.length).toBeGreaterThan(0);
  });

  it('filters by edge type (includeEdges)', () => {
    const result = cql.execute({
      rootNodeIds: ['file:app.ts'],
      maxDepth: 3,
      includeEdges: ['contains'],
    });

    const ids = result.nodes.map((n) => n.id).sort();
    // Only follows 'contains' edges, not 'imports'
    // file:app.ts --contains--> fn:main, fn:main --calls--> (not followed, wrong edge type)
    // So we get file:app.ts and fn:main only
    expect(ids).toEqual(['file:app.ts', 'fn:main'].sort());
    expect(ids).not.toContain('file:utils.ts');
  });

  it('supports bidirectional traversal', () => {
    const result = cql.execute({
      rootNodeIds: ['fn:hash'],
      maxDepth: 1,
      bidirectional: true,
    });

    const ids = result.nodes.map((n) => n.id);
    // fn:hash has inbound: file:utils.ts --contains--> fn:hash, fn:main --calls--> fn:hash
    expect(ids).toContain('file:utils.ts');
    expect(ids).toContain('fn:main');
  });

  it('returns stats with totalReturned > 0 and depthReached <= maxDepth', () => {
    const result = cql.execute({
      rootNodeIds: ['file:app.ts'],
      maxDepth: 2,
    });

    expect(result.stats.totalReturned).toBeGreaterThan(0);
    expect(result.stats.depthReached).toBeLessThanOrEqual(2);
    expect(result.stats.totalTraversed).toBeGreaterThanOrEqual(result.stats.totalReturned);
  });

  it('handles empty root set', () => {
    const result = cql.execute({
      rootNodeIds: [],
    });

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.stats.totalReturned).toBe(0);
  });

  it('excludes nodes by type with excludeTypes', () => {
    const result = cql.execute({
      rootNodeIds: ['file:app.ts'],
      maxDepth: 3,
      excludeTypes: ['function'],
    });
    // Should traverse but skip function nodes
    const types = result.nodes.filter((n) => n.id !== 'file:app.ts').map((n) => n.type);
    expect(types).not.toContain('function');
    // Should still find file:utils.ts via imports edge
    const ids = result.nodes.map((n) => n.id);
    expect(ids).toContain('file:utils.ts');
  });

  it('handles missing root node gracefully', () => {
    const result = cql.execute({
      rootNodeIds: ['nonexistent:node'],
    });

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.stats.totalReturned).toBe(0);
  });
});
