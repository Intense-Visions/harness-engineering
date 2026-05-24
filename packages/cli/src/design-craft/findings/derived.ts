// packages/cli/src/design-craft/findings/derived.ts
//
// Derives the numeric `priority` surface from the 3-axis (tier × impact ×
// confidence) finding model. Per ADR 0019, the raw axes remain the
// authoritative output; this derivation is for stable sort/display ONLY.
//
// Authoritative source: docs/changes/design-pipeline/design-craft-elevator/proposal.md
//   "Success Criteria" #26: "Priority derivation correctness. Maps tier ×
//    impact × confidence to a priority score that sorts foundational/large/
//    high above aspirational/small/low."
//
// MVP rule (chosen for legibility + strict ordering guarantees):
//
//   priority = TIER_BAND[tier] + IMPACT_WEIGHT[impact] * CONFIDENCE_WEIGHT[confidence]
//
// with TIER_BAND set on order-of-magnitude steps so the band always
// dominates within-band score (cf. CVSS / Sonar severity bands). Properties:
//
//   1. foundational > polish > aspirational ALWAYS dominates other axes:
//      the worst foundational finding (1000 + 3) outranks the best polish
//      finding (100 + 45). This matches the spec ordering: foundational
//      findings (broken hierarchy, missing contrast) outrank aspirational
//      polish (signature micro-interaction tweak) for any impact/confidence
//      pair.
//   2. Within a tier, large > medium > small impact dominates confidence
//      ties (impact weight is the outer multiplicand).
//   3. Confidence acts as a tiebreaker / honesty signal: the same
//      tier+impact pair with high confidence outranks the same pair with
//      low confidence.
//
// Worked example — foundational/large/high vs aspirational/small/low:
//   1000 + 9 * 5 = 1045  vs  10 + 3 * 1 = 13.
// Wide margin satisfies Success Criterion 26.
//
// Worked example — within tier `polish`, (medium, high) vs (small, high):
//   100 + 6 * 5 = 130  vs  100 + 3 * 5 = 115.
// Impact dominates confidence inside a tier.

import type { Tier, Impact, Confidence } from './schema.js';

/**
 * Tier bands. Order-of-magnitude separation guarantees tier dominance
 * across all impact/confidence combinations: the floor of each band
 * (tier-band-only) outranks the ceiling of the band below it
 * (tier-band + max impact * max confidence = +45). This is the standard
 * "band + within-band score" pattern (cf. CVSS severity bands).
 */
const TIER_BAND: Record<Tier, number> = {
  foundational: 1000,
  polish: 100,
  aspirational: 10,
};

/** Impact weights (within-band). */
const IMPACT_WEIGHT: Record<Impact, number> = {
  large: 9,
  medium: 6,
  small: 3,
};

/** Confidence weights (within-band). */
const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  high: 5,
  medium: 3,
  low: 1,
};

/**
 * Compute the sortable priority surface for a finding.
 *
 * Formula: `band(tier) + impact * confidence`, where band(tier) is an
 * order-of-magnitude bump so a foundational/small/low (1000 + 3) outranks
 * any polish/large/high (100 + 45), and a polish/small/low (100 + 3)
 * outranks any aspirational/large/high (10 + 45).
 *
 * This guarantees tier dominance across all impact/confidence combinations
 * (Success Criterion 26), while keeping impact × confidence as the
 * tiebreaker within a tier.
 *
 * Returns a positive number. Higher = more urgent. Stable across runs
 * given the same inputs (no clock / random / locale dependence).
 */
export function derivePriority(tier: Tier, impact: Impact, confidence: Confidence): number {
  return TIER_BAND[tier] + IMPACT_WEIGHT[impact] * CONFIDENCE_WEIGHT[confidence];
}
