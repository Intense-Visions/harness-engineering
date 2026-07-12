import type { ComplexityLevel } from '@harness-engineering/types';
import type { ComplexitySignals, Phase, StaticVerdict } from './types.js';
import { serializeSignals } from './signals.js';

/**
 * Documented seed weights for the free static pass (D4a). Each raw signal is
 * normalized against a reference maximum, multiplied by its weight, and the
 * weighted contributions are summed and re-normalized to a [0,1] score.
 *
 * Diff-based signals dominate post-diff; text-only signals carry the pre-diff
 * pass. Weights are tunable (DEFERRABLE per plan) — this is a documented seed.
 */
export const STATIC_WEIGHTS = {
  filesTouched: 0.25,
  layersTouched: 0.2,
  blastRadius: 0.3,
  hotspotChurn: 0.1,
  /** Text-only signals — the only inputs available pre-diff. */
  descriptionLength: 0.1,
  /** A present spec / measurable acceptance *lowers* complexity (well-scoped). */
  specExists: 0.025,
  acceptanceMeasurable: 0.025,
} as const;

/** Reference maxima used to normalize each raw signal into [0,1]. */
const REF_MAX = {
  filesTouched: 20,
  layersTouched: 4,
  blastRadius: 40,
  hotspotChurn: 1,
  descriptionLength: 500,
} as const;

const CONFIDENCE_RANK: Record<StaticVerdict['confidence'], number> = {
  low: 0,
  medium: 1,
  high: 2,
};
const RANK_CONFIDENCE: StaticVerdict['confidence'][] = ['low', 'medium', 'high'];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Map a [0,1] score to a complexity band. */
function scoreToLevel(score: number): ComplexityLevel {
  if (score < 0.2) return 'trivial';
  if (score < 0.45) return 'simple';
  if (score < 0.7) return 'moderate';
  return 'complex';
}

/**
 * Confidence from how decisively the score sits inside its band. Scores near a
 * band boundary (ambiguous) are low-confidence and drive the LLM tie-break;
 * scores well inside a band — or at the extreme trivial/complex ends — are
 * high-confidence.
 */
function scoreToConfidence(score: number): StaticVerdict['confidence'] {
  const boundaries = [0.2, 0.45, 0.7];
  const nearest = Math.min(...boundaries.map((b) => Math.abs(score - b)));
  const atExtremeEnd = score < 0.2 || score >= 0.7;
  // Ambiguous: sitting close to a band boundary → drive the LLM tie-break.
  if (nearest < 0.1) return 'low';
  // Mid bands (simple/moderate) that are only moderately inside a band.
  if (nearest < 0.18 && !atExtremeEnd) return 'medium';
  // Decisive: clearly inside a band, or at an extreme end.
  return 'high';
}

/**
 * D4a: free static pass. Phase-aware (S3-001): pre-diff uses text-only signals
 * and caps confidence at `medium`; post-diff uses the full signal set. Pure —
 * never calls an LLM. `source` is stamped by the classifier, not here.
 */
export function runStaticPass(signals: ComplexitySignals, phase: Phase): StaticVerdict {
  const isPostDiff = phase === 'post-diff';

  // Normalized weighted contributions. Pre-diff omits diff-based signals.
  const contributions: number[] = [];
  const weightsUsed: number[] = [];

  if (isPostDiff) {
    if (signals.filesTouched !== undefined) {
      contributions.push(
        clamp01(signals.filesTouched / REF_MAX.filesTouched) * STATIC_WEIGHTS.filesTouched
      );
      weightsUsed.push(STATIC_WEIGHTS.filesTouched);
    }
    if (signals.layersTouched !== undefined) {
      contributions.push(
        clamp01(signals.layersTouched / REF_MAX.layersTouched) * STATIC_WEIGHTS.layersTouched
      );
      weightsUsed.push(STATIC_WEIGHTS.layersTouched);
    }
    if (signals.blastRadius !== undefined) {
      contributions.push(
        clamp01(signals.blastRadius / REF_MAX.blastRadius) * STATIC_WEIGHTS.blastRadius
      );
      weightsUsed.push(STATIC_WEIGHTS.blastRadius);
    }
    if (signals.hotspotChurn !== undefined) {
      contributions.push(
        clamp01(signals.hotspotChurn / REF_MAX.hotspotChurn) * STATIC_WEIGHTS.hotspotChurn
      );
      weightsUsed.push(STATIC_WEIGHTS.hotspotChurn);
    }
  }

  // Text-only signals (always available).
  contributions.push(
    clamp01(signals.descriptionLength / REF_MAX.descriptionLength) *
      STATIC_WEIGHTS.descriptionLength
  );
  weightsUsed.push(STATIC_WEIGHTS.descriptionLength);
  // A present spec / measurable acceptance reduces effective complexity.
  const scopeReduction =
    (signals.specExists ? STATIC_WEIGHTS.specExists : 0) +
    (signals.acceptanceMeasurable ? STATIC_WEIGHTS.acceptanceMeasurable : 0);

  const totalWeight = weightsUsed.reduce((a, b) => a + b, 0);
  const rawScore = contributions.reduce((a, b) => a + b, 0);
  // Normalize against the weights actually used, then subtract scope reduction.
  const normalized = totalWeight > 0 ? rawScore / totalWeight : 0;
  const score = clamp01(normalized - scopeReduction);

  const level = scoreToLevel(score);
  let confidence = scoreToConfidence(score);

  // Pre-diff: no diff evidence — cap confidence at medium (S3-001).
  if (!isPostDiff && CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK.medium) {
    confidence = 'medium';
  }

  return {
    level,
    confidence,
    signals: serializeSignals(signals),
  };
}

/** Exposed for callers that need the confidence ordering. */
export { CONFIDENCE_RANK, RANK_CONFIDENCE };
