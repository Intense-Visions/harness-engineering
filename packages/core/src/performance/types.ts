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

/**
 * Whether the graph-inference half of critical-path resolution actually ran.
 * `stats.graphInferred: 0` alone cannot tell "inference found nothing" from
 * "inference never ran" (#2327); this field can.
 */
export type CriticalPathGraphInference = { status: 'ran' } | { status: 'not-run'; reason: string };

export interface CriticalPathSet {
  entries: CriticalPathEntry[];
  stats: {
    annotated: number;
    graphInferred: number;
    total: number;
  };
  graphInference: CriticalPathGraphInference;
  /**
   * Present only when `entries` is empty. An empty critical-path set is the
   * absence of a signal, not a measurement that the project has no hot paths,
   * so consumers scoring on critical-path membership must treat that axis as
   * undefined rather than as a uniform "cold" (#2327).
   */
  noSignal?: { reason: string };
}
