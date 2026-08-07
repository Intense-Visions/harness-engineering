// packages/cli/src/design-craft/phases/award-bar.ts
//
// Award-bar verdict computation for the BENCHMARK phase.
//
// The BENCHMARK phase produces a 5-dimension radar (0–100 per dimension,
// each with its own confidence). This module derives an award-tier VERDICT
// from that radar — a machine signal (`cleared | not-cleared | indeterminate`)
// that replaces free-hand "is this good enough?" judgment.
//
// Authority is in TypeScript, never the LLM (mirrors outcome-eval /
// acceptance-eval): the LLM emits only the radar it always has; the verdict
// is computed here.
//
// Model (spec Decisions D1–D3, docs/changes/design-craft-award-bar/proposal.md):
//   - PER-DIMENSION bar, not a single overall threshold — an equal-weight
//     mean hides a weak axis (ADR 0082 diagnosed pages scoring 88–94 overall
//     while carrying template tells). Every dimension must clear its own floor.
//   - HYBRID exemplar-relative floor: per dimension, the floor is
//     `max(dimensionFloor, round(fraction × median(cited-exemplar references)))`.
//     The corpus defines the bar (no magic "award tier" number); the config
//     floor keeps it from eroding; the MEDIAN makes it robust to one weak
//     exemplar.
//   - Low confidence on ANY dimension forces `indeterminate` — a high score
//     the model is unsure about must never certify award tier.

import type {
  AwardBar,
  AwardBarDimension,
  AwardVerdict,
  BenchmarkScore,
  Confidence,
  RadarDimensionName,
} from '../findings/schema.js';
import type { ExemplarDefinition } from '../catalog/exemplars/linear-empty-list.js';
import { CONFIDENCE_RANK } from '../../shared/craft/findings/axes.js';
import type { ResponsiveGateResult } from '../../responsive/index.js';

/** Tunable thresholds for the award-bar verdict. */
export interface AwardBarConfig {
  /** Hard per-dimension safety floor (0–100). The bar can never sink below this. */
  dimensionFloor: number;
  /** Fraction of the median exemplar reference a dimension must reach (0–1). */
  fraction: number;
  /** Below this confidence on any dimension, the verdict is `indeterminate`. */
  confidenceFloor: Confidence;
}

export const DEFAULT_AWARD_BAR_CONFIG: AwardBarConfig = {
  dimensionFloor: 80,
  fraction: 0.95,
  confidenceFloor: 'medium',
};

/** Merge a partial config over the defaults. */
export function resolveAwardBarConfig(partial?: Partial<AwardBarConfig>): AwardBarConfig {
  return { ...DEFAULT_AWARD_BAR_CONFIG, ...(partial ?? {}) };
}

const DIMENSION_NAMES: readonly RadarDimensionName[] = [
  'philosophicalCoherence',
  'hierarchy',
  'craftExecution',
  'function',
  'innovation',
];

/** Median of a numeric list (mean of the two middle values for even lengths). */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Derive the award-tier verdict for one BENCHMARK target.
 *
 * @param radar     The target's 5-dimension radar.
 * @param exemplars The exemplars cited for this target (their `radarReference`
 *                  scores define the exemplar-relative floors). Guaranteed
 *                  non-empty by the caller (`runBenchmark` only scores targets
 *                  with ≥1 matching exemplar); the empty case falls back to the
 *                  config floor defensively.
 * @param config    Partial config merged over {@link DEFAULT_AWARD_BAR_CONFIG}.
 */
export function computeAwardBar(
  radar: BenchmarkScore['radar'],
  exemplars: readonly ExemplarDefinition[],
  config?: Partial<AwardBarConfig>
): AwardBar {
  const cfg = resolveAwardBarConfig(config);
  const dimensions = {} as Record<RadarDimensionName, AwardBarDimension>;
  const shortfalls: RadarDimensionName[] = [];
  let lowestConfidenceRank = Number.POSITIVE_INFINITY;

  for (const dim of DIMENSION_NAMES) {
    const refs = exemplars.map((e) => e.radarReference[dim]);
    const derived = refs.length > 0 ? Math.round(cfg.fraction * median(refs)) : cfg.dimensionFloor;
    const floor = Math.max(cfg.dimensionFloor, derived);
    const score = radar[dim].score;
    const cleared = score >= floor;
    dimensions[dim] = { score, floor, cleared };
    if (!cleared) shortfalls.push(dim);
    lowestConfidenceRank = Math.min(lowestConfidenceRank, CONFIDENCE_RANK[radar[dim].confidence]);
  }

  // `responsive` defaults to not-evaluated here — the aesthetic computation
  // knows nothing about mobile. `applyResponsiveGate` composes a real gate
  // result (and may veto the verdict) once layout metrics are available.
  const responsive: ResponsiveGateResult = { status: 'not-evaluated', defects: [] };

  if (lowestConfidenceRank < CONFIDENCE_RANK[cfg.confidenceFloor]) {
    return {
      verdict: 'indeterminate',
      dimensions,
      shortfalls,
      reason: 'low-confidence',
      responsive,
    };
  }

  const verdict: AwardVerdict = shortfalls.length === 0 ? 'cleared' : 'not-cleared';
  return { verdict, dimensions, shortfalls, responsive };
}

/**
 * Compose the mechanical responsive gate onto an aesthetic award-bar verdict.
 *
 * The aesthetic verdict from {@link computeAwardBar} certifies desktop craft
 * only; this folds in the responsive gate so `cleared` cannot certify a
 * phone-broken page:
 *   - `defective` → `not-cleared` (reason `responsive-defects`), overriding an
 *     aesthetic `cleared` OR `indeterminate` — a proven defect outranks both a
 *     pass and aesthetic uncertainty.
 *   - `not-evaluated` + `require` → downgrade a would-be `cleared` to
 *     `indeterminate` (reason `responsive-not-evaluated`); a verdict that was
 *     already not-cleared/indeterminate is left as-is (mobile eval wouldn't
 *     upgrade it).
 *   - otherwise the aesthetic verdict stands; the gate result is attached for
 *     legibility.
 */
export function applyResponsiveGate(
  aesthetic: AwardBar,
  responsive: ResponsiveGateResult,
  opts: { require: boolean }
): AwardBar {
  if (responsive.status === 'defective') {
    return { ...aesthetic, verdict: 'not-cleared', reason: 'responsive-defects', responsive };
  }
  if (responsive.status === 'not-evaluated' && opts.require && aesthetic.verdict === 'cleared') {
    return {
      ...aesthetic,
      verdict: 'indeterminate',
      reason: 'responsive-not-evaluated',
      responsive,
    };
  }
  return { ...aesthetic, responsive };
}
