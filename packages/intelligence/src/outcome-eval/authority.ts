import type { Verdict, Confidence, Authority } from './types.js';

/**
 * Pure mapping from (verdict, confidence) to ship authority.
 *
 * Blocking iff a NOT_SATISFIED verdict is held with high confidence; every
 * other combination — including all INCONCLUSIVE and SATISFIED cases — is
 * advisory. Missing inputs never punish the change.
 *
 * This function is the false-positive-critical seam. Authority is computed
 * here in TypeScript and is NEVER trusted from the LLM response.
 */
export function deriveAuthority(verdict: Verdict, confidence: Confidence): Authority {
  return verdict === 'NOT_SATISFIED' && confidence === 'high' ? 'blocking' : 'advisory';
}
