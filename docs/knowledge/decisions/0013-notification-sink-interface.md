---
number: 0013
title: NotificationSink contract — in-process bus subscriber with platform-agnostic envelope
date: 2026-05-16
status: accepted
tier: medium
source: docs/changes/hermes-phase-3-notifications/proposal.md
---

## Context

Hermes Phase 3 ("Multi-Sink Notifications") generalizes the existing
GitHub-only `CINotifier` into an extensible abstraction that any in-tree
adapter (Slack, future Discord/email/Teams) can implement. The Phase 0
gateway already ships a webhook fanout (`wireWebhookFanout()` at
`packages/orchestrator/src/gateway/webhooks/events.ts:42`) that delivers raw
`GatewayEvent` JSON to operator-supplied HTTPS endpoints, but four gaps
remain:

1. No abstraction for "deliver to a configured destination" — every adopter
   wires their own bridge process.
2. Raw `GatewayEvent` is bridge-shaped, not chat-shaped. Bridges duplicate
   the work of turning `data` into a title, summary, severity, and call to
   action.
3. The webhook fanout transports bytes; it does not transform them. Mixing
   transport with rendering would leak chat concepts (Slack block kit,
   Discord embeds) into the gateway code path.
4. `CINotifier`'s return shape (`{externalId, url}` for issue creation) is
   tracker-specific and does not generalize.

Three architectural shapes were on the table:

- **A. Sinks as separate processes** subscribing to the Phase 0 webhook
  fanout. Adds an operational hop; defeats the "works out of the box" goal;
  duplicates HMAC verification + retry per bridge.
- **B. Sinks as in-process subscribers** to the orchestrator event bus,
  delivering directly to destinations. The same bus Phase 0 already feeds.
- **C. Sinks as special webhook subscriptions** with a `sinkKind`
  discriminator on `WebhookSubscription`. Leaks notification concepts into
  the gateway layer.

## Decision

We chose **option B — in-process bus subscribers with a platform-agnostic
envelope**.

Concrete commitments:

1. The contract lives in `packages/types/src/notifications.ts` and is the
   single shape every sink implements:

   ```ts
   interface NotificationSink {
     readonly id: string;
     readonly kind: string; // 'slack' for v1; extension point
     deliver(input: NotificationSinkDeliverInput): Promise<NotificationDeliveryResult>;
     dispose?(): Promise<void>;
   }
   ```

2. The dispatcher (`wireNotificationSinks` at
   `packages/orchestrator/src/notifications/events.ts:42`) subscribes to the
   same topic list the webhook fanout uses; one slow sink does not block a
   fast sink because each `deliver()` is started with `void` (not awaited
   in the listener path).
3. The envelope is a six-field shape — `title`, `summary`, `severity`,
   optional `actions[]`, `permalink?`, `correlationId?` — produced by
   `wrapAsEnvelope(event)` when a sink has `wrap_response: true`. Sinks
   render the envelope into their native shape (Slack block kit, etc.).
   Adding a seventh field requires an ADR amendment.
4. The first concrete sink is `SlackSink` (Slack incoming webhook URLs
   only, no OAuth, no bot tokens). The URL is supplied via env-var name in
   `harness.config.json`, never the literal URL.
5. Sinks **never** retry — `deliver()` is one shot. Operators who need
   durable delivery subscribe a bridge to the Phase 0 webhook fanout
   (which already has the durable retry / DLQ infrastructure).
6. Failed deliveries emit `notification.delivery.failed` on the bus so
   operators can observe via the dashboard or webhook fanout. The success
   counterpart is `notification.delivery.attempted`.

## Consequences

- **Out-of-the-box Slack works.** One env var + one config entry, no
  bridge process.
- **No change to existing contracts.** `GatewayEvent`, `WebhookSubscription`,
  and `CINotifier` are unchanged. The webhook fanout still ships raw events
  to HTTPS subscribers exactly as Phase 0 shipped.
- **Bounded envelope shape.** Six fields keep the rendering surface small.
  Sinks pay for the envelope only when `wrap_response: true`.
- **Two parallel fanout sets.** `wireWebhookFanout` and `wireNotificationSinks`
  both listen on the same topics. Some duplication is the price of keeping
  the transports cleanly separated. If the duplication grows past ~20 LOC
  the spec mandates a shared topic-subscriber helper.
- **No durable retry in v1.** A Slack outage longer than one HTTP timeout
  drops the message. Operators with strict durability requirements use the
  webhook fanout instead.
- **CINotifier keeps its tracker-shaped return type.** Refactoring it to
  implement `NotificationSink` is explicit non-goal of Phase 3 because the
  return shapes do not generalize.

## Alternatives rejected

- **Sinks as external webhook consumers (Option A).** Each sink becomes a
  separate process subscribing to a `POST /api/v1/webhooks` URL. Operationally
  heavier; the Slack incoming-webhook URL is the destination anyway, so a
  bridge would just be a passthrough.
- **Sinks as `WebhookSubscription` with a `sinkKind` discriminator
  (Option C).** Couples gateway transport to notification rendering;
  `WebhookDelivery` would gain a `switch(sinkKind)` branch that drags Slack
  block kit into the gateway layer.
- **Always wrap.** Reduces flexibility; some sinks want raw events. The
  `wrap_response` toggle keeps both behaviors first-class.
- **Always raw.** Defeats the chat-rendering goal that motivated K4.

## References

- Spec: `docs/changes/hermes-phase-3-notifications/proposal.md` §D1–D4
- Parent meta: `docs/changes/hermes-adoption/proposal.md` §K4 (parent rationale)
- Implementation: `packages/orchestrator/src/notifications/`
- Phase 0 webhook fanout pattern: `packages/orchestrator/src/gateway/webhooks/events.ts:42`
