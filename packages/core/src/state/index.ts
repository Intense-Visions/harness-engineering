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
 * Core state manager for loading and saving project health, learnings, and handoffs.
 */
export {
  loadState,
  saveState,
  appendLearning,
  loadRelevantLearnings,
  appendFailure,
  loadFailures,
  archiveFailures,
  saveHandoff,
  loadHandoff,
  runMechanicalGate,
} from './state-manager';

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
