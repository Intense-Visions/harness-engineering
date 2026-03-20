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

// --- Phase 3: Context Scoping types ---

/**
 * Change type detected from commit message prefix or diff heuristic.
 */
export type ChangeType = 'feature' | 'bugfix' | 'refactor' | 'docs';

/**
 * Review domain — each gets its own scoped context bundle.
 */
export type ReviewDomain = 'compliance' | 'bug' | 'security' | 'architecture';

/**
 * A file included in a context bundle with its content.
 */
export interface ContextFile {
  /** File path (project-relative) */
  path: string;
  /** File content (full or truncated to budget) */
  content: string;
  /** Why this file was included */
  reason:
    | 'changed'
    | 'import'
    | 'test'
    | 'spec'
    | 'type'
    | 'convention'
    | 'graph-dependency'
    | 'graph-impact';
  /** Line count of the content */
  lines: number;
}

/**
 * Commit history entry for a changed file.
 */
export interface CommitHistoryEntry {
  /** Short SHA */
  sha: string;
  /** One-line commit message */
  message: string;
  /** File path this commit touched */
  file: string;
}

/**
 * Context bundle assembled for a single review domain.
 * Each Phase 4 subagent receives one of these.
 */
export interface ContextBundle {
  /** Which review domain this bundle is for */
  domain: ReviewDomain;
  /** Detected change type */
  changeType: ChangeType;
  /** Files that were changed in the diff */
  changedFiles: ContextFile[];
  /** Additional context files (imports, tests, specs, types, conventions) */
  contextFiles: ContextFile[];
  /** Recent commit history for changed files */
  commitHistory: CommitHistoryEntry[];
  /** Total lines of diff */
  diffLines: number;
  /** Total lines of context gathered */
  contextLines: number;
}

/**
 * Information about a diff, used as input to context scoping.
 */
export interface DiffInfo {
  /** Changed file paths (project-relative) */
  changedFiles: string[];
  /** New files (subset of changedFiles) */
  newFiles: string[];
  /** Deleted files (subset of changedFiles) */
  deletedFiles: string[];
  /** Total lines of diff across all files */
  totalDiffLines: number;
  /** Per-file diff content */
  fileDiffs: Map<string, string>;
}

/**
 * Adapter interface for graph queries.
 * Callers implement this using @harness-engineering/graph when available.
 * The context scoper does NOT depend on the graph package directly.
 */
export interface GraphAdapter {
  /**
   * Find direct dependencies of a file (imports, calls).
   * Returns file paths of dependencies.
   */
  getDependencies(filePath: string): Promise<string[]>;

  /**
   * Find files impacted by changes to a file (reverse dependencies, tests, docs).
   * Returns file paths of impacted nodes grouped by category.
   */
  getImpact(filePath: string): Promise<{
    tests: string[];
    docs: string[];
    code: string[];
  }>;

  /**
   * Check if a path exists in the dependency graph between two files.
   * Used for reachability validation in Phase 5 (exported here for shared use).
   */
  isReachable(fromFile: string, toFile: string, maxDepth?: number): Promise<boolean>;
}

/**
 * Options for context scoping.
 */
export interface ContextScopeOptions {
  /** Project root directory */
  projectRoot: string;
  /** Diff information */
  diff: DiffInfo;
  /** Most recent commit message (for change-type detection) */
  commitMessage: string;
  /** Graph adapter (optional -- falls back to heuristics when absent) */
  graph?: GraphAdapter;
  /** Convention files to include for compliance domain */
  conventionFiles?: string[];
  /** Output from `harness check-deps` (for architecture fallback) */
  checkDepsOutput?: string;
}
