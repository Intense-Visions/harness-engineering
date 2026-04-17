// --- Meta-judge rubric types ---

// NOTE: This file must not import from `./context` — `context.ts`
// imports Rubric from here, and a cycle would form. `ChangeType` is
// redeclared inline below to keep the boundary clean.

type ChangeType = 'feature' | 'bugfix' | 'refactor' | 'docs';

/**
 * A single rubric criterion used to evaluate a change.
 *
 * Rubrics are generated *before* the reviewer sees the implementation
 * to prevent after-the-fact rationalization ("the diff looks fine, so
 * my criteria must be met"). Each item has a category that feeds the
 * two-stage isolation split.
 */
export interface RubricItem {
  /** Stable slug used to correlate findings back to a criterion. */
  id: string;
  /**
   * Rubric category. Drives two-stage isolation:
   *  - spec: spec-compliance stage
   *  - quality: code-quality stage
   *  - risk: code-quality stage (security/operational risk)
   */
  category: 'spec' | 'quality' | 'risk';
  /** One-line criterion statement. */
  title: string;
  /** True if this criterion is critical — failing it blocks approval. */
  mustHave: boolean;
  /** Why this criterion applies to this particular change. */
  rationale: string;
}

/**
 * A task-specific rubric generated from change metadata before the
 * implementation is read.
 */
export interface Rubric {
  /** Change type this rubric was generated for. */
  changeType: ChangeType;
  /** Criteria in priority order (mustHave first, then suggestions). */
  items: RubricItem[];
  /** ISO-8601 timestamp of generation. */
  generatedAt: string;
  /** How the rubric was produced. */
  source: 'heuristic' | 'llm' | 'spec-file';
}
