/**
 * Beta sampling for the `thompson` policy, driven entirely by the injected
 * `rng` so a seeded test is deterministic (spec "Policies": `rng` is injectable).
 * Gamma via Marsaglia & Tsang (2000); Beta(a, b) = X / (X + Y) with
 * X ~ Gamma(a, 1), Y ~ Gamma(b, 1). Only `sampleBeta` is exported.
 */

/** A uniform source on [0, 1). `Math.random` in production; a seeded PRNG in tests. */
export type Rng = () => number;

/** Standard normal via Box-Muller; `1 - u` keeps the log argument in (0, 1]. */
function sampleStandardNormal(rng: Rng): number {
  const u1 = 1 - rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** One Marsaglia-Tsang candidate for Gamma(shape >= 1, 1); returns undefined on rejection. */
function gammaCandidate(d: number, c: number, rng: Rng): number | undefined {
  let x: number;
  let v: number;
  do {
    x = sampleStandardNormal(rng);
    v = 1 + c * x;
  } while (v <= 0);
  v = v * v * v;
  const u = rng();
  if (u < 1 - 0.0331 * x ** 4) return d * v;
  if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  return undefined;
}

/** Gamma(shape, 1). Shapes below 1 use the boost Gamma(shape + 1) * U^(1/shape). */
function sampleGamma(shape: number, rng: Rng): number {
  if (shape < 1) {
    const u = 1 - rng();
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const candidate = gammaCandidate(d, c, rng);
    if (candidate !== undefined) return candidate;
  }
}

/** One draw from Beta(alpha, beta) using only `rng`. Requires alpha > 0 and beta > 0 (validated by `resolveBanditConfig`). */
export function sampleBeta(alpha: number, beta: number, rng: Rng): number {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  const total = x + y;
  return total === 0 ? 0.5 : x / total;
}
