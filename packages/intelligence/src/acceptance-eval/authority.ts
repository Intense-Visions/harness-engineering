import type { Measurability, Confidence, Authority } from './types.js';

/**
 * Pure mapping from (measurability, confidence) to gate authority.
 *
 * Blocking iff a spec is judged NOT_MEASURABLE with high confidence — i.e. it
 * objectively lacks measurable success criteria; every other combination,
 * including all INCONCLUSIVE and MEASURABLE cases, is advisory. Missing or
 * uncertain inputs never punish the spec.
 *
 * This function is the false-positive-critical seam. Authority is computed
 * here in TypeScript and is NEVER trusted from the LLM response.
 */
export function deriveAcceptanceAuthority(
  measurability: Measurability,
  confidence: Confidence
): Authority {
  return measurability === 'NOT_MEASURABLE' && confidence === 'high' ? 'blocking' : 'advisory';
}
