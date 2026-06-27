// packages/core/src/state/event-sourcing/events.ts
import { z } from 'zod';
import { BLOB_REF_KEY } from './constants';

/** Resolution scope for an event log (mirrors getStateDir params). */
export const ScopeSchema = z.object({
  stream: z.string().optional(),
  session: z.string().optional(),
});
export type Scope = z.infer<typeof ScopeSchema>;

/** Shared envelope fields stamped on every event. */
const envelopeShape = {
  seq: z.number().int().nonnegative(),
  writerId: z.string().min(1),
  timestamp: z.string(),
  scope: ScopeSchema,
};

// --- Phase 1 minimal payload catalog (extended in later phases) ---
const StateImportedPayload = z.object({ legacyState: z.unknown() });
const DecisionRecordedPayload = z.object({ id: z.string(), text: z.string() });
const PositionSetPayload = z.object({ position: z.string() });

/** Strict in-memory event union (payload fully present). */
export const EventSchema = z.discriminatedUnion('type', [
  z.object({
    ...envelopeShape,
    type: z.literal('state_imported'),
    payload: StateImportedPayload,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('decision_recorded'),
    payload: DecisionRecordedPayload,
  }),
  z.object({ ...envelopeShape, type: z.literal('position_set'), payload: PositionSetPayload }),
]);
export type Event = z.infer<typeof EventSchema>;
export type EventType = Event['type'];

/** On-disk blob reference marker (replaces an oversized payload on the stored line). */
export const BlobRefSchema = z.object({ [BLOB_REF_KEY]: z.string().min(1) }).strict();
export type BlobRef = z.infer<typeof BlobRefSchema>;

/**
 * Relaxed schema for a line as stored on disk: the payload may be the real payload
 * OR a blob reference. Used at read time before rehydration; rehydrated events are then
 * validated against EventSchema.
 */
export const StoredEventSchema = z.object({
  ...envelopeShape,
  type: z.enum(['state_imported', 'decision_recorded', 'position_set']),
  payload: z.union([z.record(z.unknown()), BlobRefSchema]),
});
export type StoredEvent = z.infer<typeof StoredEventSchema>;

/** Caller-supplied input; envelope fields (seq/writerId/timestamp/scope) are stamped by emitEvent. */
export type EventInput =
  | { type: 'state_imported'; payload: z.infer<typeof StateImportedPayload> }
  | { type: 'decision_recorded'; payload: z.infer<typeof DecisionRecordedPayload> }
  | { type: 'position_set'; payload: z.infer<typeof PositionSetPayload> };

/** True when a stored payload is a blob reference rather than an inline payload. */
export function isBlobRef(payload: unknown): payload is BlobRef {
  return BlobRefSchema.safeParse(payload).success;
}
