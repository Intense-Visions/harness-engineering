// packages/core/src/state/event-sourcing/index.ts
export * from './constants';
export { EventSchema, StoredEventSchema, BlobRefSchema, ScopeSchema, isBlobRef } from './events';
export type { Event, EventType, EventInput, StoredEvent, BlobRef, Scope } from './events';
export { getWriterId } from './writer-id';
// eventLogPaths() is intentionally NOT exported: it throws on failure (vs the Result-based
// public surface) and is only used internally by emit/load within this module (I3).
export { emitEvent, loadEvents, readTailSeq } from './log';
export type { EventLogOptions, EmitResult } from './log';
// Phase 2: core-state projection + materialized snapshot.
export { projectCoreState, toHarnessState } from './projections/core-state';
export type { CoreStateProjection } from './projections/core-state';
// scheduleMaterialize / __resetMaterializeTimersForTests / __flushMaterializeForTests are
// intentionally NOT exported (module-internal debounce + test-only hooks).
export { reduce, materialize, readSnapshot, isStale, MATERIALIZE_DEBOUNCE_MS } from './snapshot';
// LanesProjection now lives in ./projections/lanes and AuditProjection in
// ./projections/audit (both exported below); keep Snapshot here.
export type { Snapshot } from './snapshot';
// Phase 5: audit projection (the append-only session audit trail, subsumes GH-580).
export { projectAudit, formatAuditTimeline } from './projections/audit';
export type { AuditProjection, AuditEntry, AuditKind } from './projections/audit';
// Phase 3: genesis migration (idempotent, crash-safe import of the legacy state.json) +
// reset primitive (truncate log + clear snapshot/blobs + re-genesis DEFAULT_STATE).
export { importLegacyState, resetEventLog } from './migrate';
// Phase 4: lane state machine (events, transition table + guards, projection, writers).
export { LANES, LaneSchema } from './events';
export type { Lane } from './events';
export {
  isAllowedTransition,
  isTerminal,
  TERMINAL_LANES,
  dependencyGuard,
  evidenceGuard,
  forceGuard,
  checkTransition,
} from './lane-machine';
export type { ForceOpts, TransitionOpts } from './lane-machine';
export { projectLanes } from './projections/lanes';
export type { LanesProjection, LaneRecord, LaneHistoryEntry } from './projections/lanes';
export { registerTask, transitionLane } from './transition';
