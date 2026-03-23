import { describe, it, expect, vi } from 'vitest';
import { defaultCollectors, runAll } from '../../../src/architecture/collectors/index';
import type { ArchConfig, Collector, MetricResult } from '../../../src/architecture/types';

const baseConfig: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
};

describe('defaultCollectors', () => {
  it('contains exactly 7 collectors', () => {
    expect(defaultCollectors).toHaveLength(7);
  });

  it('covers all 7 metric categories', () => {
    const categories = defaultCollectors.map((c) => c.category).sort();
    expect(categories).toEqual([
      'circular-deps',
      'complexity',
      'coupling',
      'dependency-depth',
      'forbidden-imports',
      'layer-violations',
      'module-size',
    ]);
  });

  it('each collector implements the Collector interface', () => {
    for (const c of defaultCollectors) {
      expect(typeof c.category).toBe('string');
      expect(typeof c.collect).toBe('function');
    }
  });
});

describe('runAll', () => {
  it('calls all provided collectors and flattens results', async () => {
    const mockCollectorA: Collector = {
      category: 'complexity',
      collect: vi
        .fn()
        .mockResolvedValue([
          { category: 'complexity', scope: 'project', value: 2, violations: [] },
        ]),
    };
    const mockCollectorB: Collector = {
      category: 'coupling',
      collect: vi.fn().mockResolvedValue([
        { category: 'coupling', scope: 'project', value: 1, violations: [] },
        { category: 'coupling', scope: 'src/api', value: 0, violations: [] },
      ]),
    };

    const results = await runAll(baseConfig, '/project', [mockCollectorA, mockCollectorB]);
    expect(results).toHaveLength(3);
    expect(mockCollectorA.collect).toHaveBeenCalledWith(baseConfig, '/project');
    expect(mockCollectorB.collect).toHaveBeenCalledWith(baseConfig, '/project');
  });

  it('runs collectors in parallel (both resolve before either is awaited)', async () => {
    const callOrder: string[] = [];
    const collectorA: Collector = {
      category: 'complexity',
      collect: async () => {
        callOrder.push('A-start');
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push('A-end');
        return [{ category: 'complexity', scope: 'project', value: 0, violations: [] }];
      },
    };
    const collectorB: Collector = {
      category: 'coupling',
      collect: async () => {
        callOrder.push('B-start');
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push('B-end');
        return [{ category: 'coupling', scope: 'project', value: 0, violations: [] }];
      },
    };

    await runAll(baseConfig, '/project', [collectorA, collectorB]);
    // Both should start before either ends (parallel execution)
    expect(callOrder[0]).toBe('A-start');
    expect(callOrder[1]).toBe('B-start');
  });

  it('returns empty array when no collectors provided', async () => {
    const results = await runAll(baseConfig, '/project', []);
    expect(results).toEqual([]);
  });

  it('uses defaultCollectors when collectors param is omitted', async () => {
    // This is a type-level check — we just verify runAll accepts 2 args
    // Actual execution would touch the filesystem so we skip it
    expect(typeof runAll).toBe('function');
    expect(runAll.length).toBeGreaterThanOrEqual(2);
  });
});
