/**
 * Candidates — public barrel (LMLM Phase 2).
 *
 * The GGUF→candidate parser (shared with the refresh script), the frozen
 * snapshot loader (offline-safe runtime source), and the allowlist-aware
 * selector the orchestrator feeds into the recommender.
 *
 * @see docs/changes/lmlm-functional-wiring/proposal.md (Phase 2)
 */

export { extractSizeB, extractQuantFromFilename, parseHfModelToCandidates } from './parse.js';
export type { ExtractedSize, ParseCandidateOptions } from './parse.js';

export { discoverCandidates, curationFromCandidates } from './discover.js';
export type {
  CurationTags,
  DiscoverCandidatesOptions,
  DiscoverCandidatesResult,
} from './discover.js';

export {
  loadFrozenCandidates,
  validateFrozenCandidates,
  FROZEN_CANDIDATES_VERSION,
} from './frozen.js';

export { selectCandidates } from './select.js';
export type { CandidateSelectionBounds } from './select.js';

export type { FrozenCandidate, FrozenCandidatesFile, LoadFrozenCandidatesResult } from './types.js';
