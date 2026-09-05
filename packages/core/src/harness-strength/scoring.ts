import type { DenominatedMetric } from '@harness-engineering/types';

import { denominate } from '../metrics';
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
 * The audit's coverage as a denominated metric (#1530): how many of the patterns
 * that APPLIED to this mode were actually evaluable.
 *
 * Exported so the renderer can show the population next to the score instead of
 * re-deriving it, and so `applicable === 0` is a typed abstention rather than a
 * branch each caller has to remember.
 */
export function patternCoverage(evaluated: number, applicable: number): DenominatedMetric {
  return denominate({
    metric: 'harness_strength.pattern_coverage',
    numerator: evaluated,
    denominator: applicable,
    population: {
      definition: 'strength patterns applicable to this mode',
      exclusions: ['patterns whose required input was absent (they abstained)'],
    },
  });
}

/**
 * Scale a findings-only score by audit coverage (#1761), or abstain (#1530).
 *
 * The prior score was `100 - sum(findings)`, which had no coverage term — so a
 * repo where most patterns abstained still scored 100/100 ("we could not audit
 * this" read identically to "we audited this and it was clean"). Multiplying by
 * `evaluated / applicable` makes abstention cost score: 2 of 7 patterns clean is
 * ~29, and a repo where every pattern abstains is 0, not 100. Full coverage
 * (`evaluated === applicable`) is the identity, so a genuinely complete clean
 * audit still earns 100.
 *
 * **Returns `null` when the coverage denominator is vacuous** (`applicable <= 0`
 * — no pattern applied to this mode at all). This used to return `rawScore`,
 * which is 100 for a repo with no findings, so "there was nothing here to audit"
 * printed as a perfect score with a `solid` tier — the identical bug #1761 was
 * filed to fix, surviving one level up in the same function. There is no number
 * that honestly summarizes an audit that evaluated nothing, so there is no
 * number: a zero denominator is an abstention, not a pass.
 *
 * Pure and deterministic: no IO, no Date, no randomness.
 */
export function scoreWithCoverage(
  rawScore: number,
  evaluated: number,
  applicable: number
): number | null {
  const coverage = patternCoverage(evaluated, applicable);
  if (coverage.basis !== 'measured') return null;
  const ratio = clamp(coverage.value ?? 0, 0, 1);
  return Math.round(clamp(rawScore * ratio, 0, 100));
}
