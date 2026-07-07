/**
 * Proposals barrel (Phase 5b).
 *
 * Public surface for the model-proposal engine: the pure pool-vs-ranking diff
 * (`diffPoolAgainstRanking`) and the justification renderer (`buildJustification`)
 * the orchestrator's approve/reject handlers and the Phase 6 scheduler consume.
 */

export { buildJustification } from './justification.js';
export type { JustificationInput } from './justification.js';
export { diffPoolAgainstRanking } from './engine.js';
export type { DiffInput, DedupPair } from './engine.js';
