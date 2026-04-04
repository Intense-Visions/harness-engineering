/**
 * Health snapshot types -- captured codebase health state.
 * Types only in this module. Capture logic lives in a separate module (Phase 2).
 */

/** Granular check results from assess_project and related tools. */
export interface HealthChecks {
  deps: { passed: boolean; issueCount: number; circularDeps: number; layerViolations: number };
  entropy: { passed: boolean; deadExports: number; deadFiles: number; driftCount: number };
  security: { passed: boolean; findingCount: number; criticalCount: number };
  perf: { passed: boolean; violationCount: number };
  docs: { passed: boolean; undocumentedCount: number };
  lint: { passed: boolean; issueCount: number };
}

/** Aggregated graph and coverage metrics. */
export interface HealthMetrics {
  avgFanOut: number;
  maxFanOut: number;
  avgCyclomaticComplexity: number;
  maxCyclomaticComplexity: number;
  avgCouplingRatio: number;
  /** Null when test coverage data is not available. */
  testCoverage: number | null;
  anomalyOutlierCount: number;
  articulationPointCount: number;
}

/** A point-in-time snapshot of codebase health. */
export interface HealthSnapshot {
  /** ISO 8601 timestamp of when the snapshot was captured. */
  capturedAt: string;
  /** Git commit SHA at capture time, used for staleness detection. */
  gitHead: string;
  /** Absolute path to the project root. */
  projectPath: string;
  /** Granular pass/fail and issue counts from health checks. */
  checks: HealthChecks;
  /** Aggregated numeric metrics from graph analysis and coverage tools. */
  metrics: HealthMetrics;
  /** Active signal identifiers derived from checks and metrics. */
  signals: string[];
}
