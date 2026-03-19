export interface BenchmarkResult {
  name: string;
  file: string;
  opsPerSec: number;
  meanMs: number;
  p99Ms: number;
  marginOfError: number;
}

export interface Baseline {
  opsPerSec: number;
  meanMs: number;
  p99Ms: number;
  marginOfError: number;
}

export interface BaselinesFile {
  version: 1;
  updatedAt: string;
  updatedFrom: string;
  benchmarks: Record<string, Baseline>;
}

export interface RegressionResult {
  benchmark: string;
  current: BenchmarkResult;
  baseline: Baseline;
  regressionPct: number;
  isCriticalPath: boolean;
  tier: 1 | 2 | 3;
  severity: 'error' | 'warning' | 'info';
  withinNoise: boolean;
}

export interface RegressionReport {
  regressions: RegressionResult[];
  improvements: Array<{
    benchmark: string;
    improvementPct: number;
  }>;
  stats: {
    benchmarksCompared: number;
    regressionCount: number;
    improvementCount: number;
    newBenchmarks: number;
  };
}

export interface CriticalPathEntry {
  file: string;
  function: string;
  source: 'annotation' | 'graph-inferred';
  fanIn?: number;
}

export interface CriticalPathSet {
  entries: CriticalPathEntry[];
  stats: {
    annotated: number;
    graphInferred: number;
    total: number;
  };
}
