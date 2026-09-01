/**
 * Types for the per-surface rework-rate metric.
 *
 * A **surface** is a file path. **Rework** is a follow-up fix/revert commit that
 * re-touches a surface already changed earlier in the lookback window. Rework is
 * split into **planned** (the reworking commit shares an issue reference that is a
 * known roadmap-linked item — continued multi-part delivery) versus **unplanned**
 * (a correction that does not trace to planned work). The headline rate counts
 * unplanned rework only. Report-only: nothing here gates.
 */

/** A rework commit is either continued planned delivery or unplanned correction. */
export type ReworkClassification = 'planned' | 'unplanned';

/** Per-surface (file-path) rework aggregation. */
export interface SurfaceRework {
  /** The surface — a file path. */
  path: string;
  /** Commits touching this surface within the window (the per-surface denominator). */
  totalCommits: number;
  /** Fix/revert commits that re-touched an already-changed surface. */
  reworkCommits: number;
  /** Rework commits classified as planned (roadmap-linked multi-part delivery). */
  plannedReworkCommits: number;
  /** Rework commits classified as unplanned (waste). */
  unplannedReworkCommits: number;
  /** `unplannedReworkCommits / totalCommits` — the headline per-surface rate. */
  unplannedReworkRate: number;
  /** SHAs of the reworking commits (planned + unplanned), oldest→newest. */
  reworkingShas: string[];
}

/**
 * The machine-readable rework report. `resolvedWindow` and `denominatorLabel` are
 * first-class fields so the numbers are never read without their base (AC2).
 */
export interface ReworkReport {
  /** The normalized lookback window (e.g. `"30 days ago"`). */
  resolvedWindow: string;
  /** Human label for the per-surface denominator. */
  denominatorLabel: string;
  /** Total commits scanned in the window (across all surfaces). */
  totalCommitsScanned: number;
  /** ISO 8601 timestamp of when the report was generated. */
  generatedAt: string;
  /** Per-surface breakdown, sorted by `unplannedReworkRate` descending. */
  surfaces: SurfaceRework[];
}

/** Options for {@link computeRework}. */
export interface ComputeReworkOptions {
  /** Lookback shorthand (e.g. `30d`) — passed through `normalizeSince`. */
  since: string;
  /** Repository root to walk. */
  cwd: string;
  /** Exclude surfaces with fewer than this many total commits (default 2). */
  minCommits?: number;
  /**
   * Injected planned-issue set (roadmap-linked GitHub issue numbers). A rework
   * commit whose parsed issue refs intersect this set is `planned`. Injectable so
   * fixture history can assert classification deterministically (AC1); the core
   * module stays roadmap-agnostic. Defaults to empty (all rework unplanned).
   */
  plannedIssues?: Set<number>;
  /** Injectable clock for `generatedAt` (deterministic tests). */
  now?: () => Date;
}
