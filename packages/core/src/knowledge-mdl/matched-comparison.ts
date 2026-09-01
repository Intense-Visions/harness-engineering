/**
 * MDL knowledge pruning (#1630) — self-contained matched comparison.
 *
 * Estimates a knowledge entry's compression value: how much it reduced run
 * outcome cost (re-derivation / wrong turns / rework) in runs where it was
 * PRESENT versus matched runs where it was ABSENT. Comparison is stratified —
 * present-vs-absent is only compared WITHIN the same covariate stratum, so a
 * confound (harder tasks tend to include more knowledge) does not masquerade as
 * negative value.
 *
 * DELIBERATELY SELF-CONTAINED for this slice: it does NOT import #1633's
 * rate-distortion ablation harness (built concurrently, not merged) nor #1621's
 * skill-P&L machinery. Consolidating onto those is a deferred follow-up (#1630).
 *
 * "Insufficient evidence" is a first-class result — the estimator NEVER
 * fabricates a value from missing data. Pruning requires measured worthlessness,
 * never measurement absence.
 */

import { inclusionRunIds } from './cost';
import type { InclusionEvent, MdlConfig, RunOutcome } from './types';

/** The compression-value estimate for one entry. */
export interface CompressionValue {
  /** The entry this value is for. */
  entryId: string;
  /** Present runs (entry included) used in matched strata. */
  presentRuns: number;
  /** Absent runs (entry not included) used in matched strata. */
  absentRuns: number;
  /** Number of strata with both present and absent runs above the per-cell floor. */
  matchedStrata: number;
  /**
   * Estimated cost reduction per present run, in tokens (absent − present cost).
   * Positive means the entry compressed experience. `null` when insufficient.
   */
  value: number | null;
  /** Standard error of {@link value}; `null` when insufficient. */
  stderr: number | null;
  /** True when the estimate rests on enough matched evidence to be trusted. */
  sufficient: boolean;
  /** Human-readable account of how the estimate was produced (or why it wasn't). */
  reason: string;
}

interface StratumStats {
  weight: number;
  delta: number;
  varDelta: number;
  presentN: number;
  absentN: number;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Sample variance (n-1). Returns 0 for fewer than 2 samples (conservative). */
function sampleVariance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sum = 0;
  for (const v of values) sum += (v - m) * (v - m);
  return sum / (values.length - 1);
}

/**
 * Estimate an entry's compression value via a stratified, matched
 * present-vs-absent comparison of run outcome cost.
 *
 * Pure over its inputs. Runs referenced by inclusions but absent from
 * `outcomes` are ignored (no outcome, no evidence).
 */
export function estimateCompressionValue(
  entryId: string,
  inclusions: readonly InclusionEvent[],
  outcomes: readonly RunOutcome[],
  config: MdlConfig
): CompressionValue {
  const presentRunIds = inclusionRunIds(entryId, inclusions);

  // Bucket outcome costs by stratum, split into present vs absent.
  const strata = new Map<string, { present: number[]; absent: number[] }>();
  for (const outcome of outcomes) {
    let bucket = strata.get(outcome.stratum);
    if (!bucket) {
      bucket = { present: [], absent: [] };
      strata.set(outcome.stratum, bucket);
    }
    if (presentRunIds.has(outcome.runId)) bucket.present.push(outcome.cost);
    else bucket.absent.push(outcome.cost);
  }

  const stats: StratumStats[] = [];
  let usedPresent = 0;
  let usedAbsent = 0;
  for (const bucket of strata.values()) {
    if (bucket.present.length < config.minPerCell || bucket.absent.length < config.minPerCell) {
      continue;
    }
    // Positive delta = present runs cost less = the entry reduced cost.
    const delta = mean(bucket.absent) - mean(bucket.present);
    const varDelta =
      sampleVariance(bucket.present) / bucket.present.length +
      sampleVariance(bucket.absent) / bucket.absent.length;
    stats.push({
      weight: bucket.present.length,
      delta,
      varDelta,
      presentN: bucket.present.length,
      absentN: bucket.absent.length,
    });
    usedPresent += bucket.present.length;
    usedAbsent += bucket.absent.length;
  }

  const matchedStrata = stats.length;
  const sufficient =
    matchedStrata >= config.minMatchedStrata &&
    usedPresent >= config.minPresentRuns &&
    usedAbsent >= config.minAbsentRuns;

  if (!sufficient) {
    return {
      entryId,
      presentRuns: usedPresent,
      absentRuns: usedAbsent,
      matchedStrata,
      value: null,
      stderr: null,
      sufficient: false,
      reason:
        `insufficient matched evidence: ${matchedStrata} matched strata, ` +
        `${usedPresent} present / ${usedAbsent} absent runs ` +
        `(need >= ${config.minMatchedStrata} strata, >= ${config.minPresentRuns} present, ` +
        `>= ${config.minAbsentRuns} absent)`,
    };
  }

  // Weighted (by present count) combination of per-stratum cost reductions.
  const totalWeight = stats.reduce((acc, s) => acc + s.weight, 0);
  const value = stats.reduce((acc, s) => acc + s.weight * s.delta, 0) / totalWeight;
  const varValue =
    stats.reduce((acc, s) => acc + s.weight * s.weight * s.varDelta, 0) /
    (totalWeight * totalWeight);
  const stderr = Math.sqrt(varValue);

  return {
    entryId,
    presentRuns: usedPresent,
    absentRuns: usedAbsent,
    matchedStrata,
    value,
    stderr,
    sufficient: true,
    reason:
      `matched comparison over ${matchedStrata} strata ` +
      `(${usedPresent} present / ${usedAbsent} absent runs); ` +
      `mean cost reduction ${value.toFixed(1)} +/- ${stderr.toFixed(1)} tokens/run`,
  };
}
