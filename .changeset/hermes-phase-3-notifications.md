---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/orchestrator': minor
'@harness-engineering/cli': minor
---

Hermes Phase 3: Multi-sink notifications + doctor hardening

Generalizes `CINotifier` into a `NotificationSink` interface, ships Slack
(incoming-webhook) as the first concrete in-tree adapter, adds a
`wrap_response` envelope formatter for platform-shape delivery, and extends
`harness doctor` with four content-aware checks (hook syntax, baseline
freshness, session-taint corruption, live pings).

**New surfaces:**

- `NotificationSink` interface + `eventTypeMatches` glob matcher
  (`@harness-engineering/core`).
- `wrapResponse(event)` envelope formatter with per-event-type handlers
  (`@harness-engineering/core`).
- `SlackSink` and `CIGithubSink` adapters
  (`@harness-engineering/core`).
- `SinkRegistry` + `wireNotificationSinks` orchestrator wiring
  (`@harness-engineering/orchestrator`).
- New config block on `WorkflowConfig.notifications` with Zod schemas
  exposed from `@harness-engineering/types`.
- `harness notifications test` CLI subcommand
  (`@harness-engineering/cli`).
- `harness doctor` gains hook-syntax, baseline-freshness, session-taint,
  and `--live` ping checks.

**Backwards compatible:** existing `harness.config.json` files validate
unchanged; orchestrator boot constructs the registry only when
`notifications.sinks` is non-empty.

See `docs/changes/hermes-phase-3-notifications/proposal.md` for the
full design.
