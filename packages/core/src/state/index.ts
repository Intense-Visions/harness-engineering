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
 * Learning content parsing and deduplication.
 */
export {
  parseFrontmatter,
  extractIndexEntry,
  parseDateFromEntry,
  normalizeLearningContent,
  computeContentHash,
  analyzeLearningPatterns,
} from './learnings-content';
export type {
  LearningsFrontmatter,
  LearningsIndexEntry,
  LearningPattern,
} from './learnings-content';

/**
 * Learning file loader with mtime-based cache.
 */
export { clearLearningsCache, loadRelevantLearnings } from './learnings-loader';

/**
 * Learning CRUD operations: append, load index, budgeted retrieval.
 */
export { appendLearning, loadBudgetedLearnings, loadIndexEntries } from './learnings';
export type { BudgetedLearningsOptions } from './learnings';

/**
 * Learning lifecycle: archival, pruning, session promotion.
 */
export {
  archiveLearnings,
  pruneLearnings,
  promoteSessionLearnings,
  countLearningEntries,
} from './learnings-lifecycle';
export type { PruneResult, PromoteResult } from './learnings-lifecycle';

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

/**
 * Structured event log for skill lifecycle moments.
 */
export {
  emitEvent,
  loadEvents,
  formatEventTimeline,
  SkillEventSchema,
  clearEventHashCache,
} from './events';
export type {
  SkillEvent,
  EventType,
  EmitEventInput,
  EmitEventOptions,
  EmitEventResult,
  LoadEventsOptions,
} from './events';
