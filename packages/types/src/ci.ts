/**
 * Names of standard CI checks.
 */
export type CICheckName =
  | 'validate'
  | 'deps'
  | 'docs'
  | 'entropy'
  | 'security'
  | 'perf'
  | 'phase-gate'
  | 'arch'
  | 'traceability';

/**
 * Status of a CI check.
 */
export type CICheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

/**
 * A specific issue found during a CI check.
 */
export interface CICheckIssue {
  /** Severity level */
  severity: 'error' | 'warning';
  /** Descriptive message */
  message: string;
  /** Path to the affected file */
  file?: string;
  /** Line number in the affected file */
  line?: number;
}

/**
 * Result of a single CI check execution.
 */
export interface CICheckResult {
  /** Name of the check */
  name: CICheckName;
  /** Final status of the check */
  status: CICheckStatus;
  /** List of issues discovered */
  issues: CICheckIssue[];
  /** Execution time in milliseconds */
  durationMs: number;
}

/**
 * Summary counts for a set of CI checks.
 */
export interface CICheckSummary {
  /** Total number of checks run */
  total: number;
  /** Number of passing checks */
  passed: number;
  /** Number of failing checks */
  failed: number;
  /** Number of checks with warnings */
  warnings: number;
  /** Number of skipped checks */
  skipped: number;
}

/**
 * Final report for a CI run.
 */
export interface CICheckReport {
  /** Schema version */
  version: 1;
  /** Name of the project */
  project: string;
  /** ISO timestamp of the run */
  timestamp: string;
  /** Detailed results for each check */
  checks: CICheckResult[];
  /** Aggregated summary */
  summary: CICheckSummary;
  /** Process exit code suggested for the CI runner */
  exitCode: 0 | 1 | 2;
}

/**
 * Severity level that should trigger a CI failure.
 */
export type CIFailOnSeverity = 'error' | 'warning';

/**
 * Configuration options for the CI command.
 */
export interface CICheckOptions {
  /** Checks to skip */
  skip?: CICheckName[];
  /** Severity level that causes failure */
  failOn?: CIFailOnSeverity;
  /** Custom config file path */
  configPath?: string;
}

/**
 * Supported CI platforms.
 */
export type CIPlatform = 'github' | 'gitlab' | 'generic';

/**
 * Options for initializing CI configuration.
 */
export interface CIInitOptions {
  /** Target CI platform */
  platform?: CIPlatform;
  /** Checks to enable */
  checks?: CICheckName[];
}
