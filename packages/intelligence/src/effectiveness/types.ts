/**
 * Agent Effectiveness Introspection types.
 *
 * Given a graph populated with `execution_outcome` nodes (each carrying an
 * `agentPersona` tag and linked to affected systems via `outcome_of` edges),
 * these structures describe per-persona accuracy, blind spots, and
 * persona recommendations for new issues.
 */

/**
 * Smoothed success rate for a single `(persona, systemNodeId)` pair.
 *
 * `successRate` uses Laplace smoothing with α = 1:
 *   (successes + 1) / (successes + failures + 2)
 *
 * This matches the bias of `computeHistoricalComplexity` and prevents a
 * single outcome from claiming 0% or 100% certainty.
 */
export interface PersonaEffectivenessScore {
  persona: string;
  systemNodeId: string;
  successes: number;
  failures: number;
  /** Laplace-smoothed success rate in [0, 1]. */
  successRate: number;
  /** Total observations (successes + failures). */
  sampleSize: number;
}

/**
 * A `(persona, system)` pair where the persona consistently fails.
 *
 * Uses the *raw* failure rate `failures / (failures + successes)` so the
 * thresholds remain intuitive (e.g. "at least 50% failure with 2+ failures").
 */
export interface BlindSpot {
  persona: string;
  systemNodeId: string;
  failures: number;
  successes: number;
  /** Raw failure rate: failures / (failures + successes). */
  failureRate: number;
}

/**
 * Recommendation for which persona to route a new issue to, given the list
 * of affected systems (graph node IDs) the issue will touch.
 *
 * `score` is the mean Laplace-smoothed success rate across the requested
 * systems. Systems for which the persona has no history contribute the
 * neutral prior 0.5, preventing over-confidence on partial data.
 */
export interface PersonaRecommendation {
  persona: string;
  /** Mean smoothed success rate across the requested systems, in [0, 1]. */
  score: number;
  /** Number of requested systems with at least one observation for this persona. */
  coveredSystems: number;
  /** Number of requested systems with zero history for this persona. */
  unknownSystems: number;
  /** Total observations for this persona across the requested systems. */
  totalSamples: number;
}

/**
 * Skill-grain effectiveness score derived from `.harness/metrics/adoption.jsonl`
 * (`SkillInvocationRecord[]`). The skill-catalog counterpart to
 * `PersonaEffectivenessScore`.
 *
 * `successRate` uses the same Laplace smoothing (α = 1) as the persona scorer:
 *   (completed + 1) / (invocations + 2)
 *
 * so a skill invoked once does not claim 0% or 100% certainty. `completed`,
 * `failed`, and `abandonedMidWorkflow` overlap by design — a `failed` run that
 * had already reached a phase counts as both a failure and an abandonment,
 * matching the classification the catalog retrospective uses.
 */
export interface SkillEffectivenessScore {
  skill: string;
  /** Total invocations (all outcomes). */
  invocations: number;
  /** Invocations with outcome `completed`. */
  completed: number;
  /** Invocations with outcome `failed`. */
  failed: number;
  /** Invocations classified as abandoned mid-workflow. */
  abandonedMidWorkflow: number;
  /** Laplace-smoothed success rate in [0, 1]. */
  successRate: number;
}

/**
 * A skill that fails often enough to warrant catalog attention.
 *
 * Mirrors `BlindSpot`: uses the *raw* failure rate `failed / invocations` so
 * thresholds stay intuitive, but also carries the Laplace-smoothed success rate
 * so callers can rank sample-aware (a skill that failed 1/1 should not outrank
 * one that failed 30/50).
 */
export interface FailingSkill {
  skill: string;
  invocations: number;
  completed: number;
  failed: number;
  /** Raw failure rate: failed / invocations. */
  failureRate: number;
  /** Laplace-smoothed success rate in [0, 1]. */
  smoothedSuccessRate: number;
  /**
   * Count of this skill's non-completed runs by `FailureCategory`, keyed by the
   * category string. Only categories that actually occurred appear (no zero
   * entries). Empty when no non-completed run carried a category — e.g. records
   * predate the field. Lets callers see *why* a skill fails, not just that it does.
   */
  failureCategories: Record<string, number>;
}

/**
 * A skill that users start and bail out of mid-workflow often enough to warrant
 * attention. `abandonedMidWorkflow` counts explicit `abandoned` outcomes plus
 * non-completed runs that had already reached ≥1 phase.
 *
 * Mirrors `BlindSpot`: raw `abandonmentRate` for intuitive thresholds, plus the
 * smoothed success rate for sample-aware ranking.
 */
export interface AbandonedSkill {
  skill: string;
  invocations: number;
  completed: number;
  abandonedMidWorkflow: number;
  /** Raw abandonment rate: abandonedMidWorkflow / invocations. */
  abandonmentRate: number;
  /** Laplace-smoothed success rate in [0, 1]. */
  smoothedSuccessRate: number;
}
