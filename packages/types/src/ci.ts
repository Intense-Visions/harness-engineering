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
  /**
   * Originating rule identifier, when the check attributes issues to rules
   * (e.g. the security scanner's `SEC-XXX-NNN`). Used to attribute a failing
   * finding to the constraint pack(s) whose rule prefixes cover it.
   */
  ruleId?: string;
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
 * Lifecycle stage at which a constraint pack is enforced. Packs opt a project
 * into blocking rules per stage rather than all-at-once:
 * - `pre-commit`  — cheap checks a developer runs before committing
 * - `pre-merge`   — checks a pull request must pass before it lands
 * - `pre-release` — the strictest gate, run before cutting a release
 */
export type ConstraintStage = 'pre-commit' | 'pre-merge' | 'pre-release';

/**
 * Compliance verdict for one constraint pack at one lifecycle stage.
 * - `compliant`     — the pack's rules were evaluated and none were violated
 * - `non-compliant` — at least one of the pack's rules was violated (blocking)
 * - `n/a`           — the pack does not apply at the stage that was run, or the
 *                     governing check was skipped, so no verdict was produced
 */
export type ConstraintPackComplianceStatus = 'compliant' | 'non-compliant' | 'n/a';

/**
 * Compliance verdict for a single (pack, stage) pair.
 */
export interface ConstraintPackStageCompliance {
  /** Lifecycle stage this verdict is for. */
  stage: ConstraintStage;
  /** Whether the pack's rules held at this stage. */
  status: ConstraintPackComplianceStatus;
}

/**
 * Per-stage compliance summary for one opted-in constraint pack.
 */
export interface ConstraintPackCompliance {
  /** Name of the resolved constraint pack. */
  pack: string;
  /** One verdict per stage the pack declares. */
  stages: ConstraintPackStageCompliance[];
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
  /**
   * Per-pack, per-stage compliance summary for opted-in constraint packs.
   * Absent when the project has opted into no packs (default behavior).
   */
  constraintPacks?: ConstraintPackCompliance[];
  /**
   * Names listed in `constraintPacks` that matched no known built-in pack.
   * Absent when every configured name resolved.
   */
  unknownConstraintPacks?: string[];
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
