import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ArchConfig, MetricResult, Violation } from '../../src/architecture/types';

// File discovery is async glob, whose order is not guaranteed. Make it controllable:
// `discoveryOrder` decides whether the real (sorted-for-determinism here) list is
// handed to the collector forwards or reversed, simulating two runs whose glob
// completed in different orders on an unchanged tree (#2564).
let discoveryOrder: 'forward' | 'reverse' = 'forward';
vi.mock('../../src/shared/fs-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shared/fs-utils')>();
  return {
    ...actual,
    findFiles: async (...args: Parameters<typeof actual.findFiles>) => {
      const files = (await actual.findFiles(...args)).sort();
      return discoveryOrder === 'reverse' ? files.reverse() : files;
    },
  };
});

const { runAll, ComplexityCollector } = await import('../../src/architecture/collectors/index');
const { sortMetricResults, compareViolations } =
  await import('../../src/architecture/sort-results');

const config: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: { complexity: 1 },
  modules: {},
  excludePatterns: [],
  regressionTolerance: 0.01,
};

const branchy = (name: string) =>
  `export function ${name}(a: number, b: number) {\n` +
  `  if (a > 1) { return 1; }\n  if (b > 1) { return 2; }\n  if (a > b) { return 3; }\n  return 0;\n}\n`;

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'arch-sort-'));
  for (const n of ['alpha', 'bravo', 'charlie', 'delta']) {
    await writeFile(join(root, `${n}.ts`), branchy(n), 'utf-8');
  }
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function collectWith(order: 'forward' | 'reverse'): Promise<MetricResult[]> {
  discoveryOrder = order;
  return runAll(config, root, [new ComplexityCollector()]);
}

describe('sortMetricResults — deterministic check-arch output (#2564)', () => {
  it('positive control: unsorted collector output follows discovery order', async () => {
    const a = await collectWith('forward');
    const b = await collectWith('reverse');
    expect(a[0]!.violations.length).toBe(4);
    // Same content, different order — the churn the fix must remove.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('serializes identically regardless of file discovery order', async () => {
    const a = sortMetricResults(await collectWith('forward'));
    const b = sortMetricResults(await collectWith('reverse'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0]!.violations.map((v) => v.file)).toEqual([
      'alpha.ts',
      'bravo.ts',
      'charlie.ts',
      'delta.ts',
    ]);
  });

  it('orders results by category then scope, independent of input order, without mutating it', () => {
    const v = (file: string, detail = 'd'): Violation => ({
      id: `${file}:${detail}`,
      file,
      detail,
      severity: 'warning',
    });
    const results: MetricResult[] = [
      { category: 'module-size', scope: 'src/b', value: 1, violations: [v('z.ts'), v('a.ts')] },
      {
        category: 'complexity',
        scope: 'project',
        value: 2,
        violations: [v('m.ts', 'y'), v('m.ts', 'x')],
      },
      { category: 'module-size', scope: 'src/a', value: 0, violations: [] },
    ];
    const snapshot = JSON.stringify(results);
    const forward = sortMetricResults(results);
    const backward = sortMetricResults([...results].reverse());

    expect(JSON.stringify(results)).toBe(snapshot);
    expect(JSON.stringify(forward)).toBe(JSON.stringify(backward));
    expect(forward.map((r) => `${r.category}|${r.scope}`)).toEqual([
      'complexity|project',
      'module-size|src/a',
      'module-size|src/b',
    ]);
    expect(forward[0]!.violations.map((x) => x.detail)).toEqual(['x', 'y']);
    expect(forward[2]!.violations.map((x) => x.file)).toEqual(['a.ts', 'z.ts']);
  });

  it('compareViolations is a total order on file, detail, id', () => {
    const base: Violation = { id: 'b', file: 'f.ts', detail: 'd', severity: 'error' };
    expect(compareViolations(base, { ...base, file: 'g.ts' })).toBeLessThan(0);
    expect(compareViolations(base, { ...base, detail: 'c' })).toBeGreaterThan(0);
    expect(compareViolations(base, { ...base, id: 'a' })).toBeGreaterThan(0);
    expect(compareViolations(base, { ...base })).toBe(0);
  });
});
