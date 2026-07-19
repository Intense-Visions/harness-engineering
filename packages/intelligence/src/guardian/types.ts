/**
 * Guardian diff-coverage analysis contract (issue #914, checkboxes 1 & 2).
 *
 * The `.harness/analyses/` archive is written by multiple producers. Alongside
 * the intelligence-pipeline `AnalysisRecord` (spec/score/simulation), canary's
 * PR guardian drops diff-coverage findings — but nothing on the harness side has
 * ever READ them. This module defines the harness-OWNED, TOLERANT, ADVISORY
 * contract for those guardian records so both `outcome_eval` and
 * `pre-merge-brief` can consume them as a review input.
 *
 * Ownership + reconciliation: this shape is defined HERE (harness side) as the
 * documented contract canary conforms to. It is intentionally self-describing
 * (`schema` + `version` discriminator) and read TOLERANTLY — the reader selects
 * guardian records by the discriminator and SKIPS anything it cannot validate,
 * so an intelligence `AnalysisRecord`, a malformed file, or a future/foreign
 * shape never crashes a consumer and never changes behavior. If canary's
 * emitted shape drifts, reconcile the schema here (bump `version`) rather than
 * loosening the tolerant reader.
 */

/**
 * Stable discriminator. A `.harness/analyses/*.json` file carrying
 * `schema: GUARDIAN_ANALYSIS_SCHEMA` is a guardian diff-coverage record; every
 * other JSON in the directory (e.g. an intelligence `AnalysisRecord`) is ignored
 * by the guardian reader.
 */
export const GUARDIAN_ANALYSIS_SCHEMA = 'harness.guardian.diff-coverage' as const;

/** Contract version. Bump on a breaking shape change; the reader validates it. */
export const GUARDIAN_ANALYSIS_VERSION = 1 as const;

/** Overall pass/fail of the guardian diff-coverage gate for a change. */
export type GuardianVerdict = 'pass' | 'fail';

/** Advisory severity of the guardian finding. Never derives ship authority. */
export type GuardianSeverity = 'info' | 'warn' | 'error';

/** Per-file diff-coverage finding: which added/changed lines are uncovered. */
export interface GuardianFileCoverage {
  /** Repo-relative path of the file whose diff lines are uncovered. */
  file: string;
  /** Specific uncovered line numbers introduced/changed by the diff. */
  uncoveredLines: number[];
  /**
   * Optional contiguous uncovered ranges `[startLine, endLine]` (inclusive),
   * a compact alternative to enumerating every line.
   */
  uncoveredRegions?: Array<[number, number]>;
}

/**
 * A single guardian diff-coverage analysis record, as persisted under
 * `.harness/analyses/`. Self-describing so a tolerant reader can validate it in
 * a directory shared with other analysis producers.
 */
export interface GuardianAnalysis {
  schema: typeof GUARDIAN_ANALYSIS_SCHEMA;
  version: typeof GUARDIAN_ANALYSIS_VERSION;
  /** ISO timestamp when the guardian produced this record. */
  generatedAt: string;
  /** Overall gate verdict for the diff-coverage check. */
  verdict: GuardianVerdict;
  /** Advisory severity. */
  severity: GuardianSeverity;
  /**
   * Coverage delta introduced by the diff, in percentage points. Negative is a
   * regression (coverage went down).
   */
  coverageDelta: number;
  /** Per-file uncovered diff-coverage findings (empty when nothing uncovered). */
  files: GuardianFileCoverage[];
  /** Optional human-readable one-line summary from the guardian. */
  summary?: string;
}
