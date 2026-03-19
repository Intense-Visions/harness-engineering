// packages/core/src/state/index.ts
export {
  HarnessStateSchema,
  DEFAULT_STATE,
  FailureEntrySchema,
  HandoffSchema,
  GateResultSchema,
  GateConfigSchema,
} from './types';
export type { HarnessState, FailureEntry, Handoff, GateResult, GateConfig } from './types';
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
export { StreamInfoSchema, StreamIndexSchema, DEFAULT_STREAM_INDEX } from './stream-types';
export type { StreamInfo, StreamIndex } from './stream-types';
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
