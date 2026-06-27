// packages/core/src/state/event-sourcing/index.ts
export * from './constants';
export { EventSchema, StoredEventSchema, BlobRefSchema, ScopeSchema, isBlobRef } from './events';
export type { Event, EventType, EventInput, StoredEvent, BlobRef, Scope } from './events';
export { getWriterId } from './writer-id';
// eventLogPaths() is intentionally NOT exported: it throws on failure (vs the Result-based
// public surface) and is only used internally by emit/load within this module (I3).
export { emitEvent, loadEvents, readTailSeq } from './log';
export type { EventLogOptions, EmitResult } from './log';
