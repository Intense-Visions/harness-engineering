/**
 * Lineage-aware recency demotion.
 *
 * Benchmarks rot. A leaderboard score posted twelve months ago against an
 * older inference runtime — or worse, an older generation of the same model
 * family — tells the ranker less about today's `(model, quant)` than a fresh
 * score against the exact target. The merge in `./benchmarks/merge.ts` folds
 * every observation through this module to derive a recency *weight* on
 * `[0, 1]` that the cross-source merge multiplies into the contribution.
 *
 * The decay is intentionally simple: one exponential with a single halflife
 * constant. Phase 2d's parity fixtures pin the halflife against the whichllm
 * reference outputs; a future Phase can swap in per-family curves if any
 * lineage exhibits faster or slower decay than the calibration set.
 *
 * Lineage demotion is independent of the age curve. An observation against
 * `Qwen2.5` when the ranker is scoring `Qwen3` gets an additional
 * per-generation penalty (`× LINEAGE_STEP_PENALTY` per step behind the
 * target) on top of the age-based decay, because architectural changes
 * between generations matter even when the leaderboard score is fresh.
 *
 * Floor: every weight is clamped to `MIN_RECENCY_WEIGHT` (`0.05`). Zeroing
 * observations entirely would let a single fresh contribution dominate the
 * merge; the floor keeps the long tail in the weighted mean.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (lines 80–87, Q5 success criterion)
 */

/**
 * Exponential halflife in months. After `HALFLIFE_MONTHS`, an observation's
 * raw weight halves. Tuned so a year-old observation lands in the `[0.3, 0.7]`
 * band the spec's Q5 acceptance criterion expects.
 */
export const HALFLIFE_MONTHS = 9;

/** Floor for the returned weight. Prevents a single fresh observation from monopolising the merge. */
export const MIN_RECENCY_WEIGHT = 0.05;

/**
 * Multiplier applied per generation behind the target lineage. `0.6` is
 * sharp enough that two generations of lag clearly outweighs a same-month
 * recency advantage, matching how rapidly the open-weights ecosystem moves.
 */
export const LINEAGE_STEP_PENALTY = 0.6;

/** Approximate milliseconds per month. Calendar-coarse — see module docstring. */
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

/** Input to `applyRecencyDecay`. */
export interface RecencyInput {
  /** ISO date the source published the observation. */
  observedAt: string;
  /** ISO date pinning "now" for the merge. Usually the snapshot date or the orchestrator's wall clock. */
  snapshotDate: string;
  /**
   * Generations the observation's model is behind the target lineage.
   * `0` = same generation; `1` = one step behind (e.g. `Qwen2.5` when target
   * is on `Qwen3`); larger = older. `undefined` means "no lineage hint" and
   * skips the lineage penalty.
   */
  lineagePosition?: number;
}

/** Output of `applyRecencyDecay`. */
export interface RecencyDecay {
  /** Computed age in months (snapshot − observed). Negative ages clamp to 0. */
  ageMonths: number;
  /** Composite weight on `[MIN_RECENCY_WEIGHT, 1]`. The merge multiplies this into the contribution. */
  weight: number;
  /** Lineage-penalty multiplier that was applied (`1` when no lineage hint or same generation). */
  lineagePenaltyApplied: number;
}

/**
 * Compute the recency-decay weight for one observation. Pure; never throws on
 * malformed dates — `NaN` ages clamp to `0` so a bad ISO string fails
 * gracefully to "freshest possible" rather than crashing the merge.
 */
export function applyRecencyDecay(input: RecencyInput): RecencyDecay {
  const observed = Date.parse(input.observedAt);
  const snapshot = Date.parse(input.snapshotDate);

  let ageMonths: number;
  if (Number.isNaN(observed) || Number.isNaN(snapshot)) {
    ageMonths = 0;
  } else {
    ageMonths = Math.max(0, (snapshot - observed) / MS_PER_MONTH);
  }

  const baseWeight = Math.exp(-ageMonths / HALFLIFE_MONTHS);

  const lineagePenaltyApplied =
    input.lineagePosition !== undefined && input.lineagePosition > 0
      ? LINEAGE_STEP_PENALTY ** input.lineagePosition
      : 1;

  const weight = Math.max(MIN_RECENCY_WEIGHT, baseWeight * lineagePenaltyApplied);

  return { ageMonths, weight, lineagePenaltyApplied };
}
