import type { RegressionVerdictKind, Confidence, RegressionAuthority } from './types.js';

/**
 * Pure mapping from (verdict, confidence) to ship authority.
 *
 * Blocking iff a REGRESSED verdict is held with high confidence; every other
 * combination — including all INCONCLUSIVE and STABLE cases — is advisory. A
 * noisy or low-confidence signal never blocks a skill/prompt PR.
 *
 * This function is the false-positive-critical seam. Authority is computed here
 * in TypeScript and is NEVER trusted from the LLM response. Mirrors
 * outcome-eval's `deriveAuthority`.
 */
export function deriveRegressionAuthority(
  verdict: RegressionVerdictKind,
  confidence: Confidence
): RegressionAuthority {
  return verdict === 'REGRESSED' && confidence === 'high' ? 'blocking' : 'advisory';
}
