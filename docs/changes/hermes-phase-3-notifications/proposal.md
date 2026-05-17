# Hermes Phase 3: Multi-Sink Notifications + Doctor Hardening

**Parent meta-spec:** [docs/changes/hermes-adoption/proposal.md](../hermes-adoption/proposal.md)
**Roadmap item:** `github:Intense-Visions/harness-engineering#313`
**Keywords:** notification-sink, slack-sink, envelope, wrap-response, ci-notifier, doctor-hardening, live-pings, session-corruption, baseline-freshness

## Overview

Phase 3 of the Hermes Adoption program. Generalizes the GitHub-only `CINotifier` into a `NotificationSink` interface with a Slack-first concrete adapter, introduces a platform-shape `wrap_response` envelope so orchestrator events render as chat-style messages on delivery, and hardens `harness doctor` with live pings, hook validity, baseline freshness, and session corruption checks.

The parent meta-spec ([Hermes Adoption: 6-Phase Decomposition](../hermes-adoption/proposal.md)) decomposed adoption into six phases. Phase 3 bundles **K4** (multi-sink notifications + envelope, from F8+N2) with **A7** (harden doctor) because both ship a similar effort profile (~2–3 weeks) and both are independent of Phases 1, 2, and 4. Phase 3 sits squarely on top of Phase 0's webhook fanout: sinks consume the same `GatewayEvent` envelope that the webhook delivery worker already fans out, applying sink-specific formatting before pushing to the destination (Slack incoming webhook for v1; other sinks remain external bridges or watch-list).

### Problem

Three frictions exist today, even after Phase 0 shipped:

1. **Notification surface is GitHub-only.** `CINotifier` (`packages/core/src/ci/notifier.ts`) talks to a `TrackerSyncAdapter` and posts CI check reports as PR comments or new issues. There is no abstraction that says "an event happened; deliver it to a configured destination." A user who wants the same CI failure to ping their Slack channel either polls GitHub or builds a third-party webhook consumer themselves — even though Phase 0 already delivers the raw events via webhook fanout.
2. **Events are not platform-shaped.** The webhook delivery payload (`packages/orchestrator/src/gateway/webhooks/delivery.ts`) is a `GatewayEvent` JSON envelope: `{id, type, timestamp, data, correlationId?}`. It is the right shape for a bridge to consume, but it is not the right shape for a human reading a Slack channel. Each bridge has to re-derive a short title, an icon, a permalink back to the dashboard, and a structured "attachments" block from `data`. Doing this in every bridge is duplicative and gates the adoption velocity of K4 (parent meta §61).
3. **`harness doctor` is presence-only.** The current doctor (`packages/cli/src/commands/doctor.ts`) checks Node version, slash-command file counts, MCP server config presence, and integration registry entries. It does **not** ping the orchestrator, validate hook scripts execute, surface stale architecture baselines, or detect a corrupted session archive. After Phase 0–2 introduced live runtime state (tokens, webhooks, telemetry, sessions, baselines), the doctor's "all-green" report can be misleading: every file exists and yet the orchestrator might be unreachable, hooks might be syntactically broken, baselines might be six months old, or a session archive might fail to load.

Phase 3 resolves these by promoting `CINotifier` from concrete-PR-poster to first concrete adapter behind a `NotificationSink` interface, adding a `SlackSink` that consumes the same `GatewayEvent` envelope via the Phase 0 webhook bus, introducing an opt-in `wrap_response` envelope option that wraps the raw event into a platform-shape suitable for chat rendering, and extending the doctor's `checks` array with four new live-state checks.

### Goals

1. **One sink abstraction.** `NotificationSink.deliver(envelope, target, options)` is the single contract; CI/PR posting is one adapter, Slack is the second, and additional sinks (Discord, email, GitHub Issues) become community contributions or watch-list items per W5 (parent meta §F2/F5).
2. **Slack works end-to-end out of the box.** Operator configures one incoming-webhook URL in `harness.config.json`, picks event-type filters, and notifications arrive with median latency < 30s. No bridge process to run, no OAuth flow.
3. **`wrap_response` is opt-in and platform-agnostic.** A single envelope shape (`title`, `summary`, `severity`, `actions[]`, `correlationId?`, `permalink?`) — sinks render it. Bridges keep getting raw `GatewayEvent` when they don't ask for wrapping.
4. **Doctor detects real failure modes, not just missing files.** Four new check categories — live pings (orchestrator reachable + token valid), hook validity (every configured hook is executable and lints clean), baseline freshness (architecture + benchmark baselines aren't stale beyond a configured TTL), session-archive corruption (FTS5 index opens + sample row reads succeed, Phase 1 dependency).
5. **No regression of Phase 0 contracts.** Sinks consume the Phase 0 webhook bus (or, for in-process delivery, the same event-bus topic stream). Adding a sink does not change `GatewayEvent` shape, `WebhookSubscription` schema, or scope vocabulary.

### Non-goals

- **OAuth flows for Slack.** Phase 3 ships incoming-webhook-only configuration. Slack OAuth + bot tokens are deferred to a follow-up phase; the abstraction allows it but the v1 adapter does not implement it.
- **Discord / email / Telegram sinks.** Watch-list per parent meta W5; promotion requires community contribution after K4 lands.
- **In-process delivery from arbitrary call sites.** Sinks always consume the event bus (or webhook fanout for cross-process bridges). Direct in-process `notify()` from CI commands stays the responsibility of `CINotifier`'s adapter for the duration of Phase 3; an internal "event-emit then sink-deliver" refactor of `CINotifier` is out of scope.
- **Notification persistence / archive / read-state.** Sinks deliver and forget. A "notification inbox" UI is parent meta watch-item territory.
- **Doctor's `fix` command auto-execution.** Doctor reports `fix:` hints (existing pattern); applying them is still the operator's call. No new auto-fix path.
- **Doctor live pings to external services other than the orchestrator and integration env-vars already covered.** Network-egress probes (Slack reachability, OTLP reachability) are deferred — the doctor would otherwise mask real outages with its own retry/cache logic, and a stale "Slack OK" is worse than no check.
- **Re-implementing GitHub PR posting via the new sink abstraction.** `CINotifier` continues to use the `TrackerSyncAdapter` for the GitHub case (a tracker integration, not a "send a notification" use case). The `NotificationSink` interface is for fire-and-forget delivery to chat-shaped destinations; `CINotifier` keeps its tracker-shaped behavior. The parent meta-spec's framing ("Generalize CINotifier → NotificationSink") is honored by the interface and a sibling Slack adapter; CINotifier itself is **not** refactored to implement `NotificationSink` because its return shape (`{externalId, url}` for issue creation) is tracker-specific and does not generalize.

### Scope

**In-scope:**

- `NotificationSink` interface (`packages/orchestrator/src/notifications/sink.ts`)
- `SlackSink` concrete adapter (incoming-webhook only)
- `NotificationEnvelope` schema (`packages/types/src/notifications.ts`)
- Event-bus → sink wiring (subscribes to same topics as webhook fanout)
- `wrap_response` envelope option on subscription registration (boolean field on `WebhookSubscription`-like adjacent `NotificationSinkConfig`)
- `harness.config.json` `notifications` section: `sinks: NotificationSinkConfig[]`
- Doctor hardening: 4 new check categories
- CLI command: `harness notifications test <sink-id>` (one-shot delivery probe)
- AGENTS.md, CHANGELOG, knowledge artifacts, ADR

**Out-of-scope:**

- OAuth-based sink authentication
- Sinks other than Slack
- Notification archive / read-state / dashboard inbox
- Doctor auto-fix path
- Refactoring `CINotifier` to implement `NotificationSink`
- New dashboard UI page (the existing `Maintenance` and `Sessions` pages stay; a "Notifications" page is parent meta deferred)

### Assumptions

- **Phase 0 webhook fanout is live.** The `wireWebhookFanout()` function in `packages/orchestrator/src/gateway/webhooks/events.ts` is the integration point; sinks subscribe alongside the webhook delivery worker.
- **Slack incoming webhook URL is operator-supplied** via `harness.config.json` or `HARNESS_SLACK_WEBHOOK_URL` env var. The URL is not stored hashed because Slack incoming webhooks are unauthenticated by design — anyone with the URL can post — so leakage matters only for blast-radius, not credential theft. Phase 3 enforces file mode 0600 on `harness.config.json` as a soft mitigation (existing `chmod`-after-write pattern from `WebhookStore`).
- **Doctor extensions reuse existing patterns.** New checks return the same `CheckResult` shape (`name`, `status`, `message`, `fix?`).
- **Sink delivery is best-effort.** No persistence, no retry beyond the underlying HTTP client's default. Reliability is webhook fanout's job (Phase 0's `WebhookQueue` already has retry + DLQ); the Slack sink is a thin HTTP poster that runs in-process. Failures log + emit a `notification.delivery.failed` event for operator visibility but do not retry.

---

## Decisions Made

Six decisions surfaced during brainstorming. Each names the alternatives considered and the reason for the choice.

### D1 — Sink interface = in-process subscriber to the event bus, not a webhook consumer

`NotificationSink` is **in-process**: it registers a callback on the orchestrator's event bus (the same `bus` instance `wireWebhookFanout` subscribes to) and delivers directly to the destination (e.g., Slack incoming-webhook POST). It does **not** consume the webhook fanout's HTTP delivery stream.

**Alternatives rejected:**

- _Sinks as external webhook consumers_: every sink runs as a separate process subscribing to a registered webhook URL. Simpler in principle but adds an operational hop (run a Slack bridge), defeats the "out of the box" goal, and duplicates HMAC verification + retry across every bridge for the v1 Slack case where the destination is itself an HTTPS endpoint.
- _Both modes simultaneously_: in-process for Slack, external-bridge for everything else. Defers the choice but doubles the surface area. Phase 3 picks one mode for the first sink and lets the bridge pattern handle external-process cases naturally (a custom bridge subscribes to the Phase 0 webhook fanout exactly as today).

**Evidence:** `packages/orchestrator/src/gateway/webhooks/events.ts:42` — `wireWebhookFanout({bus, store, delivery})` already accepts a `bus: EventEmitter`. A parallel `wireNotificationSinks({bus, sinks})` reuses the same topic stream without coupling sink delivery to webhook persistence.

### D2 — Envelope shape = minimal platform-agnostic with `title`, `summary`, `severity`, `actions[]`, `permalink?`, `correlationId?`

The `NotificationEnvelope` is a flat object:

```typescript
{
  title: string;            // 1-line, < 140 chars after platform-specific truncation
  summary: string;          // multi-line markdown, sink decides rendering
  severity: 'info' | 'success' | 'warning' | 'error';
  actions?: Array<{ label: string; url: string }>;
  permalink?: string;       // back to dashboard/orchestrator UI for the event
  correlationId?: string;   // mirrors GatewayEvent.correlationId
  raw?: GatewayEvent;       // optional carry-through for sinks that want it
}
```

`wrap_response` on a `NotificationSinkConfig` means: when fanning out an event to this sink, run it through `wrapAsEnvelope(event)` before `sink.deliver()`. Without `wrap_response: true`, the sink receives the raw `GatewayEvent` and decides for itself.

**Alternatives rejected:**

- _Slack-Block-Kit-shaped envelope_: locks the format to Slack. Forces every other sink to reverse-translate.
- _Full email-shaped envelope (`from`, `to`, `cc`, `attachments[]`)_: bloats the shape; most fields are non-applicable for chat sinks.
- _No envelope (sinks rebuild from `data` themselves)_: defeats the parent meta-spec's K4 commitment that bridges shouldn't each rebuild platform shape.

The five-field envelope matches Hermes's `wrap_response` pattern (`agents/Atlas-Hermes/skills/...`) — title + body + level + actions — and is the minimum a Slack message, a Discord embed, a GitHub issue body, and an email subject+body can all be rendered from.

**Evidence:** parent meta §61 K4 "envelope option for delivery formatting"; `packages/orchestrator/src/gateway/webhooks/delivery.ts:147` (no current transformation between event and HTTP body — the gap this fills).

### D3 — Slack sink = incoming-webhook only, no bot token / OAuth

Phase 3 ships exactly one Slack auth model: an incoming webhook URL (`https://hooks.slack.com/services/...`) per sink configuration. No OAuth flow, no bot token, no per-channel routing inside one sink — one sink = one channel.

**Alternatives rejected:**

- _Bot token + OAuth_: realistic for a multi-workspace SaaS; overkill for a coding-agent harness where each operator picks one workspace.
- _xoxb token from env_: identical operational profile to a webhook URL but with extra surface (the token can post to any channel and read history). Webhook URL is least-privileged.
- _Slack's "Workflow Builder" webhooks_: identical wire format; works automatically with the same adapter. No code change needed.

**Evidence:** Slack incoming-webhook docs (https://api.slack.com/messaging/webhooks) — the smallest supported posting mode; rate limit is 1 message/sec per webhook, sufficient for the parent meta's success criterion ("notifications delivered with median latency < 30s").

### D4 — Sink config in `harness.config.json` `notifications.sinks[]` — not a separate file

```jsonc
{
  "notifications": {
    "sinks": [
      {
        "id": "team-slack",
        "kind": "slack",
        "events": ["maintenance.*", "interaction.created"],
        "wrap_response": true,
        "config": {
          "webhookUrlEnv": "HARNESS_SLACK_WEBHOOK_URL",
        },
      },
    ],
  },
}
```

`webhookUrlEnv` (an env-var name) is the persisted secret-shape, not the URL itself. The orchestrator reads the env var at startup; a missing env var fails the sink load with a doctor-visible error rather than a silent skip.

**Alternatives rejected:**

- _Separate `.harness/notifications.json` file (mirroring `tokens.json`/`webhooks.json`)_: more storage surface for no gain. Sinks don't have per-record secrets (the secret is the URL, env-supplied).
- _Inline URL in `harness.config.json`_: surface a webhook URL to git. Operators who don't read SECURITY.md regularly will commit it.

**Evidence:** existing pattern — `harness.config.json` `graph.connectors.ci.apiKeyEnv` (line 295) already stores integration secrets as env-var names, not values.

### D5 — Doctor's four new checks = orchestrator ping, hook validity, baseline freshness, session-archive integrity (in that order)

Each check is independent and returns a `CheckResult`. None depend on each other. They run unconditionally when present (e.g., `baseline freshness` only runs if `.harness/arch/baselines.json` exists; `session-archive integrity` only runs if `.harness/sessions/` exists — Phase 1 dependency, gracefully degrades).

| Check                | Probe                                                                                                         | Pass condition                               | Fail hint                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| `orchestrator-ping`  | `GET /api/v1/state` with the admin token if any, otherwise unauth-dev fallback (existing `localhost:7424`)    | 200 OK within 2s                             | Run `harness orchestrator start`        |
| `hooks-validity`     | For each entry in `.harness/hooks/*`: `node --check` for JS, `bash -n` for sh, presence check for executables | All hooks parse                              | Edit `.harness/hooks/<name>`            |
| `baseline-freshness` | Compare `mtime` of `.harness/arch/baselines.json` and `benchmark-baselines.json` against TTL (default 30d)    | mtime within TTL                             | Run `harness check-arch --update`       |
| `sessions-integrity` | If `.harness/sessions/` exists: list files, attempt to parse the most recent N (default 3) summary JSONs      | All parse to a schema-valid `SessionSummary` | Run `harness cleanup-sessions --repair` |

**Alternatives rejected:**

- _Network egress probe to Slack / OTLP_: defeats the "doctor doesn't lie" goal. A cached "OK" hides real outages; a strict "fail" annoys offline development.
- _Hook script execution_ (not just parse): too slow + risk of side effects.
- _Baseline staleness threshold inferred from churn_: nice idea but Phase 5's territory.

**Evidence:** parent meta §76 A7 "live pings (API keys, model availability), hook validity, baseline freshness, session corruption check".

### D6 — `harness notifications test <sink-id>` is the operator's one-shot probe

A CLI command that sends a synthetic envelope through the named sink. Used by the operator after first-config and after env-var changes; also used by the integration test suite as the "external test consumer exists" gate (parent meta Level-3 phase-readiness gate row).

**Alternatives rejected:**

- _Auto-test on orchestrator startup_: wakes Slack on every harness restart; rate-limit-hostile and operator-hostile.
- _Doctor includes a delivery-probe check_: violates D5's "no network egress probes."

The command synthesizes a `GatewayEvent` with `type: 'notification.test'`, wraps it (if the sink has `wrap_response: true`), and calls `sink.deliver()` once. Exits 0 on delivery, non-zero on transport failure.

**Evidence:** parent meta §611 phase-readiness gate "External test consumer exists" — `harness notifications test` is that gate's mechanical evidence.

---

## Technical Design

### Layered architecture

The work touches four layers, in this dependency order:

1. **types** (`packages/types/src/notifications.ts`) — new Zod schemas for `NotificationEnvelopeSchema`, `NotificationSinkConfigSchema`, `NotificationDeliveryResultSchema`, `NotificationSinkKindSchema`. Exported from `packages/types/src/index.ts`.
2. **orchestrator** (`packages/orchestrator/src/notifications/`) — `sink.ts` (interface), `slack-sink.ts` (concrete adapter), `envelope.ts` (`wrapAsEnvelope`), `registry.ts` (sink lookup by id + lifecycle), `events.ts` (`wireNotificationSinks({bus, registry, configs})`). Sinks live alongside `gateway/webhooks/` because they consume the same `bus`.
3. **core** (`packages/core/src/config/notifications.ts`) — schema validator for the `notifications.sinks[]` section of `harness.config.json`. Surfaces a clean error message when a config refers to an unknown sink `kind`.
4. **cli** (`packages/cli/src/commands/notifications/test.ts`, doctor extensions in `packages/cli/src/commands/doctor.ts`) — the new `notifications test` command and four new doctor check functions.

```
types/notifications.ts
  ↓
orchestrator/notifications/{sink, envelope, slack-sink, registry, events}
  ↓
core/config/notifications  ←  schema validation only, no runtime imports orchestrator
  ↓
cli/commands/notifications/test, cli/commands/doctor
```

The `core` package validates the schema for the same reason it validates the rest of `harness.config.json` (one entry point for config-shape errors). Sink runtime construction stays in `orchestrator`.

### File layout

```
packages/types/src/
  notifications.ts                              # NEW — schemas + types
  index.ts                                      # MODIFIED — re-export

packages/orchestrator/src/notifications/        # NEW directory
  sink.ts                                       # NotificationSink interface
  envelope.ts                                   # wrapAsEnvelope, defaults, severity-from-event
  slack-sink.ts                                 # SlackSink (incoming webhook)
  registry.ts                                   # SinkRegistry: lookup, lifecycle
  events.ts                                     # wireNotificationSinks: bus → registry → deliver
  index.ts                                      # public surface

packages/core/src/config/
  notifications.ts                              # NEW — validator (schema check, env-var resolution dry-run)

packages/cli/src/commands/notifications/        # NEW directory
  test.ts                                       # `harness notifications test <sink-id>`
  index.ts                                      # subcommand registration

packages/cli/src/commands/
  doctor.ts                                     # MODIFIED — 4 new check functions
  _registry.ts                                  # MODIFIED — register `notifications` subcommand

packages/orchestrator/src/orchestrator.ts       # MODIFIED — wire sinks on start, dispose on stop

packages/orchestrator/src/index.ts              # MODIFIED — export public sink surface
```

### `NotificationSink` interface

```typescript
// packages/orchestrator/src/notifications/sink.ts
import type { GatewayEvent, NotificationEnvelope } from '@harness-engineering/types';

export interface NotificationSinkDeliverInput {
  /** Either the raw GatewayEvent or a wrapped envelope, depending on config. */
  payload: GatewayEvent | NotificationEnvelope;
  /** True iff payload is a NotificationEnvelope (wrap_response = true). */
  wrapped: boolean;
}

export interface NotificationSink {
  /** Stable id used in config + CLI; lowercase, kebab-case. */
  readonly id: string;
  /** Sink kind: 'slack', 'github-issue', etc. */
  readonly kind: string;
  /**
   * One-shot delivery. Best-effort; returns Ok on 2xx, Err otherwise.
   * Sinks MUST NOT retry; retry is the operator's call via webhook fanout
   * (Phase 0 already handles durable retry for the webhook-bridge mode).
   */
  deliver(input: NotificationSinkDeliverInput): Promise<NotificationDeliveryResult>;
  /** Lifecycle hook called on orchestrator stop. */
  dispose?(): Promise<void>;
}

export type NotificationDeliveryResult =
  | { ok: true; deliveredAt: number }
  | { ok: false; error: string; httpStatus?: number };
```

### `SlackSink` concrete adapter

```typescript
// packages/orchestrator/src/notifications/slack-sink.ts
import type { NotificationSink, NotificationSinkDeliverInput } from './sink';
import type { GatewayEvent, NotificationEnvelope } from '@harness-engineering/types';

export interface SlackSinkOptions {
  id: string;
  webhookUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class SlackSink implements NotificationSink {
  readonly kind = 'slack';
  readonly id: string;
  private readonly webhookUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: SlackSinkOptions) {
    this.id = opts.id;
    this.webhookUrl = opts.webhookUrl;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 5_000;
  }

  async deliver(input: NotificationSinkDeliverInput): Promise<NotificationDeliveryResult> {
    const body = input.wrapped
      ? renderEnvelopeAsSlackPayload(input.payload as NotificationEnvelope)
      : renderRawEventAsSlackPayload(input.payload as GatewayEvent);
    // POST to webhook URL with AbortController timeout.
    // Slack incoming-webhook returns 'ok' (text/plain) on success.
    // ...
  }
}
```

### Envelope wrapping (`wrapAsEnvelope`)

`wrapAsEnvelope(event: GatewayEvent): NotificationEnvelope` is the only place that knows how to derive `title`, `summary`, `severity`, `actions`, `permalink` from an event-type. The function uses a small dispatcher keyed by `event.type`:

```typescript
const ENVELOPE_DERIVERS: Record<string, (e: GatewayEvent) => Partial<NotificationEnvelope>> = {
  'maintenance.started': (e) => ({
    title: `🛠 Maintenance started: ${(e.data as MaintenanceData).taskId}`,
    severity: 'info',
  }),
  'maintenance.completed': (e) => ({
    title: `✓ Maintenance done: ${(e.data as MaintenanceData).taskId}`,
    severity: 'success',
    actions: [{ label: 'View output', url: dashboardUrlFor(e) }],
  }),
  'maintenance.error': (e) => ({
    title: `✗ Maintenance failed: ${(e.data as MaintenanceData).taskId}`,
    severity: 'error',
    summary: (e.data as MaintenanceData).error ?? 'No error message',
  }),
  'interaction.created': (e) => ({
    title: `❓ Action required: ${(e.data as InteractionData).question}`,
    severity: 'warning',
    actions: [{ label: 'Resolve', url: dashboardUrlFor(e) }],
  }),
  // ... per-event derivers; fallback returns generic title from event.type
};
```

The fallback case is: `title: event.type, summary: JSON.stringify(event.data, null, 2)`. New event-types added in future phases get a one-line deriver registration here; no envelope-shape change.

### Doctor hardening (the four new checks)

Each new check function follows the existing `function checkX(): CheckResult | CheckResult[]` pattern in `doctor.ts`:

```typescript
async function checkOrchestratorPing(cwd: string): Promise<CheckResult> {
  // Read .harness/tokens.json admin token if present; else unauth-dev.
  // GET http://localhost:<port>/api/v1/state with AbortController timeout 2s.
  // Returns pass / fail with port + fix hint.
}

function checkHooksValidity(cwd: string): CheckResult[] {
  // ls .harness/hooks/*
  // for each: shebang detect + node --check OR bash -n OR executable bit
  // Return one CheckResult per hook (so failures are individually addressable).
}

function checkBaselineFreshness(cwd: string): CheckResult[] {
  // For each of: .harness/arch/baselines.json, benchmark-baselines.json (cwd root)
  //   if exists: mtime > now - TTL → pass, else warn (not fail).
  //   if missing: info (baselines optional in some projects).
}

function checkSessionsIntegrity(cwd: string): CheckResult {
  // Locate .harness/sessions/
  // If absent: info (Phase 1 not present).
  // Else: read newest N=3 session-summary.json, validate against SessionSummary schema.
  //   Return aggregated pass/warn/fail.
}
```

`runDoctor()` becomes async (the `orchestrator-ping` check is async); existing JSON-output mode passes through. Tests in `packages/cli/tests/commands/doctor.test.ts` get four new cases each.

### Event-bus wiring

```typescript
// packages/orchestrator/src/notifications/events.ts
import type { EventEmitter } from 'node:events';
import type { GatewayEvent } from '@harness-engineering/types';
import { eventMatches } from '../gateway/webhooks/signer';
import type { SinkRegistry } from './registry';
import { wrapAsEnvelope } from './envelope';

const NOTIFICATION_TOPICS = [
  'interaction.created',
  'interaction.resolved',
  'maintenance:started',
  'maintenance:completed',
  'maintenance:error',
] as const;

export function wireNotificationSinks({
  bus,
  registry,
}: {
  bus: EventEmitter;
  registry: SinkRegistry;
}): () => void {
  const handlers: Array<{ topic: string; fn: (data: unknown) => void }> = [];
  for (const topic of NOTIFICATION_TOPICS) {
    const eventType = topic.replace(':', '.');
    const fn = (data: unknown): void => {
      const event: GatewayEvent = {
        id: `evt_${randomBytes(8).toString('hex')}`,
        type: eventType,
        timestamp: new Date().toISOString(),
        data,
      };
      for (const sink of registry.list()) {
        if (!sink.config.events.some((p) => eventMatches(p, eventType))) continue;
        const payload = sink.config.wrap_response ? wrapAsEnvelope(event) : event;
        void sink.adapter.deliver({ payload, wrapped: !!sink.config.wrap_response }).catch((err) =>
          bus.emit('notification.delivery.failed', {
            sinkId: sink.adapter.id,
            error: String(err),
          })
        );
      }
    };
    bus.on(topic, fn);
    handlers.push({ topic, fn });
  }
  return () => {
    for (const { topic, fn } of handlers) bus.removeListener(topic, fn);
  };
}
```

The wiring is structurally identical to `wireWebhookFanout` (`packages/orchestrator/src/gateway/webhooks/events.ts:42-68`) — same topic list, same colon→dot normalization, same fire-and-forget semantics. Sinks and webhook deliveries fan out from the same bus event independently; one slow sink does not block webhook delivery and vice versa.

### Orchestrator lifecycle integration

```typescript
// packages/orchestrator/src/orchestrator.ts (excerpt)
import { loadNotificationsConfig } from '@harness-engineering/core/config/notifications';
import { SinkRegistry } from './notifications/registry';
import { wireNotificationSinks } from './notifications/events';
import { SlackSink } from './notifications/slack-sink';

class Orchestrator {
  private notificationsRegistry: SinkRegistry | null = null;
  private unwireNotifications: (() => void) | null = null;

  async start(): Promise<void> {
    // ... existing ...
    const notifConfig = loadNotificationsConfig(this.configPath);
    if (notifConfig.sinks.length > 0) {
      this.notificationsRegistry = SinkRegistry.fromConfig(notifConfig, { env: process.env });
      this.unwireNotifications = wireNotificationSinks({
        bus: this.eventBus,
        registry: this.notificationsRegistry,
      });
    }
  }

  async stop(): Promise<void> {
    this.unwireNotifications?.();
    await this.notificationsRegistry?.dispose();
    // ... existing ...
  }
}
```

### Tests

Per-layer test files:

- `packages/types/tests/notifications.test.ts` — schema parse + reject cases
- `packages/orchestrator/tests/notifications/sink.test.ts` — registry, lifecycle
- `packages/orchestrator/tests/notifications/envelope.test.ts` — wrapAsEnvelope per-event-type cases + fallback
- `packages/orchestrator/tests/notifications/slack-sink.test.ts` — happy path, timeout, non-2xx, rate-limit 429 (no retry, just Err)
- `packages/orchestrator/tests/notifications/events.test.ts` — bus subscribe, filter-by-events, multi-sink fan-out, slow-sink does not block
- `packages/orchestrator/tests/notifications-integration.test.ts` — full orchestrator start + emit `maintenance.completed` + assert delivery via mock fetch
- `packages/core/tests/config/notifications.test.ts` — validator: unknown kind, missing env var, malformed events glob
- `packages/cli/tests/commands/notifications/test.test.ts` — CLI `notifications test`
- `packages/cli/tests/commands/doctor.test.ts` — extended with the four new checks

The integration test uses the existing mock-fetch pattern from `webhooks-integration.test.ts` so the orchestrator never actually POSTs to Slack.

---

## Integration Points

### Entry Points

**New CLI command:**

- `harness notifications test <sink-id>` — synthesizes a `notification.test` event and routes it through the named sink. Returns 0 on 2xx delivery, non-zero otherwise.

**New MCP tools:** None. Sinks are operator-configured infrastructure; agents do not interact with them directly. (If a follow-up phase introduces `notify_operator` as an agent-callable tool, that gets its own brainstorming.)

**No new API routes.** Sinks are in-process subscribers; configuration is filesystem-backed (`harness.config.json`). Exposing sink CRUD via `/api/v1/notifications/...` would duplicate the Phase 0 webhook surface — operators who want HTTP-CRUD-able sinks can use Phase 0 webhooks instead. (Watch-item: revisit if multi-operator sink management becomes a real ask.)

**Event bus topics (subscribed by sinks):**

- `interaction.created`, `interaction.resolved`
- `maintenance:started`, `maintenance:completed`, `maintenance:error` (normalized to `maintenance.*`)
- Future Phase 4 / Phase 5 topics auto-flow once registered in `NOTIFICATION_TOPICS`.

**New event bus topics (emitted by sinks):**

- `notification.delivery.attempted` — every sink call, includes sinkId + outcome
- `notification.delivery.failed` — error path, includes sinkId + error string
  (These are NOT auto-fanned-out via `wireWebhookFanout` to avoid recursion; they remain internal observability.)

### Registrations Required

| Registry                                                    | Update                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/types/src/index.ts`                               | Re-export `NotificationEnvelopeSchema`, `NotificationSinkConfigSchema`, ... and types              |
| `packages/orchestrator/src/index.ts`                        | Re-export `SinkRegistry`, `SlackSink`, `wrapAsEnvelope` for test consumers                         |
| `packages/cli/src/commands/_registry.ts`                    | Register `notifications` subcommand group + nested `test`                                          |
| `packages/cli/src/commands/doctor.ts` `runDoctor()`         | Append 4 new check function invocations                                                            |
| `harness.config.json` JSON schema                           | New `notifications.sinks[]` array section validated by `packages/core/src/config/notifications.ts` |
| AGENTS.md                                                   | New section under "CLI Commands" describing `notifications test` and doctor extensions             |
| CHANGELOG.md                                                | New entry under unreleased                                                                         |
| Plugin manifests (`harness-claude`, `harness-cursor`, etc.) | `harness generate-slash-commands` regenerates after Phase 3 lands                                  |

### Documentation Updates

**Knowledge artifacts (created by integration phase, not by this spec):**

- `docs/knowledge/orchestrator/notification-sinks.md` — `business_process`: notification sink delivery; `business_concept`: notification envelope, sink configuration, wrap_response
- `docs/knowledge/cli/doctor-hardening.md` — `business_process`: doctor live-state checks; `business_rule`: baseline freshness TTL, hook validity gates

**Spec / ADR:**

- This proposal: `docs/changes/hermes-phase-3-notifications/proposal.md`
- Plan: `docs/changes/hermes-phase-3-notifications/plans/main.md`
- ADR `0013-notification-sink-interface.md` — pillars: sink-as-bus-subscriber (D1), envelope shape (D2), Slack-incoming-webhook-first (D3), config in `harness.config.json` (D4)
- ADR `0014-doctor-live-state-checks.md` — pillars: four new check categories (D5), no network egress probes outside orchestrator localhost (D5 rationale)

**README / AGENTS:**

- `README.md` Key Features bullet: "Notifications to Slack and other sinks via configurable adapters"
- `AGENTS.md` § Commands: `notifications test`; § Doctor: new check names with one-line descriptions

### Architectural Decisions

Two ADRs land with this phase:

| ADR                                   | One-line rationale                                                                                                                                                                                 | Status when phase lands |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `0013-notification-sink-interface.md` | In-process sinks subscribe to the orchestrator event bus; envelope is platform-agnostic; Slack adapter uses incoming-webhook URLs; sink config lives in `harness.config.json` with env-var secrets | accepted                |
| `0014-doctor-live-state-checks.md`    | Doctor adds orchestrator-ping, hook-validity, baseline-freshness, sessions-integrity — no external network egress probes (Slack/OTLP) to avoid lying-by-cache when those services are down         | accepted                |

### Knowledge Impact

**New `business_process` nodes:**

- Notification sink delivery — event → filter → optional wrap → sink.deliver → outcome event
- Doctor live-state check — probe → result → JSON or pretty-print

**New `business_concept` nodes:**

- Notification envelope (`NotificationEnvelope` schema)
- Notification sink (`NotificationSink` interface)
- Sink kind (`'slack'` for v1; extension point)
- wrap_response option
- Baseline freshness TTL
- Hook validity (parse-only)

**New `business_rule` nodes:**

- A sink only receives events whose type matches at least one of its `events[]` globs
- Webhook URL is supplied via env-var name in config, never the literal URL
- Doctor's `baseline-freshness` is `warn` (not `fail`) when stale; missing baseline file is `info`
- Sinks never retry; delivery failure emits `notification.delivery.failed` for observability only

**New relationships:**

- Event bus _fans out to_ Notification Sink
- Notification Sink _renders from_ Notification Envelope
- Sink Config _references_ Env Var
- Doctor _probes_ Orchestrator API

---

## Success Criteria

### Level 1 — Spec-level

1. **Acyclic dependency graph.** `types → orchestrator/core → cli`; no cycles. Verified by `harness check-arch`.
2. **No new dependencies on packages outside Phase 0's surface.** Sinks consume `bus` + `harness.config.json`; nothing else. Verified by `harness check-deps`.
3. **Backwards compatibility.** `CINotifier` unchanged; existing `harness doctor` exit-codes unchanged; `WebhookSubscription` schema unchanged; `GatewayEvent` shape unchanged.

### Level 2 — Phase-readiness gates (parent meta §599)

| Gate                                            | Status target                    |
| ----------------------------------------------- | -------------------------------- |
| `harness validate` passes                       | ✓                                |
| `harness:verification` three-tier passes        | ✓                                |
| `harness check-arch` clean                      | ✓                                |
| `harness check-deps` clean                      | ✓                                |
| ADRs merged                                     | ✓ (2 ADRs)                       |
| Knowledge graph nodes ingested                  | ✓                                |
| AGENTS.md updated                               | ✓                                |
| CHANGELOG entry                                 | ✓                                |
| Plugin manifests regenerated                    | ✓                                |
| External test consumer exists                   | ✓ (`harness notifications test`) |
| `harness:soundness-review` passed on phase spec | ✓                                |

### Level 3 — Observable outcomes (parent meta §621)

1. **Notification latency.** Median delivery latency from orchestrator event to Slack-acknowledged < 30s. Measured by: `notification.delivery.attempted` timestamp − originating event timestamp, p50 over a synthetic test corpus of 50 events.
2. **Doctor synthesizes fault injection.** A fault-injection test in `packages/cli/tests/commands/doctor.integration.test.ts` injects a stale baseline (mtime 60 days back), a malformed hook (`bash -n` fails), a missing token (orchestrator-ping 401), and a corrupted session JSON; doctor reports exactly 4 failures with correct `name` tags.
3. **`harness notifications test team-slack` returns 0** against a mock receiver in CI and against a real Slack webhook in the post-merge integration job (gated by an `HARNESS_SLACK_TEST_URL` secret).

### Anti-success Criteria (Red Flags)

If any of these surfaces during implementation, **stop and re-spec**:

1. **Sink delivery blocks webhook fanout.** If a slow Slack call delays a webhook POST, the parallel-fanout invariant is broken — fix or re-architect.
2. **Doctor adds external network egress probes.** Re-reading D5: that's explicitly out of scope.
3. **Envelope shape grows beyond 6 fields.** Each addition forces every sink to render it; new fields require an ADR amendment.
4. **`CINotifier` gets refactored to implement `NotificationSink`.** Out of scope per "Non-goals"; tracker-shaped behavior stays in `CINotifier`.

---

## Implementation Order

Five steps. Each is mechanically verifiable before the next begins.

### Step 1 — Types layer (1 day)

1. Write `packages/types/src/notifications.ts` with all schemas.
2. Re-export from `packages/types/src/index.ts`.
3. `pnpm -F @harness-engineering/types test` passes.
4. `harness check-arch` clean.

### Step 2 — Orchestrator notifications module (3–4 days)

1. `packages/orchestrator/src/notifications/sink.ts` — interface only.
2. `packages/orchestrator/src/notifications/envelope.ts` — `wrapAsEnvelope` + per-event derivers + tests.
3. `packages/orchestrator/src/notifications/slack-sink.ts` — `SlackSink` + tests (mock fetch).
4. `packages/orchestrator/src/notifications/registry.ts` — `SinkRegistry.fromConfig` + lifecycle.
5. `packages/orchestrator/src/notifications/events.ts` — `wireNotificationSinks` + tests (mock bus + mock sink).
6. `packages/orchestrator/src/notifications/index.ts` — public surface.
7. Re-exports from `packages/orchestrator/src/index.ts`.
8. Wire into `orchestrator.ts` start/stop lifecycle.
9. Integration test: bus emit → sink deliver, asserting fetch mock was called with correctly-shaped Slack JSON.

### Step 3 — Config validator (1 day)

1. `packages/core/src/config/notifications.ts` — `loadNotificationsConfig(configPath)` reads + validates.
2. Test: unknown kind, missing env var (resolves to fail), malformed events glob.
3. Wire into `packages/core/src/config/index.ts` exports.

### Step 4 — Doctor hardening (2 days)

1. Refactor `runDoctor()` to async.
2. Add `checkOrchestratorPing(cwd)` — token-aware GET `/api/v1/state`.
3. Add `checkHooksValidity(cwd)` — per-hook syntax check.
4. Add `checkBaselineFreshness(cwd)` — mtime against TTL (env-overridable via `HARNESS_BASELINE_TTL_DAYS`).
5. Add `checkSessionsIntegrity(cwd)` — newest-N session JSON parse against Phase 1 schema (gracefully degrade if Phase 1 absent).
6. Tests: every new check has a positive case, a failure case, and a missing-prereq case.
7. `harness doctor --json` snapshot test verifies stable JSON shape (additive only).

### Step 5 — CLI command + integration + docs (2 days)

1. `packages/cli/src/commands/notifications/test.ts` — synthesizes a `notification.test` event, dispatches via `SinkRegistry.fromConfig`, prints outcome.
2. Register `notifications` subcommand in `_registry.ts`.
3. Update AGENTS.md, CHANGELOG.md.
4. Create the two ADRs in `docs/knowledge/decisions/`.
5. Knowledge artifact stubs in `docs/knowledge/orchestrator/` and `docs/knowledge/cli/`.
6. Run `harness generate-slash-commands` (idempotent regeneration; expect no diff if no new slash commands).
7. `harness validate` passes top-level.
8. Open PR.

### Exit criterion

`harness:verification` reports SUBSTANTIVE + WIRED tiers green for the new module; `harness notifications test --sink team-slack` against a synthetic receiver in CI; parent meta phase-readiness gates all green.
