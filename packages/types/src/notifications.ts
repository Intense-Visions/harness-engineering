import { z } from 'zod';

/**
 * Notification sink kinds shipped in tree. Phase 3 ships `slack`; future
 * sinks add their literal here and a sibling adapter under
 * packages/orchestrator/src/notifications/.
 */
export const NotificationSinkKindSchema = z.enum(['slack']);
export type NotificationSinkKind = z.infer<typeof NotificationSinkKindSchema>;

/** Severity for envelope rendering. Sinks map this to platform iconography. */
export const NotificationSeveritySchema = z.enum(['info', 'success', 'warning', 'error']);
export type NotificationSeverity = z.infer<typeof NotificationSeveritySchema>;

/**
 * Single actionable link rendered next to the envelope body. Slack renders
 * these as button blocks; other sinks may render as inline links. URL must
 * be absolute so renderers do not have to know the dashboard host.
 */
export const NotificationActionSchema = z.object({
  label: z.string().min(1).max(40),
  url: z.string().url(),
});
export type NotificationAction = z.infer<typeof NotificationActionSchema>;

/**
 * Platform-agnostic envelope produced by `wrapAsEnvelope` when a sink has
 * `wrap_response: true`. Six fields max; growing the shape requires an ADR
 * amendment (proposal §"Anti-success Criteria"). Sinks render with their
 * own platform conventions but MUST honor `title` + `summary` + `severity`.
 */
export const NotificationEnvelopeSchema = z.object({
  title: z.string().min(1).max(280),
  summary: z.string(),
  severity: NotificationSeveritySchema,
  actions: z.array(NotificationActionSchema).max(5).optional(),
  permalink: z.string().url().optional(),
  correlationId: z.string().optional(),
});
export type NotificationEnvelope = z.infer<typeof NotificationEnvelopeSchema>;

/**
 * One sink entry in harness.config.json under `notifications.sinks[]`.
 * The `config` block is sink-specific (e.g., `{webhookUrlEnv}` for Slack);
 * its shape is validated by the adapter's registry factory at load time.
 */
export const NotificationSinkConfigSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'must be lowercase kebab-case'),
  kind: NotificationSinkKindSchema,
  events: z.array(z.string().min(1)).min(1),
  wrap_response: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type NotificationSinkConfig = z.infer<typeof NotificationSinkConfigSchema>;

/**
 * Top-level `notifications` section in harness.config.json. The whole
 * section is optional (no sinks = no fan-out); missing == empty.
 */
export const NotificationsConfigSchema = z.object({
  sinks: z.array(NotificationSinkConfigSchema).default([]),
});
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;

/**
 * Single delivery result. `ok: true` only on a 2xx response from the
 * destination. Sinks MUST NOT retry; retry is the operator's call via
 * webhook fanout (Phase 0 already handles durable retry).
 */
export const NotificationDeliveryResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    deliveredAt: z.number().int(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    httpStatus: z.number().int().optional(),
  }),
]);
export type NotificationDeliveryResult = z.infer<typeof NotificationDeliveryResultSchema>;
