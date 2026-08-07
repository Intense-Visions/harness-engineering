/**
 * Enforcing deploy-gate — core engine types.
 *
 * Mirrors `packages/core/src/architecture/`: pure functions over injected IO, no
 * direct `process`/`fs` reads inside the classifier. The CLI (Phase 2) supplies a
 * concrete {@link DeploymentFsPort} and maps {@link DeploymentExitCode} through
 * `process.exit`.
 */

/** Injected IO port so the engine is pure (mirrors architecture/'s no-direct-process rule). */
export interface DeploymentFsPort {
  /** True when a path (file or dir) exists under root. */
  exists(relPath: string): boolean;
  /** File contents, or null when absent/unreadable (never throws). */
  readFile(relPath: string): string | null;
  /** Shallow list of entries directly under a relative dir (files + dirs); [] when absent. */
  listDir(relPath: string): string[];
}

export type DeploymentSeverity = 'hard' | 'soft';

export interface DeploymentFinding {
  code: string; // e.g. "DEPLOY-SEC001"
  severity: DeploymentSeverity;
  file?: string;
  detail: string;
  /** Human-facing fix; DEPLOY-RB001 references harness-rollback. */
  remediation: string;
}

/** A captured deployment file: path relative to root + its raw contents. */
export interface DeploymentFile {
  path: string;
  content: string;
  /** True when the file was found but could not be parsed (still counts as a surface). */
  unparseable?: boolean;
}

export interface DeploymentSurface {
  /** CI/CD pipeline files (workflows, .gitlab-ci.yml, Jenkinsfile, ...) with contents. */
  pipelineFiles: DeploymentFile[];
  /** Deploy scripts (deploy/, scripts/deploy*) with contents. */
  deployScripts: DeploymentFile[];
  /** Committed environment files (.env.production, .env.staging, ...) with contents. */
  envFiles: DeploymentFile[];
  /** Environment names detected (dev, staging, production, ...). */
  detectedEnvironments: string[];
  /** A production deploy target is reachable. */
  hasProductionTarget: boolean;
  /** A production deploy is reachable with NO promotion/approval/protection gate. */
  productionUngated: boolean;
  /** Any rollback signal found in files (revert/rollback workflow or script, runbook). */
  rollbackSignalInFiles: boolean;
  /** Post-deploy health check wired for a deploy target. */
  hasHealthCheck: boolean;
  /** Recommended pre-deploy stages that are present (security scan, smoke test, ...). */
  presentStages: string[];
}

/** Structurally compatible with the CLI's DeploymentGateConfigSchema (Phase 1 schema task). */
export interface DeploymentGateConfig {
  enabled?: boolean;
  /** Per-code severity override. 'off' downgrades a HARD rule to advisory (except DEPLOY-SEC001). */
  rules?: Record<string, 'error' | 'warn' | 'off'>;
  /**
   * Passthrough seam set by the CLI (Phase 2) from `config.rollback != null`, so
   * the engine can honor a configured rollback path (D5) without re-reading
   * config. Keeps the engine pure.
   */
  rollbackConfigured?: boolean;
}

export interface DeploymentGateResult {
  status: 'pass' | 'blocked' | 'abstained' | 'disabled';
  findings: DeploymentFinding[];
  hardViolations: DeploymentFinding[];
  softViolations: DeploymentFinding[];
  detectedEnvironments: string[];
  rollbackPathPresent: boolean;
}

/** Equals the CLI ExitCode values (SUCCESS=0, VALIDATION_FAILED=1, ERROR=2, ZERO_DENOMINATOR=3). */
export type DeploymentExitCode = 0 | 1 | 2 | 3;
