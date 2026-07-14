// packages/intelligence/src/triage/rank.ts
//
// Roadmap Auto-Triage — Phase 1, Task 4: triage ranking (SC7 / SC-F3).
//
// Reuses the roadmap-pilot score `(impact × confidence) ÷ effort` and adds IMPACT as the
// DETERMINISTIC secondary sort (D4): among equal-score items the higher-impact work is
// always ordered first. Pure and total — no throws, no NaN, no input mutation. A final
// externalId tiebreak keeps the order fully deterministic even when score AND impact tie.
//
// Layer note: intelligence-only, zero dependencies. The roadmap-item fields (impact /
// confidence / effort) are projected onto RankableCandidate by the wiring layer; this
// module never reads a Roadmap or does IO (that would couple it to core).

/** A candidate to rank: its identity plus the three pilot-score inputs. */
export interface RankableCandidate {
  /** Stable item identity (roadmap External-ID) — the final deterministic tiebreak. */
  externalId: string;
  /** Business impact (higher = more valuable). Also the secondary sort key (D4). */
  impact: number;
  /** Confidence in the estimate (higher = surer). */
  confidence: number;
  /** Estimated effort (higher = costlier). Guarded against divide-by-zero. */
  effort: number;
}

/**
 * The roadmap-pilot score: `(impact × confidence) ÷ effort`. Total — an effort of 0 (or
 * negative) is clamped to a small positive so the score is finite rather than Infinity/NaN,
 * keeping the sort deterministic.
 */
export function pilotScore(c: Pick<RankableCandidate, 'impact' | 'confidence' | 'effort'>): number {
  const effort = c.effort > 0 ? c.effort : 1e-6;
  const score = (c.impact * c.confidence) / effort;
  return Number.isFinite(score) ? score : 0;
}

/**
 * Rank candidates by pilot score descending, breaking ties by IMPACT descending (SC7),
 * then by `externalId` ascending for a fully deterministic total order. Pure: returns a
 * new array; the input is never mutated.
 */
export function rankTriageCandidates<T extends RankableCandidate>(candidates: readonly T[]): T[] {
  return [...candidates].sort((a, b) => {
    const sa = pilotScore(a);
    const sb = pilotScore(b);
    if (sa !== sb) return sb - sa; // higher score first
    if (a.impact !== b.impact) return b.impact - a.impact; // D4: higher impact first
    return a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0;
  });
}
