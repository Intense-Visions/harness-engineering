/**
 * Ranking-stability gate.
 *
 * Every ordered output the harness emits (hotspots, risk areas, craft targets,
 * critical paths, skill recommendations) is a ranking computed from noisy
 * signal. A 90-day telemetry study across a 1,957-repository organisation
 * showed that individual rank position is frequently NOT reproducible across
 * two adjacent windows (Spearman rho ~0.62 overall, near zero in the middle
 * band, mean movement 12–15 places) even when broad tier membership is. The
 * same study surfaced a second trap: bands defined on the *mean* of two
 * measurements force those measurements to anti-correlate within a band,
 * yielding impossible negative correlations.
 *
 * This module turns both traps into a mechanical guard:
 *
 *  1. A ranking is computed over two windows; the rank correlation between them
 *     is measured (tie-corrected Spearman) and reported alongside the output.
 *  2. When correlation is below threshold the ranking DEGRADES TO TIERS rather
 *     than being presented as a precise order.
 *  3. Tier bands are always defined on ONE window and validated against the
 *     other — never on the average. The banding API takes a single window's
 *     ordered items, so the mean-of-two-windows bug is impossible by
 *     construction.
 */

/** A single ranked item with a stable identity and a numeric score in one window. */
export interface ScoredItem {
  /** Identity that is stable across windows (e.g. a file path, a skill id). */
  id: string;
  /** The score used to rank within a window. Higher ranks first. */
  score: number;
}

/**
 * One measurement window: its definition (a human-readable label) plus the
 * scored items observed in it. The label is carried through to the report so
 * every emitted ranking shows both window definitions.
 */
export interface RankingWindow<T extends ScoredItem = ScoredItem> {
  /** Definition of the window, e.g. `"days 0–45"` or `"2026-06-01..2026-07-15"`. */
  label: string;
  items: readonly T[];
}

export interface StabilityOptions {
  /**
   * Minimum tie-corrected Spearman rank correlation for the ranking to be
   * presented as an exact order. Below this the ranking degrades to tiers.
   * Default {@link DEFAULT_CORRELATION_THRESHOLD}.
   */
  correlationThreshold?: number | undefined;
  /**
   * Number of tiers to bucket into when the ranking is unstable. Default
   * {@link DEFAULT_TIER_COUNT}.
   */
  tierCount?: number | undefined;
}

/** Default correlation below which a ranking is deemed unstable and tiered. */
export const DEFAULT_CORRELATION_THRESHOLD = 0.7;
/** Default number of tiers used when a ranking degrades. */
export const DEFAULT_TIER_COUNT = 4;

/** Presentation mode chosen by the gate for a ranking. */
export type StabilityPresentation = 'ordered' | 'tiered';

export interface StabilityReport {
  /** Tie-corrected Spearman rank correlation of the two windows' shared items. */
  correlation: number;
  /** True when `correlation >= correlationThreshold`: the exact order is reproducible. */
  stable: boolean;
  /** `"ordered"` when stable, `"tiered"` when degraded. */
  presentation: StabilityPresentation;
  /** The threshold the correlation was compared against. */
  correlationThreshold: number;
  /** Number of items shared by both windows — the basis of the correlation. */
  sampleSize: number;
  /** Window definitions, always attached so a consumer can show both. */
  windows: { primary: string; secondary: string };
}

export interface RankTier<T> {
  /** 1-based tier number; tier 1 holds the highest-scoring band. */
  tier: number;
  items: T[];
}

/** How well tier membership (defined on the primary window) holds up on the secondary. */
export interface BandValidation {
  /**
   * Fraction (0–1) of shared items that land in the same tier when re-banded on
   * the secondary window. High agreement means the tiers are trustworthy even
   * though the exact order is not.
   */
  agreement: number;
  /** Number of shared items the agreement was measured over. */
  sampleSize: number;
}

export interface StableRanking<T extends ScoredItem = ScoredItem> {
  report: StabilityReport;
  /** The primary-window order — populated when stable, `null` when tiered. */
  ordered: T[] | null;
  /** Bands defined on the primary window — populated when tiered, `null` when ordered. */
  tiers: RankTier<T>[] | null;
  /** Cross-window tier agreement — populated when tiered, `null` when ordered. */
  bandValidation: BandValidation | null;
}

/**
 * Assign fractional (average) ranks to the given ids by descending score.
 * Ties receive the average of the positions they span, which is what makes the
 * downstream Spearman computation tie-correct. Rank 1 is the highest score.
 */
function fractionalRanks(
  scores: ReadonlyMap<string, number>,
  ids: readonly string[]
): Map<string, number> {
  const sorted = [...ids].sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));
  const ranks = new Map<string, number>();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (
      j + 1 < sorted.length &&
      (scores.get(sorted[j + 1]!) ?? 0) === (scores.get(sorted[i]!) ?? 0)
    ) {
      j++;
    }
    // Average of the 1-based positions i+1..j+1 the tie group spans.
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks.set(sorted[k]!, avgRank);
    i = j + 1;
  }
  return ranks;
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Pearson correlation of two equal-length series; used over ranks for Spearman. */
function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) {
    // No variance in at least one series: the correlation is undefined. An
    // all-tied window has no order to reproduce, so we report 0 (uncorrelated)
    // rather than certifying an arbitrary insertion order as reproducible.
    return 0;
  }
  return num / Math.sqrt(dx * dy);
}

/**
 * Tie-corrected Spearman rank correlation between two windows, computed over the
 * items they share. Items present in only one window are excluded (their rank is
 * undefined in the other). With fewer than two shared items the correlation is
 * undefined; we report 0 (unstable) so a thin overlap never certifies an order.
 */
export function spearmanRankCorrelation(
  primary: ReadonlyMap<string, number>,
  secondary: ReadonlyMap<string, number>
): { correlation: number; sampleSize: number } {
  const shared: string[] = [];
  for (const id of primary.keys()) {
    if (secondary.has(id)) shared.push(id);
  }
  const n = shared.length;
  if (n < 2) return { correlation: 0, sampleSize: n };
  const rankP = fractionalRanks(primary, shared);
  const rankS = fractionalRanks(secondary, shared);
  const xs = shared.map((id) => rankP.get(id)!);
  const ys = shared.map((id) => rankS.get(id)!);
  return { correlation: pearson(xs, ys), sampleSize: n };
}

/**
 * Partition an already-ordered list into `tierCount` contiguous bands by rank
 * position. The bands are defined ENTIRELY by the passed order, which by
 * contract is a single window's ranking — there is no parameter through which an
 * averaged-across-windows score could enter, so the mean-of-two-windows banding
 * bug is impossible by construction. Tier 1 holds the highest-scoring band.
 */
export function assignTiers<T>(
  ordered: readonly T[],
  tierCount = DEFAULT_TIER_COUNT
): RankTier<T>[] {
  const n = ordered.length;
  const bands = Math.max(1, Math.min(Math.floor(tierCount), n || 1));
  if (n === 0) return [];
  const tiers: RankTier<T>[] = [];
  for (let t = 0; t < bands; t++) {
    const start = Math.floor((t * n) / bands);
    const end = Math.floor(((t + 1) * n) / bands);
    tiers.push({ tier: t + 1, items: ordered.slice(start, end) });
  }
  return tiers;
}

/** Which tier (1-based) an item's index falls into, given the band layout. */
function tierOfIndex(index: number, n: number, bands: number): number {
  for (let t = 0; t < bands; t++) {
    const end = Math.floor(((t + 1) * n) / bands);
    if (index < end) return t + 1;
  }
  return bands;
}

/** Band each id (1-based tier) by re-banding the given scores over `n` items into `bands`. */
function rebandTiers(
  ids: readonly string[],
  scoreOf: (id: string) => number,
  n: number,
  bands: number
): Map<string, number> {
  const ordered = [...ids].sort((a, b) => scoreOf(b) - scoreOf(a));
  const out = new Map<string, number>();
  ordered.forEach((id, idx) => out.set(id, tierOfIndex(idx, n, bands)));
  return out;
}

/**
 * Validate primary-window tier membership against the secondary window and report
 * the fraction of shared items that keep their tier. Both windows re-band the
 * SAME shared population into the same number of bands — so a secondary window
 * that preserves the shared ordering scores full agreement regardless of how many
 * items each window has outside the overlap. The secondary window is only ever
 * used to validate — never to define the bands.
 */
export function validateBands<T extends ScoredItem>(
  tiers: readonly RankTier<T>[],
  secondary: RankingWindow<T>
): BandValidation {
  const secScore = new Map(secondary.items.map((i) => [i.id, i.score] as const));
  // Shared items carry their primary score from the tier item itself, so the
  // bands stay defined on the primary window alone.
  const primaryScore = new Map<string, number>();
  for (const t of tiers) {
    for (const item of t.items) {
      if (secScore.has(item.id)) primaryScore.set(item.id, item.score);
    }
  }
  const sharedIds = [...primaryScore.keys()];
  const n = sharedIds.length;
  if (n === 0) return { agreement: 0, sampleSize: 0 };
  const bands = tiers.length;
  const primaryTierOf = rebandTiers(sharedIds, (id) => primaryScore.get(id) ?? 0, n, bands);
  const secondaryTierOf = rebandTiers(sharedIds, (id) => secScore.get(id) ?? 0, n, bands);
  let same = 0;
  for (const id of sharedIds) {
    if (primaryTierOf.get(id) === secondaryTierOf.get(id)) same++;
  }
  return { agreement: same / n, sampleSize: n };
}

/**
 * The stability gate. Computes the rank correlation between the primary and
 * secondary windows and either emits the primary-window order (stable) or
 * degrades to tiers defined on the primary window and validated against the
 * secondary (unstable). The returned {@link StabilityReport} always carries the
 * correlation and both window definitions.
 */
export function checkRankStability<T extends ScoredItem>(
  primary: RankingWindow<T>,
  secondary: RankingWindow<T>,
  options: StabilityOptions = {}
): StableRanking<T> {
  const correlationThreshold = options.correlationThreshold ?? DEFAULT_CORRELATION_THRESHOLD;
  const tierCount = options.tierCount ?? DEFAULT_TIER_COUNT;

  const pScores = new Map(primary.items.map((i) => [i.id, i.score] as const));
  const sScores = new Map(secondary.items.map((i) => [i.id, i.score] as const));
  const { correlation, sampleSize } = spearmanRankCorrelation(pScores, sScores);
  const stable = sampleSize >= 2 && correlation >= correlationThreshold;

  const report: StabilityReport = {
    correlation,
    stable,
    presentation: stable ? 'ordered' : 'tiered',
    correlationThreshold,
    sampleSize,
    windows: { primary: primary.label, secondary: secondary.label },
  };

  // Bands are always defined on the primary window ALONE.
  const orderedPrimary = [...primary.items].sort((a, b) => b.score - a.score);

  if (stable) {
    return { report, ordered: orderedPrimary, tiers: null, bandValidation: null };
  }

  const tiers = assignTiers(orderedPrimary, tierCount);
  const bandValidation = validateBands(tiers, secondary);
  return { report, ordered: null, tiers, bandValidation };
}
