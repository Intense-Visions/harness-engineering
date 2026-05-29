/**
 * Cross-source benchmark merge.
 *
 * The ranker (Phase 2d) calls `mergeBenchmarks` once per candidate model to
 * fold every `BenchmarkObservation` the source adapters surfaced — plus
 * whatever the frozen snapshot contributes — into a single
 * `{ score, confidence, contributions }` triple. The merge is intentionally
 * a *weighted mean*, not a winner-takes-all selection: stacked evidence
 * across sources should reinforce a strong model and stacked weak evidence
 * should pull a self-reported claim down.
 *
 * Each contribution's weight composes three independent multipliers:
 *
 *   weight = evidenceConfidence × recencyWeight × sourceWeight
 *
 * `evidenceConfidence` comes from `../evidence.ts` (`direct = 1.0`, …,
 * `self-reported = 0.35`). `recencyWeight` comes from `../recency.ts`
 * (exponential decay with a lineage penalty). `sourceWeight` defaults to
 * `DEFAULT_SOURCE_WEIGHTS` and can be overridden per call — the proposal
 * scheduler in Phase 6 will surface this through `harness.config.json`.
 *
 * The merge also normalises source-native value scales (`open-llm-leaderboard`
 * is already on `0..100`; `hf-popularity` is too, after the adapter's per-
 * fetch normalisation). Unknown sources default to a `clamp(value, 0, 100)`
 * pass-through so any future adapter that emits on the same scale plugs in
 * without a code change.
 *
 * Confidence labels are derived deterministically from the contribution mix:
 *
 *   - `'high'`   — at least one `direct` observation with `recencyWeight ≥ 0.8`.
 *   - `'low'`    — no observation graded above `interpolated`, *or* every
 *                  combined weight `< 0.3`.
 *   - `'medium'` — otherwise.
 *
 * Empty input short-circuits to `{ score: 0, confidence: 'low', contributions: [] }`
 * — never throws (S4 from the spec).
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Q4, Q5, S4)
 */

import type { BenchmarkObservation } from './types.js';
import { EVIDENCE_CONFIDENCE } from '../evidence.js';
import { applyRecencyDecay } from '../recency.js';

/**
 * Default per-source weight. Popularity reflects community trust but isn't
 * a graded benchmark — weighted to one-quarter of a leaderboard score so it
 * shapes ties without overriding a real result. Unknown sources fall back to
 * `DEFAULT_UNKNOWN_SOURCE_WEIGHT` so the merge stays robust to forward
 * additions.
 */
export const DEFAULT_SOURCE_WEIGHTS: Readonly<Record<string, number>> = {
  'open-llm-leaderboard': 1.0,
  'hf-popularity': 0.25,
};

/** Weight assumed for any source not listed in the active source-weight table. */
export const DEFAULT_UNKNOWN_SOURCE_WEIGHT = 0.5;

/**
 * Recency floor that qualifies a `direct` observation as a high-confidence
 * anchor. `0.8` corresponds to roughly the last two months under the default
 * halflife — recent enough that lineage churn is unlikely.
 */
export const HIGH_CONFIDENCE_RECENCY_FLOOR = 0.8;

/**
 * Combined-weight floor below which every contribution counts as weak.
 * When *every* contribution falls below this floor the merge labels
 * confidence `'low'`.
 */
export const LOW_CONFIDENCE_WEIGHT_FLOOR = 0.3;

/** Per-candidate target the ranker is scoring. */
export interface MergeTarget {
  /** Stable HF repo id (`'Qwen/Qwen3-32B-GGUF'`). */
  model: string;
  /** Quant the ranker is currently scoring, if known. */
  quant?: string;
}

/** Input to `mergeBenchmarks`. */
export interface MergeInput {
  /** All observations across every source, plus the frozen snapshot. May be empty. */
  observations: readonly BenchmarkObservation[];
  /** Candidate model the ranker is scoring this call. */
  target: MergeTarget;
  /** ISO date pinning "now" — drives recency decay. */
  snapshotDate: string;
  /**
   * Optional per-source weight override. When omitted, `DEFAULT_SOURCE_WEIGHTS`
   * applies; sources not in the table use `DEFAULT_UNKNOWN_SOURCE_WEIGHT`.
   */
  sourceWeights?: Readonly<Record<string, number>>;
}

/** Per-observation breakdown surfaced for the dashboard justification UI. */
export interface ScoredObservation {
  /** The original observation, untouched. */
  observation: BenchmarkObservation;
  /** Evidence confidence multiplier the grader chose. */
  evidenceConfidence: number;
  /** Recency weight the decay module produced. */
  recencyWeight: number;
  /** Source weight applied (resolved from the active table). */
  sourceWeight: number;
  /** Composite weight = `evidenceConfidence × recencyWeight × sourceWeight`. */
  combinedWeight: number;
  /** Source-native value mapped to a shared `[0, 1]` scale. */
  normalisedValue: number;
  /** `normalisedValue × combinedWeight` — the term that goes into the mean's numerator. */
  weightedValue: number;
}

/** Output of `mergeBenchmarks`. */
export interface MergedScore {
  /** Merged score on the `[0, 100]` scale the ranker exposes to the dashboard. */
  score: number;
  /** Deterministic confidence label derived from the contribution mix. */
  confidence: 'high' | 'medium' | 'low';
  /** Per-observation breakdown for the dashboard's "why this score?" tooltip. */
  contributions: ScoredObservation[];
}

/**
 * Normalise a source-native value to the shared `[0, 1]` space the merge's
 * mean operates on. Phase 2c sources already emit on `[0, 100]`; the default
 * branch covers any future adapter that hasn't been formally registered.
 */
function normaliseValue(value: number, source: string): number {
  const clamped = Math.max(0, Math.min(100, value));
  switch (source) {
    case 'open-llm-leaderboard':
    case 'hf-popularity':
      return clamped / 100;
    default:
      return clamped / 100;
  }
}

/**
 * Compose evidence, recency, and source weighting into one score per
 * candidate. See module docstring for the weighting and confidence rules.
 */
export function mergeBenchmarks(input: MergeInput): MergedScore {
  if (input.observations.length === 0) {
    return { score: 0, confidence: 'low', contributions: [] };
  }

  const weights = input.sourceWeights ?? DEFAULT_SOURCE_WEIGHTS;
  const contributions: ScoredObservation[] = [];

  for (const observation of input.observations) {
    // BenchmarkObservation carries the per-source evidence label but not a
    // model id, so the merge respects whatever the adapter recorded. The full
    // grader in ../evidence.ts is Phase 2d's tool: algorithm.ts will pair
    // model strings between observation and candidate before grading.
    const evidenceConfidence = EVIDENCE_CONFIDENCE[observation.evidence];
    const recency = applyRecencyDecay({
      observedAt: observation.observedAt,
      snapshotDate: input.snapshotDate,
    });
    const sourceWeight = weights[observation.source] ?? DEFAULT_UNKNOWN_SOURCE_WEIGHT;
    const combinedWeight = evidenceConfidence * recency.weight * sourceWeight;
    const normalisedValue = normaliseValue(observation.value, observation.source);
    const weightedValue = normalisedValue * combinedWeight;

    contributions.push({
      observation,
      evidenceConfidence,
      recencyWeight: recency.weight,
      sourceWeight,
      combinedWeight,
      normalisedValue,
      weightedValue,
    });
  }

  const totalWeight = contributions.reduce((acc, c) => acc + c.combinedWeight, 0);
  const score =
    totalWeight > 0
      ? (contributions.reduce((acc, c) => acc + c.weightedValue, 0) / totalWeight) * 100
      : 0;

  const confidence = deriveConfidence(contributions);

  return { score, confidence, contributions };
}

/** Derive the deterministic confidence label per the rules in the module docstring. */
function deriveConfidence(contributions: ScoredObservation[]): 'high' | 'medium' | 'low' {
  const hasFreshDirect = contributions.some(
    (c) => c.observation.evidence === 'direct' && c.recencyWeight >= HIGH_CONFIDENCE_RECENCY_FLOOR
  );
  if (hasFreshDirect) return 'high';

  const allBelowFloor = contributions.every((c) => c.combinedWeight < LOW_CONFIDENCE_WEIGHT_FLOOR);
  const noStrongGrade = contributions.every(
    (c) => c.observation.evidence === 'interpolated' || c.observation.evidence === 'self-reported'
  );
  if (allBelowFloor || noStrongGrade) return 'low';

  return 'medium';
}
