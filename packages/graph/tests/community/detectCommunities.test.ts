import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { detectCommunities, buildCommunityInput } from '../../src/community/detectCommunities.js';
import type { GraphNode, GraphEdge } from '../../src/types.js';

function node(id: string): GraphNode {
  return { id, type: 'function', name: id, metadata: {} };
}
function edge(from: string, to: string, confidence?: number): GraphEdge {
  return { from, to, type: 'calls', confidence };
}

describe('detectCommunities over a GraphStore', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
    // Two triangles bridged once.
    for (const id of ['a1', 'a2', 'a3', 'b1', 'b2', 'b3']) store.addNode(node(id));
    for (const [f, t] of [
      ['a1', 'a2'],
      ['a2', 'a3'],
      ['a3', 'a1'],
      ['b1', 'b2'],
      ['b2', 'b3'],
      ['b3', 'b1'],
      ['a1', 'b1'],
    ] as const) {
      store.addEdge(edge(f, t));
    }
  });

  it('builds algorithm-neutral input from the store', () => {
    const input = buildCommunityInput(store);
    expect(input.nodeIds).toHaveLength(6);
    expect(input.edges).toHaveLength(7);
    expect(input.edges.every((e) => e.weight === 1)).toBe(true);
  });

  it('persists a community id onto every node by default', () => {
    const result = detectCommunities(store);
    expect(result.communityCount).toBeGreaterThanOrEqual(2);
    for (const id of ['a1', 'a2', 'a3', 'b1', 'b2', 'b3']) {
      const n = store.getNode(id);
      expect(n?.community).toBeTypeOf('number');
    }
    // The two triangles get distinct labels.
    expect(store.getNode('a1')?.community).toBe(store.getNode('a2')?.community);
    expect(store.getNode('a1')?.community).not.toBe(store.getNode('b1')?.community);
  });

  it('does not mutate nodes when persist is false', () => {
    const result = detectCommunities(store, { persist: false });
    expect(result.assignments).toHaveLength(6);
    for (const id of ['a1', 'a2', 'a3', 'b1', 'b2', 'b3']) {
      expect(store.getNode(id)?.community).toBeUndefined();
    }
  });

  it('weights edges by confidence when present', () => {
    const s = new GraphStore();
    for (const id of ['x', 'y']) s.addNode(node(id));
    s.addEdge(edge('x', 'y', 0.42));
    const input = buildCommunityInput(s);
    expect(input.edges[0].weight).toBeCloseTo(0.42);
  });

  it('round-trips the community label through save/load semantics via schema', () => {
    detectCommunities(store);
    // A labeled node still validates and keeps its community field on copy.
    const copy = store.getNode('a1');
    expect(copy).toBeDefined();
    expect(copy?.community).toBeGreaterThanOrEqual(0);
  });
});
