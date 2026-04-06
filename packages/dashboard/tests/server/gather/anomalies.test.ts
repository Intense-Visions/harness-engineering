import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLoad, mockDetect } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockDetect: vi.fn(),
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
    GraphAnomalyAdapter: class MockGraphAnomalyAdapter {
      detect = mockDetect;
    },
  };
});

import { gatherAnomalies } from '../../../src/server/gather/anomalies';

describe('gatherAnomalies', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns anomaly data when graph is available', async () => {
    mockLoad.mockResolvedValue(true);
    mockDetect.mockReturnValue({
      statisticalOutliers: [
        {
          nodeId: 'n1',
          nodeName: 'big-file.ts',
          nodeType: 'file',
          metric: 'fanOut',
          value: 30,
          zScore: 3.5,
          mean: 5,
          stdDev: 7,
        },
      ],
      articulationPoints: [
        {
          nodeId: 'n2',
          nodeName: 'core-utils.ts',
          componentsIfRemoved: 3,
          dependentCount: 15,
        },
      ],
      overlapping: [],
      summary: {
        totalNodesAnalyzed: 100,
        outlierCount: 1,
        articulationPointCount: 1,
        overlapCount: 0,
        metricsAnalyzed: ['fanOut'],
        warnings: [],
        threshold: 2.0,
      },
    });

    const result = await gatherAnomalies('/project');

    expect('available' in result && !result.available).toBe(false);
    if ('available' in result) return;
    expect(result.outliers).toHaveLength(1);
    expect(result.outliers[0]).toEqual({
      nodeId: 'n1',
      name: 'big-file.ts',
      type: 'file',
      metric: 'fanOut',
      value: 30,
      zScore: 3.5,
    });
    expect(result.articulationPoints).toHaveLength(1);
    expect(result.articulationPoints[0]).toEqual({
      nodeId: 'n2',
      name: 'core-utils.ts',
      componentsIfRemoved: 3,
      dependentCount: 15,
    });
    expect(result.overlapCount).toBe(0);
  });

  it('returns unavailable when graph fails to load', async () => {
    mockLoad.mockResolvedValue(false);

    const result = await gatherAnomalies('/project');

    expect('available' in result).toBe(true);
    if (!('available' in result)) return;
    expect(result.available).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns unavailable when adapter throws', async () => {
    mockLoad.mockResolvedValue(true);
    mockDetect.mockImplementation(() => {
      throw new Error('Graph analysis failed');
    });

    const result = await gatherAnomalies('/project');

    expect('available' in result).toBe(true);
    if (!('available' in result)) return;
    expect(result.available).toBe(false);
    expect(result.reason).toContain('Graph analysis failed');
  });
});
