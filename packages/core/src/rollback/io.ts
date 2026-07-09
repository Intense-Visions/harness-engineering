/**
 * Injected IO seam for the rollback classifier. Keeps `classify.ts` pure and
 * unit-testable: git/gh are reached only through these methods, never via
 * `node:child_process`. The real Node/`gh` adapter binding lands in the CLI phase.
 */
export interface RollbackIO {
  /**
   * Attempt `git revert -n -m 1 <mergeSha>` in a scratch index (no working-tree
   * mutation), report whether it applied cleanly, then abort. `true` = clean apply.
   */
  revertDryRun(mergeSha: string): Promise<{ clean: boolean; conflictPaths: string[] }>;
}
