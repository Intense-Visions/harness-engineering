import type { EnrichedSpec } from '../types.js';

/** Weight for unknowns dimension. */
const W_UNKNOWNS = 0.4;
/** Weight for ambiguities dimension. */
const W_AMBIGUITIES = 0.35;
/** Weight for risk signals dimension. */
const W_RISK_SIGNALS = 0.25;
/** Decay constant for diminishing returns curve. */
const DECAY = 0.3;

/**
 * Compute semantic complexity from the SEL enrichment fields.
 *
 * Each dimension uses a diminishing-returns curve `1 - exp(-count * 0.3)`
 * so that the first few items have the biggest impact and marginal
 * additions produce less incremental score.
 *
 * Returns a value in [0, 1].
 */
export function computeSemanticComplexity(spec: EnrichedSpec): number {
  const unknownsScore = 1 - Math.exp(-spec.unknowns.length * DECAY);
  const ambiguitiesScore = 1 - Math.exp(-spec.ambiguities.length * DECAY);
  const riskSignalsScore = 1 - Math.exp(-spec.riskSignals.length * DECAY);

  const raw =
    unknownsScore * W_UNKNOWNS +
    ambiguitiesScore * W_AMBIGUITIES +
    riskSignalsScore * W_RISK_SIGNALS;

  return Math.max(0, Math.min(1, raw));
}
