/**
 * Lineage score interpolation (finishes the `interpolated` evidence grade).
 *
 * A candidate with NO direct benchmark observation for its exact `hfRepoId` used
 * to merge to `score: 0` and floor to `evidence: 'interpolated'` — a misnomer,
 * since nothing was actually interpolated. The result was real models (e.g.
 * `Qwen/Qwen3-8B-GGUF`) shown as "score 0 · interpolated" and, once pooled,
 * churned by the diff engine (any candidate "beats" a 0).
 *
 * This module supplies the missing interpolation: it groups the benchmark
 * snapshot by model *series* (family, size-agnostic) and, for an un-benchmarked
 * candidate, infers a merged score from same-series siblings by parameter count.
 * Interpolated scores are marked `evidence: 'interpolated'` and carry `'low'`
 * benchmark confidence, so the ×0.6 confidence multiplier dampens them — an
 * inferred score never outranks a directly-measured one of equal raw value.
 *
 * The curve is deliberately simple and data-bounded (no magic exponents): linear
 * in `sizeB` between the two bracketing siblings, clamped to the known score
 * range outside it (never invents a score higher than any measured sibling). A
 * single sibling is scaled down linearly for a smaller target and held for a
 * larger one. When a series has no benchmarked sibling at all, the score stays 0
 * (honestly unknown) rather than fabricated.
 */

import { mergeBenchmarks } from './benchmarks/merge.js';
import type { BenchmarkSnapshot } from './benchmarks/types.js';

/** One known (size, score) point within a model series. */
export interface SeriesPoint {
  sizeB: number;
  score: number;
}

/**
 * Normalize an `hfRepoId` to a size-agnostic series key so every size of one
 * model line collapses together (`Qwen/Qwen3-8B-GGUF` and `Qwen/Qwen3-32B-GGUF`
 * → `qwen-qwen3`). Deriving the key the same way for candidates and snapshot
 * models keeps the two sides consistent without the candidate needing a `family`.
 */
export function seriesKey(hfRepoId: string): string {
  return hfRepoId
    .toLowerCase()
    .replace(/[-_/]?\d+(?:\.\d+)?b\b/g, '') // drop parameter-size tokens: -8b, 70b, 1.5b
    .replace(/[-_]?gguf\b/g, '') // drop the GGUF format suffix
    .replace(/[-_/\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Merged benchmark score per known model, grouped by {@link seriesKey} and sorted
 * ascending by `sizeB`. Models with no observations (or a non-positive merged
 * score) are skipped — only real, measured siblings anchor the interpolation.
 */
export function buildSeriesScores(
  snapshot: BenchmarkSnapshot,
  snapshotDate: string
): Map<string, SeriesPoint[]> {
  const bySeries = new Map<string, SeriesPoint[]>();
  for (const model of snapshot.models) {
    if (model.observations.length === 0) continue;
    const merged = mergeBenchmarks({
      observations: [...model.observations],
      target: { model: model.hfRepoId, quant: '' },
      snapshotDate,
    });
    if (merged.score <= 0) continue;
    const key = seriesKey(model.hfRepoId);
    const points = bySeries.get(key) ?? [];
    points.push({ sizeB: model.sizeB, score: merged.score });
    bySeries.set(key, points);
  }
  for (const points of bySeries.values()) points.sort((a, b) => a.sizeB - b.sizeB);
  return bySeries;
}

/** Linear interpolation of score between two points at parameter count `x`. */
function lerp(a: SeriesPoint, b: SeriesPoint, x: number): number {
  if (b.sizeB === a.sizeB) return (a.score + b.score) / 2;
  const t = (x - a.sizeB) / (b.sizeB - a.sizeB);
  return a.score + t * (b.score - a.score);
}

/**
 * Infer a benchmark score for `targetSizeB` from same-series known points.
 * Returns `undefined` when the series has no measured sibling (score stays 0 /
 * unknown upstream). See the module header for the (deliberately simple) curve.
 */
export function interpolateBySize(
  points: readonly SeriesPoint[],
  targetSizeB: number
): number | undefined {
  if (points.length === 0) return undefined;
  if (points.length === 1) {
    const only = points[0]!;
    // No trend from a single point: hold the score for an equal-or-larger target,
    // scale down proportionally for a smaller one (bigger models score higher).
    return targetSizeB >= only.sizeB ? only.score : only.score * (targetSizeB / only.sizeB);
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  // Below the smallest measured size: extrapolate down the first segment (floored
  // at 0). Above the largest: clamp — never invent a score above a real sibling.
  if (targetSizeB <= first.sizeB) return Math.max(0, lerp(first, points[1]!, targetSizeB));
  if (targetSizeB >= last.sizeB) return last.score;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (targetSizeB >= a.sizeB && targetSizeB <= b.sizeB) return lerp(a, b, targetSizeB);
  }
  return last.score; // unreachable given the bounds above
}
