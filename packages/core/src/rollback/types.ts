/**
 * Structured verdict from the rollback revert-readiness classifier.
 * Field set is the spec's Technical Design contract (packages/core/src/rollback/).
 * `blastRadius` and `migrationWarnings` are context only — they never gate `revertReady`.
 */
export interface RollbackDecision {
  targetPr: number;
  trigger: 'signal' | 'eval';
  revertReady: boolean;
  /** Human-readable reasons the target is (not) revert-ready. */
  reasons: string[];
  /** `git revert -n -m 1 <mergeSha>` applies in a scratch index without conflict. */
  cleanRevert: boolean;
  /** Later-merged PRs whose changed-file set intersects the target's. */
  dependentMerges: number[];
  /** Context only, never a gate. Passed through from `compute_blast_radius` (CLI phase). */
  blastRadius?: number;
  /** Context only, never a gate. Emitted by the migration path heuristic. */
  migrationWarnings: string[];
  action: 'proposed' | 'skipped' | 'blocked';
  prUrl?: string;
}

/**
 * A later-merged PR the classifier compares against the target for dependency.
 */
export interface LaterMerge {
  pr: number;
  changedFiles: string[];
}

/**
 * Pure inputs to `classifyRevert`. All git/gh access is via the injected
 * `RollbackIO` seam (see io.ts), never called directly here.
 */
export interface ClassifyInput {
  targetPr: number;
  trigger: 'signal' | 'eval';
  /** Merge commit sha of the target PR, fed to the scratch-index revert. */
  mergeSha: string;
  /** Files the target PR changed (used for dependency intersection + migration heuristic). */
  changedFiles: string[];
  /** PRs merged after the target, in the relevant window. */
  laterMerges: LaterMerge[];
  /** Optional pre-computed blast-radius score (context only). */
  blastRadius?: number;
}
