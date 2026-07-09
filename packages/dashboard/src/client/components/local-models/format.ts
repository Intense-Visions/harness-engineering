/**
 * Shared number formatting for the LMLM panel so raw floats never leak into the
 * DOM (e.g. `75.65831765532494 GB`, `score 57.629999999999995`). The convention,
 * consistent across the Recommendations and Pool cards:
 *   - sizes / VRAM (GB)  → one decimal, trailing `.0` dropped (`44.2`, `18.1`, `100`)
 *   - absolute scores    → whole number (`71`, `58`, `55`) — a 0–100 index, not a measurement
 * (Score *deltas* stay one-decimal at their call sites via {@link round1}.)
 */

/** Round to at most one decimal, dropping a trailing `.0` (e.g. 44.159 → "44.2", 20 → "20"). */
export function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Absolute ranking scores render as whole numbers (a 0–100 index, not a measurement). */
export function fmtScore(n: number): string {
  return Math.round(n).toString();
}
