import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoad = vi.fn();
const mockFindNodes = vi.fn();
let mockNodeCount = 0;
let mockEdgeCount = 0;

vi.mock('@harness-engineering/graph', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/graph')>(
    '@harness-engineering/graph'
  );
  return {
    ...actual,
    GraphStore: class MockGraphStore {
      load = mockLoad;
      findNodes = mockFindNodes;
      get nodeCount() {
        return mockNodeCount;
      }
      get edgeCount() {
        return mockEdgeCount;
      }
    },
  };
});

import { gatherGraph } from '../../../src/server/gather/graph';

describe('gatherGraph', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNodeCount = 0;
    mockEdgeCount = 0;
  });

  it('returns graph data when store loads successfully', async () => {
    const mockNodes = [
      { id: '1', type: 'file', name: 'a.ts', path: 'src/a.ts' },
      { id: '2', type: 'file', name: 'b.ts', path: 'src/b.ts' },
      { id: '3', type: 'function', name: 'foo', path: 'src/a.ts' },
    ];

    mockLoad.mockResolvedValue(true);
    mockNodeCount = 3;
    mockEdgeCount = 5;
    mockFindNodes.mockImplementation((query: { type?: string }) => {
      if (!query.type) return mockNodes;
      return mockNodes.filter((n) => n.type === query.type);
    });

    const result = await gatherGraph('/project');

    expect(result.available).toBe(true);
    if (!result.available) return;

    expect(result.nodeCount).toBe(3);
    expect(result.edgeCount).toBe(5);
    expect(result.nodesByType).toContainEqual({ type: 'file', count: 2 });
    expect(result.nodesByType).toContainEqual({ type: 'function', count: 1 });
  });

  it('returns unavailable when store fails to load', async () => {
    mockLoad.mockResolvedValue(false);

    const result = await gatherGraph('/project');

    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.reason).toBeTruthy();
  });

  it('returns unavailable when store throws', async () => {
    mockLoad.mockRejectedValue(new Error('disk error'));

    const result = await gatherGraph('/project');

    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.reason).toContain('disk error');
  });
});
