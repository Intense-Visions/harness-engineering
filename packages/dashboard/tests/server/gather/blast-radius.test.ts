import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLoad, mockSimulate } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockSimulate: vi.fn(),
}));

vi.mock('@harness-engineering/graph', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/graph')>(
    '@harness-engineering/graph'
  );
  return {
    ...actual,
    GraphStore: class MockGraphStore {
      load = mockLoad;
    },
    CascadeSimulator: class MockCascadeSimulator {
      simulate = mockSimulate;
    },
  };
});

import { gatherBlastRadius } from '../../../src/server/gather/blast-radius';

describe('gatherBlastRadius', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns blast radius data for a valid node', async () => {
    mockLoad.mockResolvedValue(true);
    mockSimulate.mockReturnValue({
      sourceNodeId: 'n1',
      sourceName: 'core-utils.ts',
      layers: [
        {
          depth: 1,
          nodes: [
            {
              nodeId: 'n2',
              name: 'service.ts',
              type: 'file',
              cumulativeProbability: 0.8,
              depth: 1,
              incomingEdge: 'imports',
              parentId: 'n1',
            },
          ],
          categoryBreakdown: { code: 1, tests: 0, docs: 0, other: 0 },
        },
      ],
      flatSummary: [],
      summary: {
        totalAffected: 1,
        maxDepthReached: 1,
        highRisk: 1,
        mediumRisk: 0,
        lowRisk: 0,
        categoryBreakdown: { code: 1, tests: 0, docs: 0, other: 0 },
        amplificationPoints: [],
        truncated: false,
      },
    });

    const result = await gatherBlastRadius('/project', 'n1', 3);

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.sourceNodeId).toBe('n1');
    expect(result.sourceName).toBe('core-utils.ts');
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].depth).toBe(1);
    expect(result.layers[0].nodes[0]).toEqual({
      nodeId: 'n2',
      name: 'service.ts',
      type: 'file',
      probability: 0.8,
      parentId: 'n1',
    });
    expect(result.summary.totalAffected).toBe(1);
    expect(result.summary.highRisk).toBe(1);
    expect(result.summary.maxDepth).toBe(1);
  });

  it('returns error when graph fails to load', async () => {
    mockLoad.mockResolvedValue(false);

    const result = await gatherBlastRadius('/project', 'n1');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Graph data not found');
  });

  it('returns error when simulate throws (node not found)', async () => {
    mockLoad.mockResolvedValue(true);
    mockSimulate.mockImplementation(() => {
      throw new Error('Node not found: n99');
    });

    const result = await gatherBlastRadius('/project', 'n99');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Node not found');
  });

  it('uses default maxDepth of 3 when not specified', async () => {
    mockLoad.mockResolvedValue(true);
    mockSimulate.mockReturnValue({
      sourceNodeId: 'n1',
      sourceName: 'a.ts',
      layers: [],
      flatSummary: [],
      summary: {
        totalAffected: 0,
        maxDepthReached: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        categoryBreakdown: { code: 0, tests: 0, docs: 0, other: 0 },
        amplificationPoints: [],
        truncated: false,
      },
    });

    await gatherBlastRadius('/project', 'n1');

    expect(mockSimulate).toHaveBeenCalledWith('n1', { maxDepth: 3 });
  });
});
