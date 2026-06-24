import type { StrengthFinding, Tier } from './types';

/** Per-severity point deduction. Tunable: 7 errors floors the score near 0. */
export const SEVERITY_WEIGHTS: Record<StrengthFinding['severity'], number> = {
  error: 14,
  warning: 6,
  info: 2,
};

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Pure score→tier mapping. Exported so the solid/at-risk boundary is unit-testable. */
export function tierFor(score: number): Tier {
  if (score >= 85) return 'solid';
  if (score >= 50) return 'at-risk';
  return 'theatre';
}

/**
 * Pure, deterministic rollup. Starts at 100 and subtracts SEVERITY_WEIGHTS
 * per finding, clamped to [0, 100]. No IO, no Date, no randomness.
 */
export function rollupScore(findings: StrengthFinding[]): { score: number; tier: Tier } {
  const deduction = findings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);
  const score = clamp(100 - deduction, 0, 100);
  return { score, tier: tierFor(score) };
}
