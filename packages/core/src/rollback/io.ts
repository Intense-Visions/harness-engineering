/**
 * Injected IO seam for the rollback classifier. Keeps `classify.ts` pure and
 * unit-testable: git/gh are reached only through these methods, never via
 * `node:child_process`. The real Node/`gh` adapter binding lands in the CLI phase.
 */
/** A merged PR's resolved revert inputs (merge commit + changed files). */
export interface ResolvedTarget {
  /** Merge commit sha of the target PR, fed to the scratch-index revert. */
  mergeSha: string;
  /** Files the target PR changed. Empty => classify returns `skipped` (finding #2). */
  changedFiles: string[];
  /** Original PR title, used to compose the revert PR title. */
  title: string;
}

export interface RollbackIO {
  /**
   * Attempt `git revert -n -m 1 <mergeSha>` in a scratch index (no working-tree
   * mutation), report whether it applied cleanly, then abort. `true` = clean apply.
   */
  revertDryRun(mergeSha: string): Promise<{ clean: boolean; conflictPaths: string[] }>;
  /** Resolve a merged PR to its merge commit, changed files, and title. */
  resolveTarget(pr: number): Promise<ResolvedTarget>;
  /** PRs merged after the target, with their changed-file sets (dependency check). */
  listLaterMerges(pr: number): Promise<import('./types').LaterMerge[]>;
}
