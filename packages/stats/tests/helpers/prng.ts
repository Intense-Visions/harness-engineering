/**
 * Deterministic seeded PRNG (mulberry32) for the statistical tests in this
 * package. Every test that draws randomness takes `mulberry32(seed)` so a
 * failing seed is a reproducible bug, never a flake. Same algorithm as the
 * core event-sourcing property test; kept local so `stats` stays a leaf.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
