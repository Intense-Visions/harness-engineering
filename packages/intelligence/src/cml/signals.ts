import type { ConcernSignal } from '@harness-engineering/types';
import type { ComplexityScore } from '../types.js';

/**
 * Convert a {@link ComplexityScore} into an array of {@link ConcernSignal}s
 * that downstream routing logic can use for escalation decisions.
 *
 * Returns an empty array when the score is below all thresholds.
 */
export function scoreToConcernSignals(score: ComplexityScore): ConcernSignal[] {
  const signals: ConcernSignal[] = [];

  if (score.overall >= 0.7) {
    signals.push({
      name: 'highComplexity',
      reason: score.reasoning.join('; '),
    });
  }

  if (score.blastRadius.filesEstimated > 20) {
    signals.push({
      name: 'largeBlastRadius',
      reason: `${score.blastRadius.filesEstimated} files estimated to be affected`,
    });
  }

  if (score.dimensions.semantic > 0.6) {
    signals.push({
      name: 'highAmbiguity',
      reason: 'Significant unknowns or ambiguities in spec',
    });
  }

  return signals;
}
