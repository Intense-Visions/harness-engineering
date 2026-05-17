---
type: business_process
domain: orchestrator
tags: [notifications, sinks, slack, envelope, wrap-response, event-bus, hermes-phase-3]
phase: hermes-phase-3
status: shipped
---

# Notification Sink Delivery

Hermes Phase 3 introduces an in-process **NotificationSink** abstraction on
top of the Phase 0 webhook fanout. Sinks are in-process subscribers to the
same orchestrator event bus that the webhook delivery worker listens on,
but instead of POSTing raw `GatewayEvent` JSON to operator-supplied HTTPS
endpoints, they deliver to chat-platform destinations (Slack-first) with
optional envelope wrapping. This document is the `business_process` node
for that pipeline — its invariants, its lifecycle, and the contracts that
allow follow-on sinks (Discord, email, Teams) to be added with no
gateway-layer changes.

## Lifecycle

1. **Boot.** The orchestrator constructs a `SinkRegistry` from the
   validated `notifications.sinks[]` section of `harness.config.json`
   (loaded via `loadNotificationsConfig` in core). A missing section means
   "no sinks; skip wiring." Any sink with an unresolvable env-var secret
   or unknown `kind` throws a `SinkConfigError`; the orchestrator logs
   and continues startup with sinks disabled (the doctor surfaces the
   misconfiguration on next run).
2. **Subscribe.** `wireNotificationSinks({bus, registry})` registers one
   listener per topic in the fixed `NOTIFICATION_TOPICS` set
   (`interaction.*`, `maintenance:*`). The listener set is structurally
   parallel to `wireWebhookFanout` so future telemetry / proposal-review
   topics can be enabled per fanout destination independently.
3. **Dispatch.** Each bus event constructs a `GatewayEvent` (id, type,
   timestamp, data), then iterates the registered sinks. Per sink:
   - If `event.type` does not match the sink's `events: string[]` glob
     filter (segment-glob, same matcher Phase 0 uses), skip.
   - If the sink has `wrap_response: true`, run `wrapAsEnvelope(event)`
     to produce a `NotificationEnvelope`; else pass the raw event.
   - Call `sink.adapter.deliver({payload, wrapped})` with `void` (no
     `await`) so a slow sink does not block a fast sink.
4. **Outcome.** The deliver promise's resolution emits a summary on the
   bus: `notification.delivery.attempted` on every attempt, plus
   `notification.delivery.failed` on any non-2xx or thrown error.
   Operators can observe these via dashboard SSE or a webhook
   subscription that filters for `notification.*`.
5. **Teardown.** Orchestrator `stop()` detaches the listeners first
   (`wireNotificationSinks` returns its unsubscribe function), then
   awaits `registry.dispose()` so each adapter can release transport
   resources. Already-in-flight deliveries resolve independently; their
   results no longer route to listeners.

## Invariants

- **No retry.** Sinks deliver exactly once. Operators who need at-least-once
  durable delivery subscribe a bridge to the Phase 0 webhook fanout
  (which has the durable queue / DLQ infrastructure).
- **Envelope is bounded.** Six fields max — `title`, `summary`,
  `severity`, optional `actions[]`, `permalink?`, `correlationId?`.
  Sinks render the envelope into their native shape (Slack block kit,
  etc.). Adding a seventh field requires an ADR amendment.
- **Slack is incoming-webhook only.** No OAuth, no bot tokens. The
  webhook URL is supplied via env-var name in config (`webhookUrlEnv`)
  so the URL never lands in the config file.
- **Secrets are env-resolved, not on disk.** Sink config carries the
  env-var **name**, not the value. Doctor's live-pings check surfaces
  missing or malformed env vars.
- **Two parallel fanouts.** `wireWebhookFanout` and
  `wireNotificationSinks` listen on overlapping but independently
  managed topic lists. A slow sink delivery never blocks a webhook
  delivery and vice versa.

## Configuration

```jsonc
{
  "notifications": {
    "sinks": [
      {
        "id": "team-alerts",
        "kind": "slack",
        "events": ["maintenance.error", "interaction.created"],
        "wrap_response": true,
        "config": { "webhookUrlEnv": "HARNESS_SLACK_WEBHOOK_URL" },
      },
    ],
  },
}
```

The matching env var (`HARNESS_SLACK_WEBHOOK_URL` here) must hold an
`https://hooks.slack.com/services/...` URL.

## CLI surface

- `harness notifications test <sink-id>` — synthesize a
  `notification.test` event and route it through the named sink. Used
  by operators after first-config and as the Phase 3 phase-readiness
  gate ("external test consumer exists").

## Related business concepts

- **NotificationSink** (interface) — `packages/types/src/notifications.ts`.
- **NotificationEnvelope** — six-field platform-agnostic shape produced
  by `wrapAsEnvelope`.
- **SlackSink** — first concrete adapter; uses Slack incoming-webhook
  URLs only.
- **wrap_response** — per-sink boolean toggle. When true, deliver an
  envelope. When false, deliver the raw `GatewayEvent`.
- **notification.delivery.attempted / notification.delivery.failed** —
  observability events emitted on the bus by the dispatcher.

## Relationships

- `Event Bus` _fans out to_ `Notification Sink`
- `Notification Sink` _delivers_ `Notification Envelope`
- `Notification Sink` _subscribes to_ `Event Bus`
- `Slack Incoming Webhook` _is-a_ `Notification Sink`
- `Sink Config` _references_ `Env Var Secret`
- `Webhook Fanout` _and_ `Notification Dispatcher` _both subscribe to_ `Event Bus` (parallel listener sets)

## Rules

- Every sink only receives events whose type matches at least one of its
  `events[]` glob patterns.
- A sink with an unresolvable env-var secret is rejected at
  registry-build time (`SinkConfigError`); the orchestrator logs and
  continues with sinks disabled.
- Sink delivery never blocks the bus listener; `deliver()` is `void`-fired.
- Sink delivery never retries; failed deliveries emit
  `notification.delivery.failed` for operator visibility only.
- Slack webhook URLs must match `https://hooks.slack.com/` at config
  load time — other URLs are rejected with a clear error.

## References

- ADR: `docs/knowledge/decisions/0013-notification-sink-interface.md`
- Spec: `docs/changes/hermes-phase-3-notifications/proposal.md`
- Implementation: `packages/orchestrator/src/notifications/`
- Types: `packages/types/src/notifications.ts`
- Core loader: `packages/core/src/notifications/config-loader.ts`
- CLI: `packages/cli/src/commands/notifications/test.ts`
