/**
 * A finding produced by a mechanical check (lint, typecheck, security scan, harness validate/deps/docs).
 * Used as input to the exclusion set and reported when the pipeline stops due to mechanical failures.
 */
export interface MechanicalFinding {
  /** Which mechanical tool produced this finding */
  tool: 'validate' | 'check-deps' | 'check-docs' | 'security-scan';
  /** File path (absolute or project-relative) */
  file: string;
  /** Line number, if available */
  line?: number;
  /** Rule ID from the tool (e.g., security rule ID) */
  ruleId?: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning';
}

/**
 * Result of running all mechanical checks.
 */
export interface MechanicalCheckResult {
  /** Overall pass/fail — false if any check produced errors */
  pass: boolean;
  /** True if the pipeline should stop (validate or check-deps failed) */
  stopPipeline: boolean;
  /** All findings from all mechanical checks */
  findings: MechanicalFinding[];
  /** Per-check status for reporting */
  checks: {
    validate: MechanicalCheckStatus;
    checkDeps: MechanicalCheckStatus;
    checkDocs: MechanicalCheckStatus;
    securityScan: MechanicalCheckStatus;
  };
}

export type MechanicalCheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

/**
 * Options for running mechanical checks.
 */
export interface MechanicalCheckOptions {
  /** Project root directory */
  projectRoot: string;
  /** Config object (from resolveConfig or harness.config.json) */
  config: Record<string, unknown>;
  /** Skip specific checks */
  skip?: Array<'validate' | 'check-deps' | 'check-docs' | 'security-scan'>;
  /** Only scan these files for security (e.g., changed files from a PR) */
  changedFiles?: string[];
}

/**
 * Report on evidence coverage across review findings.
 * Produced by the evidence gate and included in review output.
 */
export interface EvidenceCoverageReport {
  /** Total evidence entries loaded from session state */
  totalEntries: number;
  /** Number of findings that have matching evidence entries */
  findingsWithEvidence: number;
  /** Number of findings without matching evidence (flagged [UNVERIFIED]) */
  uncitedCount: number;
  /** Titles of uncited findings (for reporting) */
  uncitedFindings: string[];
  /** Coverage percentage (findingsWithEvidence / total findings * 100) */
  coveragePercentage: number;
}
