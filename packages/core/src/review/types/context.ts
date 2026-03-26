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
  /**
   * Recent commit history for changed files.
   * @remarks Empty by default from `scopeContext()`. Callers should populate this
   * via `git log` commands at the orchestration layer before passing bundles to
   * Phase 4 subagents. Example: `git log --oneline -5 -- <file>` per changed file.
   */
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
  /** Pre-gathered commit history entries. If provided, included in all bundles. */
  commitHistory?: CommitHistoryEntry[];
}
