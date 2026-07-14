/**
 * Roadmap Auto-Triage — shared contracts (Phase 0 foundations).
 *
 * Inert substrate consumed by later phases: the triage record data model +
 * `shapeKey` bucketing (Contract 1), the `PrecedentLookup` seam P1 injects, and
 * the naive entity extractor the scope lever depends on (Contract 4). No feature
 * behavior lives here.
 */

export { shapeKey } from './record.js';
export { aggregatePrecedent, precedentLookupFromRecords } from './precedent.js';
export { extractEntities } from './entities.js';
export type {
  TriageRecord,
  TriagePrediction,
  TriageOutcome,
  PrecedentLookup,
  PrecedentRate,
  EscalationCategory,
  RatchetStage,
} from './record.js';

// Phase 1: the scoping-probe contracts (types) + pure probe/rank.
export type {
  LeverResult,
  ResolvedEntity,
  ScopeEstimate,
  GraphScope,
  OpenDecision,
  HoldReason,
  ProbeInput,
  ProbeLevers,
  TriageVerdict,
} from './types.js';
export { runScopingProbe } from './probe.js';
export type { ProbeConfig, ProbeDeps } from './probe.js';
export { pilotScore, rankTriageCandidates } from './rank.js';
export type { RankableCandidate } from './rank.js';

// Phase 2: the autonomous-brainstorm decision core (pure types + runner).
export { depthForLevel, DEPTH_BY_LEVEL } from './brainstorm/types.js';
export type {
  ForkConfidence,
  Fork,
  ForkDecision,
  ForkGenerator,
  DepthBudget,
  SpecDraft,
  BrainstormInput,
  HaltReason,
  BrainstormOutcome,
} from './brainstorm/types.js';
export { runAutoBrainstorm } from './brainstorm/runner.js';

// Phase 4: the pure post-diff retrospective comparator (prediction vs. actual).
export {
  compareToPrediction,
  LEVEL_RANK,
  BLAST_TOLERANCE_FACTOR,
  BLAST_TOLERANCE_ABS,
} from './retrospective.js';
export type { RetrospectiveComparison } from './retrospective.js';
export { resolveStage, DEFAULT_RATCHET_CONFIG, V1_MAX_STAGE } from './ratchet.js';
export type { V1Stage, RatchetOutcome, RatchetConfig } from './ratchet.js';

// Phase 3: the pure go/no-go gate (autonomy ratchet stage 1).
export { resolveGoNoGo, AUTO_EXECUTE_CATEGORIES } from './gate.js';
export type {
  GoNoGoCandidate,
  GoNoGoDecision,
  HeldCandidate,
  HoldReason as GoNoGoHoldReason,
} from './gate.js';
