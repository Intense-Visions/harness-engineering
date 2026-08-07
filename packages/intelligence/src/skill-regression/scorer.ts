import type {
  CriterionJudgment,
  GoldenBaseline,
  RegressionVerdictKind,
  RubricCriterion,
} from './types.js';

/**
 * Pure scoring + regression-decision core. No I/O, no LLM — these functions are
 * the deterministic, directly-testable heart of the framework. The LLM only
 * produces per-criterion met/not-met rulings (see `../prompts.js`); every number
 * and every verdict is computed here.
 */

/** A criterion's effective weight: its declared weight, or 1, floored at 0. */
function weightOf(criterion: RubricCriterion): number {
  const w = criterion.weight ?? 1;
  return Number.isFinite(w) && w > 0 ? w : 0;
}

/**
 * Weighted fraction of rubric criteria the judge ruled met, in [0,1].
 *
 * Rulings are matched to rubric criteria by `id`; a criterion with no matching
 * ruling counts as not-met (a judge that skipped it cannot silently inflate the
 * score). An empty rubric, or a rubric whose weights sum to 0, scores 0.
 */
export function weightedScore(rubric: RubricCriterion[], judgments: CriterionJudgment[]): number {
  const metById = new Map<string, boolean>();
  for (const j of judgments) metById.set(j.id, j.met);

  let totalWeight = 0;
  let metWeight = 0;
  for (const criterion of rubric) {
    const w = weightOf(criterion);
    totalWeight += w;
    if (metById.get(criterion.id) === true) metWeight += w;
  }
  return totalWeight === 0 ? 0 : metWeight / totalWeight;
}

/**
 * Aggregate per-candidate rubric scores into a single score@k: the arithmetic
 * mean across the k sampled candidates. An empty list scores 0 (nothing to
 * judge). Mean (not best@k) is deliberate: a skill that regresses on some
 * samples should see its aggregate drop, not be masked by a single good sample.
 */
export function aggregateAtK(scores: number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** The regression threshold: a candidate regressed iff it scored this far below baseline. */
export function regressionFloor(baseline: GoldenBaseline): number {
  return baseline.score - baseline.tolerance;
}

/**
 * Pure verdict rule (before confidence/authority are applied): a candidate has
 * REGRESSED iff its aggregate score fell strictly below `baseline.score -
 * tolerance`; otherwise STABLE. INCONCLUSIVE is never produced here — it comes
 * only from the evaluator's degrade path (no provider / parse failure).
 */
export function deriveRegressionVerdict(
  score: number,
  baseline: GoldenBaseline
): { verdict: Extract<RegressionVerdictKind, 'REGRESSED' | 'STABLE'>; delta: number } {
  const delta = baseline.score - score;
  const verdict = score < regressionFloor(baseline) ? 'REGRESSED' : 'STABLE';
  return { verdict, delta };
}
