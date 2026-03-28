/**
 * Validation schemas and default values for Harness state, handoffs, and gates.
 */
export {
  HarnessStateSchema,
  DEFAULT_STATE,
  FailureEntrySchema,
  HandoffSchema,
  GateResultSchema,
  GateConfigSchema,
} from './types';

/**
 * Type definitions for state management, failures, handoffs, and gates.
 */
export type { HarnessState, FailureEntry, Handoff, GateResult, GateConfig } from './types';

/**
 * State persistence for loading and saving project health.
 */
export { loadState, saveState } from './state-persistence';

/**
 * Learning accumulation and retrieval.
 */
export {
  clearLearningsCache,
  appendLearning,
  loadRelevantLearnings,
  loadBudgetedLearnings,
  parseDateFromEntry,
  analyzeLearningPatterns,
  archiveLearnings,
  pruneLearnings,
  promoteSessionLearnings,
  countLearningEntries,
} from './learnings';
export type {
  BudgetedLearningsOptions,
  LearningPattern,
  PruneResult,
  PromoteResult,
} from './learnings';

/**
 * Failure tracking, loading, and archival.
 */
export { clearFailuresCache, appendFailure, loadFailures, archiveFailures } from './failures';

/**
 * Handoff persistence for session continuity.
 */
export { saveHandoff, loadHandoff } from './handoff';

/**
 * Mechanical gate for running project quality checks.
 */
export { runMechanicalGate } from './mechanical-gate';

/**
 * Validation schemas and defaults for stream-based state management.
 */
export { StreamInfoSchema, StreamIndexSchema, DEFAULT_STREAM_INDEX } from './stream-types';

/**
 * Type definitions for state streams and stream indices.
 */
export type { StreamInfo, StreamIndex } from './stream-types';

/**
 * Resolver for managing state streams across different branches and sessions.
 */
export {
  resolveStreamPath,
  createStream,
  listStreams,
  setActiveStream,
  archiveStream,
  loadStreamIndex,
  saveStreamIndex,
  migrateToStreams,
  getStreamForBranch,
  touchStream,
} from './stream-resolver';

/**
 * Session directory resolution and index management.
 */
export { resolveSessionDir, updateSessionIndex } from './session-resolver';

/**
 * Session summary persistence for cold-start context restoration.
 */
export { writeSessionSummary, loadSessionSummary, listActiveSessions } from './session-summary';
export type { SessionSummaryData } from './session-summary';

/**
 * Session section persistence for accumulative cross-skill state.
 */
export {
  readSessionSections,
  readSessionSection,
  appendSessionEntry,
  updateSessionEntryStatus,
} from './session-sections';

/**
 * Session archival for preserving previous session state.
 */
export { archiveSession } from './session-archive';
