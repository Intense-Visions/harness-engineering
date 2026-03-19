import { describe, it, expect } from 'vitest';
import { RegressionDetector } from '../../src/performance/regression-detector';
import type { BenchmarkResult, Baseline, CriticalPathSet } from '../../src/performance/types';

describe('RegressionDetector', () => {
  const detector = new RegressionDetector();

  const baseline: Baseline = { opsPerSec: 1000, meanMs: 1.0, p99Ms: 2.0, marginOfError: 0.03 };
  const criticalPaths: CriticalPathSet = {
    entries: [{ file: 'hot.bench.ts', function: 'hotFn', source: 'annotation' }],
    stats: { annotated: 1, graphInferred: 0, total: 1 },
  };

  it('detects >10% regression as Tier 2 warning', () => {
    const current: BenchmarkResult = {
      name: 'bench1',
      file: 'test.bench.ts',
      opsPerSec: 850,
      meanMs: 1.18,
      p99Ms: 2.5,
      marginOfError: 0.03,
    };
    const baselines = { 'test.bench.ts::bench1': baseline };

    const report = detector.detect([current], baselines, criticalPaths);
    expect(report.regressions).toHaveLength(1);
    expect(report.regressions[0]!.tier).toBe(2);
    expect(report.regressions[0]!.severity).toBe('warning');
    expect(report.regressions[0]!.regressionPct).toBeGreaterThan(10);
  });

  it('detects >5% regression on critical path as Tier 1 error', () => {
    const current: BenchmarkResult = {
      name: 'hotFn',
      file: 'hot.bench.ts',
      opsPerSec: 920,
      meanMs: 1.09,
      p99Ms: 2.2,
      marginOfError: 0.03,
    };
    const baselines = { 'hot.bench.ts::hotFn': baseline };

    const report = detector.detect([current], baselines, criticalPaths);
    expect(report.regressions).toHaveLength(1);
    expect(report.regressions[0]!.tier).toBe(1);
    expect(report.regressions[0]!.severity).toBe('error');
    expect(report.regressions[0]!.isCriticalPath).toBe(true);
  });

  it('does not flag regressions within noise margin', () => {
    const current: BenchmarkResult = {
      name: 'bench1',
      file: 'test.bench.ts',
      opsPerSec: 950,
      meanMs: 1.05,
      p99Ms: 2.1,
      marginOfError: 0.03,
    };
    const baselines = { 'test.bench.ts::bench1': baseline };

    const report = detector.detect([current], baselines, criticalPaths);
    const flagged = report.regressions.filter((r) => !r.withinNoise);
    expect(flagged).toHaveLength(0);
  });

  it('reports improvements', () => {
    const current: BenchmarkResult = {
      name: 'bench1',
      file: 'test.bench.ts',
      opsPerSec: 1200,
      meanMs: 0.83,
      p99Ms: 1.5,
      marginOfError: 0.02,
    };
    const baselines = { 'test.bench.ts::bench1': baseline };

    const report = detector.detect([current], baselines, criticalPaths);
    expect(report.improvements).toHaveLength(1);
    expect(report.improvements[0]!.improvementPct).toBeGreaterThan(0);
  });

  it('counts new benchmarks without baselines', () => {
    const current: BenchmarkResult = {
      name: 'newBench',
      file: 'new.bench.ts',
      opsPerSec: 500,
      meanMs: 2.0,
      p99Ms: 3.0,
      marginOfError: 0.05,
    };

    const report = detector.detect([current], {}, criticalPaths);
    expect(report.stats.newBenchmarks).toBe(1);
    expect(report.regressions).toHaveLength(0);
  });
});
