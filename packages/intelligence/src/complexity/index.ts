/**
 * Complexity cascade + pure tier derivation (AMR Phase 2).
 *
 * Public surface: the cheap-first phase-aware classifier (`classify`), its
 * building blocks (`runStaticPass`, `llmTiebreak`), and the pure
 * `deriveRequiredTier` (matrix + D5 veto + D8 clamp + D10 floor). The LLM only
 * sets level/confidence; the tier is always TS-derived (D3).
 */

export { classify } from './classifier.js';
export type { ClassifyInput } from './classifier.js';

export { runStaticPass, STATIC_WEIGHTS } from './static-pass.js';
export { llmTiebreak } from './tiebreak.js';
export type { TiebreakResult } from './tiebreak.js';

export {
  deriveRequiredTier,
  baseTier,
  applyBudgetClamp,
  blastRadiusVeto,
  SENSITIVE_BLAST_THRESHOLD,
  TIER_RANK,
  RANK_TIER,
  DEFAULT_DEGRADE_AT_PCT,
} from './derive-tier.js';

export { serializeSignals } from './signals.js';

export type { Phase, ComplexitySignals, StaticVerdict } from './types.js';
