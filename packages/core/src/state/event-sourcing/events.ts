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

// --- Payload catalog (Phase 1 + Phase 2 core-state variants) ---
const StateImportedPayload = z.object({ legacyState: z.unknown() });
const DecisionRecordedPayload = z.object({
  id: z.string(),
  text: z.string(),
  context: z.string().optional(),
});
const PositionSetPayload = z.object({
  phase: z.string().optional(),
  task: z.string().optional(),
});
const BlockerOpenedPayload = z.object({ id: z.string(), description: z.string() });
const BlockerResolvedPayload = z.object({ id: z.string() });
const ProgressSetPayload = z.object({
  task: z.string(),
  status: z.enum(['pending', 'in_progress', 'complete']),
});
const SessionSummarizedPayload = z.object({
  date: z.string().optional(),
  summary: z.string(),
  lastSkill: z.string().optional(),
  pendingTasks: z.array(z.string()).optional(),
});

// --- Phase 4: lane state-machine vocabulary + lane event payloads (additive) ---
export const LANES = [
  'planned',
  'claimed',
  'in_progress',
  'in_review',
  'done',
  'blocked',
  'canceled',
] as const;
export const LaneSchema = z.enum(LANES);
export type Lane = z.infer<typeof LaneSchema>;

const TaskRegisteredPayload = z.object({
  taskId: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
});
const LaneTransitionedPayload = z.object({
  taskId: z.string().min(1),
  from: LaneSchema,
  to: LaneSchema,
  force: z.boolean().optional(),
  actor: z.string().optional(),
  reason: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});
/** Inferred input shape for a lane_transitioned payload (used by the transitionLane writer). */
export type LaneTransitionedInput = z.infer<typeof LaneTransitionedPayload>;

// --- Phase 5: audit-trail vocabulary (subsumes #580), additive ---
const UserInputCapturedPayload = z.object({
  text: z.string(),
  interactionId: z.string().optional(),
});
const ApprovalRequestedPayload = z.object({
  interactionId: z.string().min(1),
  kind: z.string().min(1),
  prompt: z.string(),
});
const ApprovalResolvedPayload = z.object({
  interactionId: z.string().min(1),
  response: z.string(),
});

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
  z.object({ ...envelopeShape, type: z.literal('blocker_opened'), payload: BlockerOpenedPayload }),
  z.object({
    ...envelopeShape,
    type: z.literal('blocker_resolved'),
    payload: BlockerResolvedPayload,
  }),
  z.object({ ...envelopeShape, type: z.literal('progress_set'), payload: ProgressSetPayload }),
  z.object({
    ...envelopeShape,
    type: z.literal('session_summarized'),
    payload: SessionSummarizedPayload,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('task_registered'),
    payload: TaskRegisteredPayload,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('lane_transitioned'),
    payload: LaneTransitionedPayload,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('user_input_captured'),
    payload: UserInputCapturedPayload,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('approval_requested'),
    payload: ApprovalRequestedPayload,
  }),
  z.object({
    ...envelopeShape,
    type: z.literal('approval_resolved'),
    payload: ApprovalResolvedPayload,
  }),
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
  type: z.enum([
    'state_imported',
    'decision_recorded',
    'position_set',
    'blocker_opened',
    'blocker_resolved',
    'progress_set',
    'session_summarized',
    'task_registered',
    'lane_transitioned',
    'user_input_captured',
    'approval_requested',
    'approval_resolved',
  ]),
  payload: z.union([z.record(z.unknown()), BlobRefSchema]),
});
export type StoredEvent = z.infer<typeof StoredEventSchema>;

/** Caller-supplied input; envelope fields (seq/writerId/timestamp/scope) are stamped by emitEvent. */
export type EventInput =
  | { type: 'state_imported'; payload: z.infer<typeof StateImportedPayload> }
  | { type: 'decision_recorded'; payload: z.infer<typeof DecisionRecordedPayload> }
  | { type: 'position_set'; payload: z.infer<typeof PositionSetPayload> }
  | { type: 'blocker_opened'; payload: z.infer<typeof BlockerOpenedPayload> }
  | { type: 'blocker_resolved'; payload: z.infer<typeof BlockerResolvedPayload> }
  | { type: 'progress_set'; payload: z.infer<typeof ProgressSetPayload> }
  | { type: 'session_summarized'; payload: z.infer<typeof SessionSummarizedPayload> }
  | { type: 'task_registered'; payload: z.input<typeof TaskRegisteredPayload> }
  | { type: 'lane_transitioned'; payload: z.infer<typeof LaneTransitionedPayload> }
  | { type: 'user_input_captured'; payload: z.infer<typeof UserInputCapturedPayload> }
  | { type: 'approval_requested'; payload: z.infer<typeof ApprovalRequestedPayload> }
  | { type: 'approval_resolved'; payload: z.infer<typeof ApprovalResolvedPayload> };

/** True when a stored payload is a blob reference rather than an inline payload. */
export function isBlobRef(payload: unknown): payload is BlobRef {
  return BlobRefSchema.safeParse(payload).success;
}
