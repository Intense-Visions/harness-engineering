import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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

  // Replaces an `expect(runAll.length).toBeGreaterThanOrEqual(2)` assertion that
  // was unfalsifiable in BOTH directions: defaulted parameters are excluded from
  // `Function.length`, so it passed as shipped (length 2) and would equally pass
  // if the default were deleted and the parameter made required (length 3).
  // Measured: replacing `= defaultCollectors` with `= []` — which silently stops
  // all seven collectors — left this file 7/7 and the whole collectors directory
  // 79/79 green.
  //
  // The two-file fixture is LOAD-BEARING. On an empty tmpdir this same assertion
  // fails as shipped, because `module-size` and `dependency-depth` emit no rows
  // at all for a tree with no source in it.
  it('invokes every default collector on the two-argument seam', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'runall-seam-')));
    try {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'src/a.ts'),
        "import { b } from './b';\nexport const a = () => b;\n"
      );
      fs.writeFileSync(path.join(root, 'src/b.ts'), 'export const b = 1;\n');

      const results = await runAll(baseConfig, root);

      expect(new Set(results.map((r) => r.category))).toEqual(
        new Set(defaultCollectors.map((c) => c.category))
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // `runAll`'s `Promise.allSettled` rejection branch is the SOLE producer of the
  // `{ error }` metadata that `check-arch`'s `classifyMeasurement` reads to
  // classify a crashed collector as `abstained` rather than as a clean 0 — and
  // the consumer test hand-constructs that metadata, so producer and consumer
  // were each tested in isolation with the contract between them untested.
  // Measured: replacing the whole rejection branch with a `throw` left all of
  // `packages/core` green (493 files / 5753 tests).
  it('substitutes an abstaining 0 with an error denominator when a collector rejects', async () => {
    const boom: Collector = {
      category: 'complexity',
      collect: () => Promise.reject(new Error('boom')),
    };
    const ok: Collector = {
      category: 'coupling',
      collect: async () => [
        { category: 'coupling', scope: 'project', value: 1, violations: [] } as MetricResult,
      ],
    };

    const [a, b] = await runAll(baseConfig, '/project', [boom, ok]);

    expect(a).toMatchObject({
      category: 'complexity',
      scope: 'project',
      value: 0,
      violations: [],
      metadata: { error: expect.stringContaining('boom') },
    });
    // The sibling still reports. This is the only assertion that would catch
    // `Promise.allSettled` being swapped for `Promise.all`, where one rejection
    // drops the whole batch.
    expect(b!.value).toBe(1);
  });
});
