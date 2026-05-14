import { z } from 'zod';

/**
 * Subscription record persisted to .harness/webhooks.json.
 *
 * `secret` is the per-subscription HMAC SHA-256 shared key. Storage-at-rest
 * model is plaintext-in-file (mode 0600); see plan section "Uncertainties"
 * for the decision rationale. Bridges receive the secret once at creation
 * and use it to verify X-Harness-Signature on every delivery.
 */
export const WebhookSubscriptionSchema = z.object({
  id: z.string().regex(/^whk_[a-f0-9]{16}$/),
  tokenId: z.string(), // owning auth token (audit / revocation chain)
  url: z.string().url().startsWith('https://'), // https-only at registration
  events: z.array(z.string().min(1)).min(1), // glob patterns: "maintenance.completed", "interaction.*"
  secret: z.string().min(32), // 32-byte base64url (44 chars)
  createdAt: z.string().datetime(),
});
export type WebhookSubscription = z.infer<typeof WebhookSubscriptionSchema>;

/** Public view: secret redacted for list responses. */
export const WebhookSubscriptionPublicSchema = WebhookSubscriptionSchema.omit({ secret: true });
export type WebhookSubscriptionPublic = z.infer<typeof WebhookSubscriptionPublicSchema>;

/**
 * Envelope for events fanned out on the webhook bus AND the SSE stream.
 * Each event has a stable `type` (e.g. "interaction.created"), a unique
 * `id` (used as X-Harness-Delivery-Id when delivered as a webhook), a
 * `timestamp`, and a `data` payload typed per event kind elsewhere.
 *
 * `correlationId` threads related events (a maintenance run + its
 * skill_invocation children share one). Phase 3 ships the envelope only;
 * per-kind data schemas land alongside the emitting modules.
 */
export const GatewayEventSchema = z.object({
  id: z.string().regex(/^evt_[a-f0-9]+$/),
  type: z.string().min(1),
  timestamp: z.string().datetime(),
  data: z.unknown(),
  correlationId: z.string().optional(),
});
export type GatewayEvent = z.infer<typeof GatewayEventSchema>;
