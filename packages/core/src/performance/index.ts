/**
 * Performance module for benchmarking, regression detection, and critical path analysis.
 */

/**
 * Baseline manager for handling performance baselines.
 */
export { BaselineManager } from './baseline-manager';

/**
 * Benchmark runner for executing performance benchmarks.
 */
export { BenchmarkRunner } from './benchmark-runner';
export type { BenchmarkRunOptions } from './benchmark-runner';

/**
 * Regression detector for identifying performance regressions against baselines.
 */
export { RegressionDetector } from './regression-detector';

/**
 * Critical path resolver for analyzing codebase critical paths.
 */
export { CriticalPathResolver } from './critical-path';
export type { GraphCriticalPathData } from './critical-path';

/**
 * Type definitions for benchmarks, baselines, regressions, and critical paths.
 */
export type {
  BenchmarkResult,
  Baseline,
  BaselinesFile,
  RegressionResult,
  RegressionReport,
  CriticalPathEntry,
  CriticalPathSet,
} from './types';
