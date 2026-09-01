/**
 * Merged-but-unreleased inventory — core engine types.
 *
 * Mirrors `packages/core/src/deployment/`: pure functions over injected IO, no
 * direct `process`/`fs`/`child_process` reads inside the engine. The CLI supplies
 * concrete {@link ReleaseInventoryGitPort} / {@link ReleaseInventoryFsPort}
 * adapters over node and renders the {@link ReleaseInventoryResult}.
 *
 * "Inventory" is the lean-manufacturing sense: work merged into the mainline but
 * not yet in a published release — value produced but not yet delivered.
 */

/** Injected git access so the engine stays pure (no `child_process` in core). */
export interface ReleaseInventoryGitPort {
  /**
   * Release tags matching the channel pattern, most-recent first (by creation
   * date). Empty when the repo has no matching tag (a zero-release repo).
   */
  listReleaseTags(pattern: string): ReleaseTag[];
  /**
   * Commits reachable from HEAD but not from `sinceTag`, newest first. When
   * `sinceTag` is null (no release boundary), returns the full mainline history
   * — every commit is unreleased. Never throws; returns [] on error.
   */
  commitsSince(sinceTag: string | null): UnreleasedCommit[];
  /**
   * ISO-8601 date a file first entered history (first add), or null when the
   * date cannot be resolved (e.g. the file is not yet committed). Used to age
   * pending changesets.
   */
  fileAddedDate(relPath: string): string | null;
}

/** Injected filesystem access so the engine stays pure (no `fs` in core). */
export interface ReleaseInventoryFsPort {
  /** Shallow list of entries directly under a relative dir; [] when absent. */
  listDir(relPath: string): string[];
  /** File contents, or null when absent/unreadable (never throws). */
  readFile(relPath: string): string | null;
}

/** A release tag that defines the "shipped" boundary. */
export interface ReleaseTag {
  name: string;
  /** ISO-8601 creation date, or null when unresolved. */
  date: string | null;
}

/**
 * The denominator: exactly what defines "shipped" for this metric. Always
 * carried on the result so the number is interpretable (proposal D1 / AC2).
 */
export interface ReleaseChannel {
  /** How the shipped boundary is derived. v1 supports git tags. */
  kind: 'git-tag';
  /** The tag glob matched against, e.g. `v*`. */
  pattern: string;
}

/** A pending changeset — a declared-but-unshipped unit of change. */
export interface PendingChangeset {
  /** Path relative to repo root, e.g. `.changeset/brave-lions-jump.md`. */
  file: string;
  /** Package → bump level parsed from frontmatter (best-effort; may be empty). */
  bumps: Array<{ package: string; level: string }>;
  /** ISO-8601 date the changeset entered history, or null when uncommitted. */
  addedAt: string | null;
  /** Whole-day age from the reference `now`, or null when `addedAt` is null. */
  ageDays: number | null;
}

/** An unreleased commit (merged into mainline, not in a release). */
export interface UnreleasedCommit {
  sha: string;
  /** ISO-8601 author/commit date, or null when unresolved. */
  date: string | null;
  /** True when this is a merge commit (≥2 parents) — the PR-merge signal. */
  isMerge: boolean;
  /** First line of the commit message. */
  subject: string;
}

/** The computed inventory, before threshold evaluation. */
export interface ReleaseInventory {
  /** The denominator naming what "shipped" means (AC2). */
  channel: ReleaseChannel;
  /** Human-readable denominator, e.g. `git tags matching "v*"`. */
  shippedDefinition: string;
  /** The release boundary tag, or null for a zero-release repo. */
  lastRelease: ReleaseTag | null;
  /**
   * True when there is no release boundary (no matching tag): the entire
   * mainline is inventory and the metric is unbounded (proposal D2 / AC3).
   */
  unbounded: boolean;
  /** Pending changesets under `.changeset/`. */
  pendingChangesets: PendingChangeset[];
  /** Count of pending changesets. */
  pendingChangesetCount: number;
  /** Age in whole days of the oldest pending changeset, or null when none. */
  oldestChangesetAgeDays: number | null;
  /** Commits in `lastRelease..HEAD` (whole history when unbounded). */
  unreleasedCommits: UnreleasedCommit[];
  /** Count of unreleased commits. */
  unreleasedCommitCount: number;
  /** Count of unreleased merge commits — the merged-but-unreleased PR signal. */
  unreleasedMergeCount: number;
  /** Age in whole days of the oldest unreleased commit, or null when none. */
  oldestUnreleasedAgeDays: number | null;
}

/** Threshold configuration — when inventory outgrows release cadence, warn. */
export interface ReleaseInventoryThresholds {
  /** Warn when pending changesets exceed this. */
  maxPendingChangesets: number;
  /** Warn when the oldest unreleased change is older than this many days. */
  maxAgeDays: number;
  /** Warn when unreleased merge commits exceed this. */
  maxUnreleasedMerges: number;
}

/** Default thresholds — calibrated conservatively; adopters override via config. */
export const DEFAULT_RELEASE_INVENTORY_THRESHOLDS: ReleaseInventoryThresholds = {
  maxPendingChangesets: 20,
  maxAgeDays: 30,
  maxUnreleasedMerges: 50,
};

/** Overall inventory disposition. */
export type ReleaseInventoryStatus = 'ok' | 'warn' | 'unbounded';

/** A single breached threshold, for actionable reporting. */
export interface ReleaseInventoryBreach {
  /** Which signal breached, e.g. `pendingChangesets`. */
  metric: 'pendingChangesets' | 'age' | 'unreleasedMerges' | 'unbounded';
  observed: number;
  threshold: number;
  detail: string;
}

/** The evaluated result: inventory + threshold verdict. */
export interface ReleaseInventoryResult {
  status: ReleaseInventoryStatus;
  /** True when any threshold breached (or unbounded with inventory present). */
  breached: boolean;
  inventory: ReleaseInventory;
  thresholds: ReleaseInventoryThresholds;
  breaches: ReleaseInventoryBreach[];
}
