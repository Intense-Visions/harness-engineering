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
