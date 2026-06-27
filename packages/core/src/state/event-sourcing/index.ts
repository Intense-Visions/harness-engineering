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
export type { Snapshot, LanesProjection, AuditProjection } from './snapshot';
// Phase 3: genesis migration (idempotent, crash-safe import of the legacy state.json) +
// reset primitive (truncate log + clear snapshot/blobs + re-genesis DEFAULT_STATE).
export { importLegacyState, resetEventLog } from './migrate';
