import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRunAll, mockDiff, mockLoad } = vi.hoisted(() => ({
  mockRunAll: vi.fn(),
  mockDiff: vi.fn(),
  mockLoad: vi.fn(),
}));

vi.mock('@harness-engineering/core', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/core')>(
    '@harness-engineering/core'
  );
  return {
    ...actual,
    runAll: mockRunAll,
    diff: mockDiff,
    ArchBaselineManager: class MockArchBaselineManager {
      load = mockLoad;
    },
    ArchConfigSchema: {
      parse: (v: unknown) =>
        v ?? {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: {},
        },
    },
  };
});

import { gatherArch } from '../../../src/server/gather/arch';

describe('gatherArch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns arch data when baseline exists and diff passes', async () => {
    mockRunAll.mockResolvedValue([]);
    mockLoad.mockReturnValue({
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      updatedFrom: 'abc123',
      metrics: {},
    });
    mockDiff.mockReturnValue({
      passed: true,
      newViolations: [],
      resolvedViolations: [],
      preExisting: [],
      regressions: [],
    });

    const result = await gatherArch('/project');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.passed).toBe(true);
    expect(result.totalViolations).toBe(0);
    expect(result.regressions).toEqual([]);
    expect(result.newViolations).toEqual([]);
  });

  it('returns failures when diff has regressions and new violations', async () => {
    mockRunAll.mockResolvedValue([]);
    mockLoad.mockReturnValue({
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      updatedFrom: 'abc123',
      metrics: {},
    });
    mockDiff.mockReturnValue({
      passed: false,
      newViolations: [{ id: 'v1', file: 'src/a.ts', detail: 'Circular dep', severity: 'error' }],
      resolvedViolations: [],
      preExisting: [],
      regressions: [{ category: 'complexity', baselineValue: 5, currentValue: 8, delta: 3 }],
    });

    const result = await gatherArch('/project');

    if ('error' in result) return;
    expect(result.passed).toBe(false);
    expect(result.totalViolations).toBe(1);
    expect(result.regressions).toEqual([{ category: 'complexity', delta: 3 }]);
    expect(result.newViolations).toEqual([
      { file: 'src/a.ts', detail: 'Circular dep', severity: 'error' },
    ]);
  });

  it('returns passed with zero violations when no baseline exists', async () => {
    mockRunAll.mockResolvedValue([]);
    mockLoad.mockReturnValue(null);

    const result = await gatherArch('/project');

    if ('error' in result) return;
    expect(result.passed).toBe(true);
    expect(result.totalViolations).toBe(0);
  });

  it('returns error when runAll throws', async () => {
    mockRunAll.mockRejectedValue(new Error('Collector failed'));

    const result = await gatherArch('/project');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Collector failed');
  });
});
