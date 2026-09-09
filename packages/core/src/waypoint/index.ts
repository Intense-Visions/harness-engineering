/**
 * Waypoint `sdlc.*` emission layer — opt-in via the `waypoint.sink` key in
 * `harness.config.json`; a guaranteed no-op (no files, no I/O, no behavior
 * change) when that key is absent. See pnyon/pnyon#124 and the change
 * proposal at `docs/changes/waypoint-sdlc-emission/proposal.md`.
 */

export { createUlidFactory, isUlid, ULID_LENGTH, type UlidFactoryOptions } from './ulid';
export { validateSdlcEvent } from './validate';
export { bestEffortScrub, REDACTED, type ScrubOutcome } from './scrub';
export {
  DEFAULT_MAX_EVENTS,
  FileSpool,
  mergeSegments,
  readSpoolSegments,
  type FileSpoolOptions,
} from './spool';
export { loadWaypointConfig } from './config-loader';
export {
  advanceMark,
  CHECKPOINT_FILENAME,
  EMPTY_CHECKPOINT,
  eventIdOf,
  readCheckpoint,
  unshippedLines,
  writeCheckpoint,
  type ShipCheckpoint,
} from './checkpoint';
export {
  countUnshipped,
  DEFAULT_BATCH_SIZE,
  hasLanded,
  ingestUrl,
  isTerminal,
  shipSpool,
  ShipError,
  type IngestEventResult,
  type IngestReportBody,
  type IngestResultKind,
  type RejectedEvent,
  type ShipFetch,
  type ShipOptions,
  type ShipReport,
} from './shipper';
export {
  describeViolations,
  sdlcContract,
  validateAgainstContract,
  type ContractViolation,
  type ContractVerdict,
} from './contract';
export {
  countRejected,
  recordRejected,
  REJECTED_FILENAME,
  rejectedLogPath,
  type RejectedRecord,
} from './rejected-log';
export {
  configureWaypointEmitter,
  emitSdlc,
  ensureWaypointEmitter,
  getWaypointEmitter,
  initWaypointEmitter,
  resetWaypointEmitterForTests,
  WaypointEmitter,
  type EmissionFailure,
  type EmitSdlcOptions,
  type WaypointEmitterOptions,
  type WaypointEmitterPorts,
} from './emitter';
export {
  emitFleetHandoffWritten,
  emitFleetProvenanceWritten,
  emitRoadmapClaim,
  emitRoadmapRelease,
  emitRoadmapStatusChange,
  emitSkillPhaseTransition,
  emitVerdictPersisted,
  verdictGrade,
  type FleetProvenanceArtifact,
  type PersistedVerdict,
  type SkillPhaseTransition,
  type SkillTransitionQualityGate,
  type VerdictKind,
} from './events';
