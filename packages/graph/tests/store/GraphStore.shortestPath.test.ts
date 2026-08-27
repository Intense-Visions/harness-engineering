import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import type { GraphNode, GraphEdge } from '../../src/types.js';

const mkNode = (id: string, type: GraphNode['type'], name: string): GraphNode => ({
  id,
  type,
  name,
  metadata: {},
});

const mkEdge = (from: string, to: string, type: GraphEdge['type']): GraphEdge => ({
  from,
  to,
  type,
});

describe('GraphStore.shortestPath', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
    // a -> b -> c -> d  (linear chain)
    // a -> e -> d       (shorter alternate route to d)
    // isolated: x
    store.addNode(mkNode('a', 'function', 'a'));
    store.addNode(mkNode('b', 'function', 'b'));
    store.addNode(mkNode('c', 'function', 'c'));
    store.addNode(mkNode('d', 'function', 'd'));
    store.addNode(mkNode('e', 'function', 'e'));
    store.addNode(mkNode('x', 'function', 'x'));

    store.addEdge(mkEdge('a', 'b', 'calls'));
    store.addEdge(mkEdge('b', 'c', 'calls'));
    store.addEdge(mkEdge('c', 'd', 'calls'));
    store.addEdge(mkEdge('a', 'e', 'calls'));
    store.addEdge(mkEdge('e', 'd', 'calls'));
  });

  it('finds the shortest path (fewest hops) between connected nodes', () => {
    const result = store.shortestPath('a', 'd');
    expect(result).not.toBeNull();
    // a -> e -> d is 2 hops, shorter than a -> b -> c -> d (3 hops)
    expect(result!.length).toBe(2);
    expect(result!.nodes.map((n) => n.id)).toEqual(['a', 'e', 'd']);
    expect(result!.edges).toHaveLength(2);
    expect(result!.edges.map((edge) => [edge.from, edge.to])).toEqual([
      ['a', 'e'],
      ['e', 'd'],
    ]);
  });

  it('returns null when the target is unreachable', () => {
    expect(store.shortestPath('a', 'x')).toBeNull();
  });

  it('returns null when an endpoint is not in the graph', () => {
    expect(store.shortestPath('a', 'missing')).toBeNull();
    expect(store.shortestPath('missing', 'a')).toBeNull();
  });

  it('returns a zero-length path for the same node', () => {
    const result = store.shortestPath('a', 'a');
    expect(result).not.toBeNull();
    expect(result!.length).toBe(0);
    expect(result!.nodes.map((n) => n.id)).toEqual(['a']);
    expect(result!.edges).toHaveLength(0);
  });

  it('respects direction: outbound cannot walk edges backwards', () => {
    // d is downstream of a; there is no outbound route from d back to a.
    expect(store.shortestPath('d', 'a', { direction: 'outbound' })).toBeNull();
    // but the undirected default reaches it.
    const both = store.shortestPath('d', 'a', { direction: 'both' });
    expect(both).not.toBeNull();
    expect(both!.length).toBe(2);
  });

  it('respects direction: inbound walks edges in reverse', () => {
    const result = store.shortestPath('d', 'a', { direction: 'inbound' });
    expect(result).not.toBeNull();
    expect(result!.nodes.map((n) => n.id)).toEqual(['d', 'e', 'a']);
  });

  it('returns copies, not references into the store', () => {
    const result = store.shortestPath('a', 'b');
    expect(result).not.toBeNull();
    (result!.nodes[0] as { name: string }).name = 'mutated';
    expect(store.getNode('a')!.name).toBe('a');
  });
});
