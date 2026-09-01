/**
 * MDL knowledge pruning (#1630) — Minimum Description Length as the knowledge
 * store's fitness function.
 *
 * Scores each entry's description cost (tokens shipped per inclusion × inclusion
 * frequency) against its compression value (measured reduction in re-derivation
 * / rework in runs where the entry was present vs matched runs where it was
 * absent), and emits prune/merge RECOMMENDATIONS. `insufficient-evidence` is a
 * first-class verdict — pruning requires measured worthlessness, never
 * measurement absence.
 *
 * Report-only for this slice: executing the prune/merge, and consolidating onto
 * #1633's rate-distortion ablation harness + #1621's skill-P&L machinery, are
 * deferred follow-ups. The matched comparison here is deliberately self-contained.
 */

export {
  type KnowledgeEntry,
  type InclusionEvent,
  type RunOutcome,
  type MdlVerdict,
  type MdlConfig,
  DEFAULT_MDL_CONFIG,
} from './types';

export { computeDescriptionCost, inclusionRunIds, type DescriptionCost } from './cost';

export { estimateCompressionValue, type CompressionValue } from './matched-comparison';

export { scoreEntry, scoreEntries, type EntryScore } from './score';

export { findMergeCandidates, type MergeCandidate } from './consolidate';

export { buildMdlReport, type MdlReport, type PruneRecommendation } from './report';

export { buildKnowledgeEntriesFromLearnings } from './adapter';
