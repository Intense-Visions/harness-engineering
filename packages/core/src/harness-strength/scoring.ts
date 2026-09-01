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
 *
 * This is the FINDINGS-only score: it answers "how clean was what we evaluated?"
 * and has no coverage term by design. The auditor scales it by coverage via
 * {@link scoreWithCoverage} so a clean score across only some patterns cannot
 * read as a full pass (#1761); the tier returned here still keys off the
 * findings score so the coverage penalty stays orthogonal to detected weakness.
 */
export function rollupScore(findings: StrengthFinding[]): { score: number; tier: Tier } {
  const deduction = findings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);
  const score = clamp(100 - deduction, 0, 100);
  return { score, tier: tierFor(score) };
}

/**
 * Scale a findings-only score by audit coverage (#1761). The prior score was
 * `100 - sum(findings)`, which had no coverage term — so a repo where most
 * patterns abstained still scored 100/100 ("we could not audit this" read
 * identically to "we audited this and it was clean"). Multiplying by
 * `evaluated / applicable` makes abstention cost score: 2 of 7 patterns clean is
 * ~29, and a repo where every pattern abstains is 0, not 100.
 *
 * Full coverage (`evaluated === applicable`) is the identity, so a genuinely
 * complete clean audit still earns 100. A vacuous denominator
 * (`applicable <= 0`) returns the raw score unchanged rather than dividing by
 * zero. Pure and deterministic: no IO, no Date, no randomness.
 */
export function scoreWithCoverage(rawScore: number, evaluated: number, applicable: number): number {
  if (applicable <= 0) return rawScore;
  const ratio = clamp(evaluated / applicable, 0, 1);
  return Math.round(clamp(rawScore * ratio, 0, 100));
}
