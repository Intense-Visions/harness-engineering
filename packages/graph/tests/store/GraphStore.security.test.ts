import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import type { GraphNode, GraphEdge } from '../../src/types.js';

function makeNode(
  overrides: Partial<GraphNode> & { id: string; type: GraphNode['type']; name: string }
): GraphNode {
  return { metadata: {}, ...overrides };
}

function makeEdge(
  overrides: Partial<GraphEdge> & { from: string; to: string; type: GraphEdge['type'] }
): GraphEdge {
  return { ...overrides };
}

describe('GraphStore prototype pollution prevention', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
  });

  it('filters __proto__ keys when updating nodes', () => {
    store.addNode(makeNode({ id: 'n1', type: 'file', name: 'original' }));

    // Attempt prototype pollution via node update
    const maliciousNode = {
      id: 'n1',
      type: 'file' as const,
      name: 'updated',
      metadata: {},
      __proto__: { polluted: true },
    };
    // Use Object.create to actually set __proto__ as an own property
    const payload = Object.create(null);
    payload.id = 'n1';
    payload.type = 'file';
    payload.name = 'updated';
    payload.metadata = {};
    payload['__proto__'] = { polluted: true };

    store.addNode(payload as GraphNode);

    // The node should be updated but Object.prototype should not be polluted
    const obj: Record<string, unknown> = {};
    expect(obj['polluted']).toBeUndefined();
    expect(store.getNode('n1')?.name).toBe('updated');
  });

  it('filters constructor key when updating nodes', () => {
    store.addNode(makeNode({ id: 'n1', type: 'file', name: 'original' }));

    const payload = Object.create(null);
    payload.id = 'n1';
    payload.type = 'file';
    payload.name = 'safe';
    payload.metadata = {};
    payload['constructor'] = { prototype: { polluted: true } };

    store.addNode(payload as GraphNode);

    const obj: Record<string, unknown> = {};
    expect(obj['polluted']).toBeUndefined();
    expect(store.getNode('n1')?.name).toBe('safe');
  });

  it('filters __proto__ keys when updating edges', () => {
    store.addNode(makeNode({ id: 'n1', type: 'file', name: 'a' }));
    store.addNode(makeNode({ id: 'n2', type: 'file', name: 'b' }));

    store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports', metadata: { weight: 1 } }));

    // Attempt pollution via edge update
    const payload = Object.create(null);
    payload.from = 'n1';
    payload.to = 'n2';
    payload.type = 'imports';
    payload.metadata = { weight: 2 };
    payload['__proto__'] = { polluted: true };

    store.addEdge(payload as GraphEdge);

    const obj: Record<string, unknown> = {};
    expect(obj['polluted']).toBeUndefined();
  });

  it('normal node updates still work correctly', () => {
    store.addNode(makeNode({ id: 'n1', type: 'file', name: 'v1' }));
    store.addNode(makeNode({ id: 'n1', type: 'file', name: 'v2' }));
    expect(store.getNode('n1')?.name).toBe('v2');
  });

  it('normal edge updates still work correctly', () => {
    store.addNode(makeNode({ id: 'n1', type: 'file', name: 'a' }));
    store.addNode(makeNode({ id: 'n2', type: 'file', name: 'b' }));
    store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports', metadata: { weight: 1 } }));
    store.addEdge(makeEdge({ from: 'n1', to: 'n2', type: 'imports', metadata: { weight: 5 } }));

    const edges = store.getEdges({ from: 'n1', to: 'n2' });
    expect(edges).toHaveLength(1);
    expect(edges[0].metadata?.weight).toBe(5);
  });
});
