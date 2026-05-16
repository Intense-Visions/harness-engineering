# Hermes Phase 0: Gateway API + Telemetry

**Parent spec:** [docs/changes/hermes-adoption/proposal.md](../hermes-adoption/proposal.md)
**Roadmap item:** github:Intense-Visions/harness-engineering#310
**Keywords:** gateway-api, orchestrator-auth, webhook-fanout, hmac-signing, otlp-export, prompt-cache-analytics

## Overview

Phase 0 of the Hermes Adoption program. Ships the foundational orchestrator surface that every later phase depends on: a versioned external HTTP API (`/api/v1/`), a multi-token auth model with scopes and identity claims, outbound webhook fanout with HMAC signing and at-least-once durable delivery, and an OTLP-compatible telemetry exporter with trajectory metadata and prompt-cache analytics.

The parent meta-spec ([Hermes Adoption: 6-Phase Decomposition](../hermes-adoption/proposal.md)) decomposed the adoption into six phases. Phase 0 is the only one with zero prerequisites and unblocks Phases 2–5 (custom maintenance jobs via external trigger, multi-sink notifications, skill-proposal review queue UI, dispatch hardening cost-ceiling telemetry).

### Problem

Harness today has a private HTTP surface mounted under `/api/...` in the orchestrator server (`packages/orchestrator/src/server/http.ts`). It mixes versioned and unversioned routes (e.g., `/api/state` and `/api/v1/state` coexist), uses a single shared `HARNESS_API_TOKEN` env var with no scopes, has no audit trail per caller, has no outbound webhook delivery to external systems, and exports telemetry only to harness's own PostHog endpoint (`packages/core/src/telemetry/transport.ts`) — not to operator-owned observability stacks.

Three downstream phases (3 multi-sink notifications, 4 skill-proposal review, 5 cost-ceiling) require an external surface that does not exist. Building any of them before Phase 0 means either (a) inventing the missing primitives inside the phase that consumes them, or (b) building all three on a soon-to-be-thrown-away private surface. Phase 0 builds the foundation once so the dependent phases just consume it.

### Goals

1. Stable, versioned API contract — `/api/v1/` routes published with OpenAPI, deprecation policy for legacy aliases, and a TypeScript type-derivation path so internal callers stay typed.
2. Real multi-bridge auth — per-token identity, scopes, tenant separation, audit log, rotatable secrets — without forcing operators to run an external IdP.
3. Reliable webhook delivery — at-least-once with HMAC signing, idempotency keys, exponential-backoff retry, dead-letter inspection, persisted across restarts.
4. OTLP-compatible telemetry export — dispatch decisions, skill invocations, maintenance task runs, trajectory metadata, and prompt-cache hit-rate land in any operator's OTel collector via OTLP/HTTP.
5. Foundation for Phases 2–5 — every dependent phase can build against the Phase 0 surface without inventing its own auth, transport, or delivery primitives.

### Non-goals

- OAuth2/OIDC identity. Token-based identity covers the realistic harness user; OAuth resource-server semantics are deferred indefinitely.
- Public-internet binding. Orchestrator stays localhost-by-default; exposing externally is a tunnel-pattern documentation problem, not a harness code problem.
- Langfuse-specific export. OTLP/HTTP is the only telemetry transport this phase ships; Langfuse / LangSmith / vendor-native exporters are watch-list items.
- Strict event ordering or replay windows on webhooks. At-least-once + DLQ is the commitment; ordering and replay are out of scope.
- Refactoring legacy routes' payload shapes beyond what versioning requires. Re-shaping is deferred to `/api/v2` if ever needed.
- Bridge SDK / opinionated bridge envelope. No `@harness-engineering/gateway-client` package this phase; bridges build against raw OpenAPI.

### Scope

**In-scope:**

- `/api/v1/` versioning across existing routes
- `POST/DELETE /api/v1/webhooks` and `POST /api/v1/auth/token` routes
- `POST /api/v1/jobs/maintenance`, `POST /api/v1/interactions/{id}/resolve`, `GET /api/v1/events` SSE
- `tokens.json` schema, hashed-at-rest storage, rotation CLI
- `webhook-queue.sqlite`, retry ladder, DLQ inspection, CLI
- HMAC SHA-256 signing with per-subscription secret
- OTLP/HTTP exporter, trajectory metadata, prompt-cache analytics widget
- OpenAPI generated artifact + canonical bridge-exposure tunnel guide

**Out-of-scope:**

- `/api/v2` redesigns
- Multi-tenant routing across separate harness instances
- Bridge SDK or wire-format envelope
- Langfuse exporter, OTLP/gRPC, Honeycomb/Datadog native exporters
- Webhook replay, strict ordering, retention > 5 min (DLQ-only)
- Public binding / harness-managed tunnel / TLS termination
- Cost-ceiling enforcement (Phase 5; only telemetry hooks land here)

### Assumptions

- **Runtime:** Node.js ≥ 18.x (LTS). Phase 0 uses `crypto.timingSafeEqual`, `crypto.createHmac`, and `node:http` from the stdlib; orchestrator already runs on this version.
- **SQLite binding:** the queue uses the SQLite binding already in the harness dependency tree (`better-sqlite3` or equivalent — selected during S4). No new database engine introduced.
- **Encoding:** UTF-8 for all on-disk files (`tokens.json`, `webhooks.json`, `audit.log`).
- **Filesystem:** orchestrator has read+write access to `.harness/` under the project root.
- **Existing event bus:** the orchestrator already broadcasts `state_change`, `agent_event`, `interaction_new`, `maintenance:*`, and `local-model:status` — Phase 0 subscribes to these and adds the new `interaction.*`, `maintenance.*`, `dispatch.*`, `telemetry.*`, `auth.*`, `webhook.*` topics.
- **OpenAPI tooling:** `zod-to-openapi` (or equivalent Zod→OpenAPI generator) is added as a dev dependency; no runtime dependency.

---

## Decisions Made

Six decisions surfaced during brainstorming. Each names the alternatives considered and the reason for the choice; references to the parent meta-spec preserve traceability.

### D1 — API surface = "Extended minimal + bridge primitives" (Q1 option B)

Phase 0 publishes `/api/v1/` over the routes already mounted on the orchestrator server (state, interactions, plans, analyze, analyses, roadmap-actions, dispatch-actions, local-model, maintenance, streams, sessions, chat-proxy), generates OpenAPI from them, and adds the four bridge primitives the parent meta-spec named:

- `POST /api/v1/jobs/maintenance`
- `POST /api/v1/interactions/{id}/resolve`
- `GET /api/v1/events` (SSE alongside `/ws`)
- `POST/DELETE /api/v1/webhooks`
- `POST /api/v1/auth/token`

**Alternatives rejected:**

- _Minimal-only_ (re-version existing routes; no bridge primitives) — leaves Phases 2/3/4 blocked on routes not built yet.
- _Full bridge SDK + envelope spec_ — speculative without a bridge to validate against; pushes Phase 0 past 6 weeks.

**Evidence:** `packages/orchestrator/src/server/http.ts` (existing route table at `buildApiRoutes()`); parent spec Section "Phase 0 — Foundation".

### D2 — Auth = multi-token with identity claims (Q2 option B)

Each token carries: `name`, `scopes`, optional `bridgeKind` (`slack`/`discord`/`github-app`/`custom`), optional `tenantId`, `createdAt`, `lastUsedAt`, optional `expiresAt`. Tokens stored hashed in `.harness/tokens.json`; raw value revealed once at creation. Legacy `HARNESS_API_TOKEN` env var remains as an admin escape hatch. Every request logged with token-id + tenantId.

**Scope vocabulary** (initial set, extensible):

| Scope                 | Routes                                   |
| --------------------- | ---------------------------------------- |
| `trigger-job`         | `POST /api/v1/jobs/maintenance`          |
| `read-status`         | `GET` endpoints, `/api/v1/state`         |
| `resolve-interaction` | `POST /api/v1/interactions/{id}/resolve` |
| `subscribe-webhook`   | `POST/DELETE /api/v1/webhooks`           |
| `modify-roadmap`      | `POST /api/v1/roadmap/*` mutations       |
| `read-telemetry`      | `GET /api/v1/events` SSE stream          |
| `admin`               | all of the above                         |

**Rejected:** single token + scope flags (no per-bridge audit), OAuth2/OIDC (forces every operator to run an IdP).

### D3 — Webhook delivery = at-least-once with bounded retry + DLQ (Q3 option B)

Subscriptions persisted in `.harness/webhooks.json` (sibling of `tokens.json`). Each delivery attempt persisted to `.harness/webhook-queue.sqlite`. Retry ladder: **1s, 4s, 16s, 64s, 256s** (~5 min total). Failed deliveries move to a dead-letter table.

**Per-delivery headers:**

- `X-Harness-Delivery-Id: <uuid>` (idempotency key)
- `X-Harness-Event-Type: <kind>`
- `X-Harness-Signature: sha256=<hex>`
- `X-Harness-Timestamp: <unix-ms>`

Per-subscriber concurrency cap (default 4 in-flight) prevents thundering herd. Drain-on-shutdown discipline: queue replays unfinished attempts on next start.

**Rejected:** fire-and-forget (silent data loss on a 90s subscriber outage), strict ordering + replay (serial bottleneck + long-term payload retention).

### D4 — Telemetry export = OTLP/HTTP only (Q4 option A)

Single in-tree `TelemetryExporter` writing OTLP/HTTP traces to a configurable collector endpoint. Operator points the exporter at their own OTel collector and from there pipes to Honeycomb / Datadog / Grafana Tempo / Jaeger / Langfuse-OTel-receiver / anywhere.

**Three trace kinds:**

- `skill_invocation` (extends existing `adoption.jsonl` record)
- `dispatch_decision` (orchestrator dispatch + backend selection)
- `maintenance_run` (scheduler task lifecycle)

**Trajectory metadata fields** (attached to `skill_invocation`): `turnsCount`, `toolCallCount`, `modelTokenSpend` (input/output/cacheRead/cacheCreation), `promptCacheHit`, `promptCacheMiss`, `totalDurationMs`, `phasesReached`.

OTLP/gRPC, Langfuse-native, LangSmith deferred. Watch-list items.

**Independent of OTLP:** `telemetry.*` events ALSO emitted on the Q3 webhook fanout (`telemetry.skill_invocation`, `telemetry.dispatch_decision`, `telemetry.maintenance_run`) — free given the queue infrastructure exists.

### D5 — Network exposure = localhost-by-default + tunnel pattern guide (Q5 option A)

Orchestrator binds `127.0.0.1` unless `HOST` env explicitly changed; no new public-binding code path. Phase 0 ships a canonical `docs/guides/gateway-tunnel.md` covering Tailscale, Cloudflare Tunnel, and ngrok as supported bridge-exposure patterns.

**Rejected:** `HARNESS_LISTEN_MODE=public` env (CVE-prone speculative code before any deployment validates it), harness-managed tunnel (couples harness to a third-party provider, mission-drift).

### D6 — Webhook signing = HMAC SHA-256 per-subscription secret (Q6 option A)

Subscription creation generates a 32-byte secret, shown once. Every delivery POST includes:

```
X-Harness-Signature: sha256=<lowercase-hex>
```

where the signature is computed as `HMAC-SHA256(secret, raw-body)`. Signature is verified by bridges via constant-time compare. Rotation model: DELETE + recreate (no rotation endpoint in v1; explicit rotation deferred to a follow-up).

**Rejected:** mTLS (inconsistent client-cert support across serverless platforms), bearer token re-echo (no body tamper-evidence), no-signing (URL secrecy is broken; meta-spec success criterion explicitly says "valid signed request").

### D7 — Implementation = 5 vertical slices

The 4–5 week implementation runs as five mergeable slices:

| Slice | Title                                                  |
| ----- | ------------------------------------------------------ |
| S1    | Auth foundation + OpenAPI scaffolding                  |
| S2    | Versioned API surface + bridge primitive routes        |
| S3    | Webhook subscriptions + signing (in-memory)            |
| S4    | Webhook delivery durability (SQLite + retry + DLQ)     |
| S5    | Telemetry export (OTLP + trajectory + cache analytics) |

Each slice ends with green CI, dashboard surface where applicable, and end-to-end testability. **Rejected:** monolithic (week-4 integration risk) and horizontal-layer (no end-to-end testability until very late).

### Cross-cutting decisions

- **Backwards compatibility:** legacy unversioned aliases (`/api/state`, `/api/interactions`, etc.) keep working through Phase 0 with a `Deprecation: <date>` header; removal scheduled for `/api/v2` or 12 months post-Phase-0-GA, whichever comes first.
- **OpenAPI:** generated from Zod schemas via `zod-to-openapi`; vendored at `docs/api/openapi.yaml`; regenerated on every API change in CI.
- **Type safety:** orchestrator routes share request/response Zod schemas with the dashboard client via `packages/types`.
- **Audit log:** append-only JSONL at `.harness/audit.log` (each entry: timestamp, tokenId, tenantId, route, status). `cleanup-sessions` extension (Phase 2) handles rotation.

---

## Technical Design

### File layout

**New packages and modules:**

```
packages/orchestrator/src/
  auth/
    tokens.ts            -- token CRUD, hash/verify, audit-log writer
    scopes.ts            -- scope vocabulary + scope-check middleware
    audit.ts             -- append-only audit log writer
  gateway/
    webhooks/
      store.ts           -- webhooks.json reader/writer
      signer.ts          -- HMAC SHA-256 helpers
      delivery.ts        -- delivery worker + retry ladder
      queue.ts           -- SQLite queue + DLQ
      events.ts          -- event-bus subscriber → queue producer
    events/
      sse.ts             -- GET /api/v1/events Server-Sent Events handler
    openapi/
      registry.ts        -- Zod → OpenAPI registration helpers
      generate.ts        -- emit docs/api/openapi.yaml
  server/routes/v1/      -- versioned routes (mirror existing route table)
    auth-token.ts        -- POST /api/v1/auth/token
    webhooks.ts          -- POST/DELETE /api/v1/webhooks
    jobs-maintenance.ts  -- POST /api/v1/jobs/maintenance
    interactions.ts      -- existing wrapped + POST /resolve
    events.ts            -- SSE endpoint
    state.ts             -- existing GET /api/state mirrored at /api/v1/state
    ...                  -- one wrapper per legacy route

packages/core/src/telemetry/
  exporter/
    otlp-http.ts         -- OTLP/HTTP exporter (new)
    trajectory.ts        -- trajectory metadata builder
    cache-metrics.ts     -- prompt-cache instrumentation
    types.ts             -- TraceSpan / SpanKind / SpanAttributes
  collector.ts           -- (modified) emit OTLP spans + PostHog events

packages/cli/src/commands/
  gateway-token.ts       -- harness gateway token <create|list|revoke>
  gateway-deliveries.ts  -- harness gateway deliveries <list|retry|purge>

packages/dashboard/src/client/pages/
  tokens.tsx             -- token management page
  webhooks.tsx           -- webhook subscription + DLQ inspection page
  insights/cache.tsx     -- prompt-cache analytics widget (composed into
                            Insights page once Phase 1 ships)

packages/dashboard/src/server/routes/
  tokens.ts              -- backend for tokens.tsx
  webhooks.ts            -- backend for webhooks.tsx

docs/api/
  openapi.yaml           -- generated artifact (vendored)
docs/guides/
  gateway-tunnel.md      -- bridge-exposure tunnel guide
```

**Modified:**

- `packages/orchestrator/src/server/http.ts` — swap single-token `checkAuth()` for token-store + scope middleware; mount `/api/v1/*` route table; keep legacy `/api/*` aliases with `Deprecation` header.
- `packages/orchestrator/src/server/websocket.ts` — broadcast additional `telemetry.*` event types to webhook fanout.
- `packages/types/src/` — add: `AuthToken`, `TokenScope`, `WebhookSubscription`, `WebhookDelivery`, `TrajectoryMetadata`, `PromptCacheStats`, `OTLPSpan`, `GatewayEvent`. Regenerate barrel.

### Data schemas (Zod-defined, single source of truth)

**AuthToken:**

```
id            string         -- "tok_" + 16 hex chars
name          string         -- human label
scopes        TokenScope[]
bridgeKind?   "slack"|"discord"|"github-app"|"custom"
tenantId?     string
hashedSecret  string         -- bcrypt or argon2 (TBD during S1)
createdAt     ISO8601
lastUsedAt?   ISO8601
expiresAt?    ISO8601
```

**WebhookSubscription:**

```
id            string         -- "whk_" + 16 hex chars
tokenId       string         -- which auth token owns it
url           string         -- https only in v1; http rejected
events        string[]       -- glob patterns ("interaction.*", "maintenance.completed", "telemetry.*")
hashedSecret  string         -- for HMAC signing
createdAt     ISO8601
```

**WebhookDelivery** (SQLite row):

```
id             text PK       -- "dlv_" + uuid
subscriptionId text FK
eventType      text
payload        blob          -- raw JSON
attempt        int           -- 0..5 (5 = dead-lettered)
status         text          -- pending|delivered|failed|dead
nextAttemptAt  int           -- unix ms; null when terminal
lastError?     text
deliveredAt?   int
```

**TrajectoryMetadata** (attaches to `skill_invocation`):

```
turnsCount         int
toolCallCount      int
modelTokenSpend    { input: int, output: int, cacheRead: int, cacheCreation: int }
promptCacheHit     int       -- bytes
promptCacheMiss    int       -- bytes
totalDurationMs    int
phasesReached      string[]
```

**PromptCacheStats** (aggregated):

```
windowStart   ISO8601
windowEnd     ISO8601
hitRate       number 0..1
cachedTokens  int
totalTokens   int
```

**GatewayEvent** (envelope on the webhook fanout):

```
id            string         -- "evt_" + uuid
type          string         -- "interaction.created" | "maintenance.completed"
                              | "telemetry.skill_invocation" | ...
timestamp     ISO8601
data          unknown        -- typed per event kind in the schema registry
correlationId? string        -- threads related events together
```

### API routes

All under `/api/v1/`. Each handler defined as:

- Zod request schema
- Zod response schema (200 + error shapes)
- Required scope
- Audit log entry shape

```
POST /api/v1/auth/token                       scope: admin
     body: { name, scopes[], bridgeKind?, tenantId?, expiresAt? }
     200:  { token: "...", id, ...subset of AuthToken }  -- secret shown once
     409:  duplicate name

GET  /api/v1/auth/tokens                      scope: admin
     200:  AuthToken[]  -- hashedSecret redacted

DELETE /api/v1/auth/tokens/{id}               scope: admin
     200:  { deleted: true }
     404:  token not found

POST /api/v1/webhooks                         scope: subscribe-webhook
     body: { url, events[] }
     200:  { id, secret, ...WebhookSubscription }  -- secret shown once
     422:  invalid URL / scheme

DELETE /api/v1/webhooks/{id}                  scope: subscribe-webhook
     200:  { deleted: true }
     404:  subscription not found

GET  /api/v1/webhooks                         scope: subscribe-webhook
     200:  WebhookSubscription[]   -- secrets redacted

POST /api/v1/jobs/maintenance                 scope: trigger-job
     body: { taskId, params? }
     200:  { runId }
     404:  task not found
     409:  task already running

GET  /api/v1/jobs/maintenance/{runId}         scope: read-status
GET  /api/v1/jobs/maintenance/{runId}/output  scope: read-status

POST /api/v1/interactions/{id}/resolve        scope: resolve-interaction
     body: { answer: unknown }   -- typed per interaction kind
     200:  { resolved: true }
     404:  interaction not found
     409:  interaction already resolved

GET  /api/v1/events                           scope: read-telemetry
     SSE stream of GatewayEvent;
     Last-Event-ID header for reconnection from a known cursor

GET  /api/v1/state                            scope: read-status
     (re-export of existing /api/state)
```

All routes also emit one audit log entry. No PII in audit log; payload contents not logged, only routes + status.

**Audit-write failure behavior:** if appending to `.harness/audit.log` fails (disk full, permission error), the request handler logs a `warn`-level message and continues serving the request. The audit guarantee is best-effort, not blocking — a write-failure would otherwise turn a logging fault into a denial-of-service. A red-flag (Anti-success #6) covers the inverse problem (audit log capturing payloads).

### Auth & scope middleware

The `handleApiRoutes()` pipeline becomes:

1. Extract bearer token from `Authorization` header (or legacy `HARNESS_API_TOKEN` match).
2. Lookup by hash; reject if not found / expired.
3. Update `lastUsedAt`.
4. Verify route's required scope is in `token.scopes`.
5. Write audit entry (async, non-blocking).
6. Attach `{ tokenId, tenantId }` to req for handlers to use.

Constant-time comparison via `crypto.timingSafeEqual` everywhere.

Rate limit: per-IP rate-limiter (existing) untouched; additional per-token limiter added later if telemetry shows abuse.

### Webhook delivery worker

`queue.ts` schema as above. `delivery.ts` worker:

```
loop:
  SELECT row WHERE status='pending' AND nextAttemptAt <= now() LIMIT N
  for each:
    POST to subscription.url with timeout 5s
    on 2xx: status=delivered, deliveredAt=now()
    on non-2xx or timeout:
      attempt += 1
      if attempt >= 5: status='dead', insert into dlq
      else: nextAttemptAt = now() + [1s,4s,16s,64s,256s][attempt-1]
      lastError = <truncated body or "timeout">
```

Concurrency cap: per-subscription semaphore (default 4). Drain on SIGTERM: 30s graceful window, then flush remaining attempts to disk.

Signing: `signer.ts` has `sign(secret, body)` → `"sha256=<hex>"` and `verify(secret, body, sig)` for tests. Body is signed **before** the serialize/deliver hop so retries reuse the original signature (idempotency required).

### OTLP exporter

`otlp-http.ts` subscribes to the existing orchestrator event bus + `adoption.jsonl` writes. For each:

```
build TraceSpan { traceId, spanId, parentSpanId?, name, kind,
                  startNs, endNs, attributes, status }
buffer up to 64 spans or 2s, then POST to
  {OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces
exponential backoff on failure (3 attempts, 1s/2s/4s), then drop.
```

**Trajectory metadata fields attached as span attributes:**

| Attribute               | Source                   |
| ----------------------- | ------------------------ |
| `harness.skill`         | skill name               |
| `harness.outcome`       | success/failure          |
| `harness.turns`         | `turnsCount`             |
| `harness.tool_calls`    | `toolCallCount`          |
| `harness.tokens.input`  | `modelTokenSpend.input`  |
| `harness.tokens.output` | `modelTokenSpend.output` |
| `harness.cache.hit`     | `promptCacheHit`         |
| `harness.cache.miss`    | `promptCacheMiss`        |

Spans correlate: `maintenance_run` is the parent; `skill_invocation` children link via `parentSpanId`. `dispatch_decision` spans live under `maintenance_run`.

Telemetry events ALSO fan to webhooks as `telemetry.*` (no double-export cost — same event stream, two consumers).

### Prompt-cache analytics

`cache-metrics.ts` hooks the backend adapter (`packages/orchestrator/src/agent/backends/anthropic.ts`) where cache headers come back. Computes:

- Rolling 1h / 24h / 7d hit-rate
- Cumulative tokens cached vs uncached
- Per-skill cache hit-rate breakdown

Dashboard widget in `/insights/cache.tsx` renders a sparkline + breakdown. Composed into the Phase 1 Insights page when that lands; standalone until then.

### OpenAPI generation

`openapi/registry.ts` wraps `zod-to-openapi`:

```
registerRoute({ method, path, scope, request, response, summary }) →
  accumulates routes + schemas
```

`generate.ts` emits `docs/api/openapi.yaml`. CI step: run generate, diff against committed `openapi.yaml`, fail if drift.

---

## Integration Points

### Entry Points

**New CLI commands:**

```
harness gateway token create --name <s> --scopes <list> [--tenant <s>] [--expires <date>]
harness gateway token list
harness gateway token revoke <id>
harness gateway deliveries list [--subscription <id>] [--status <s>]
harness gateway deliveries retry <delivery-id>
harness gateway deliveries purge [--older-than <duration>] [--dead-only]
```

**Extended CLI commands:**

- `harness validate` — gains a "gateway" check group (`tokens.json` valid, `openapi.yaml` in sync with code, queue schema migrated).

**New MCP tools:**

| Tool                      | Tier | Purpose                    |
| ------------------------- | ---- | -------------------------- |
| `subscribe_webhook`       | 1    | admin-scope equivalent     |
| `trigger_maintenance_job` | 1    | for autopilot internal use |
| `list_gateway_tokens`     | 0    | read-only status check     |

_(Note: `emit_skill_proposal` lives in Phase 4 spec, not here. The MCP tool surface added in Phase 0 is intentionally minimal — the API is the external surface, MCP tools are internal.)_

**New API routes:** Documented in Technical Design. All under `/api/v1/`.

**New dashboard pages:**

- `/tokens` — list + revoke + (admin-scope) create
- `/webhooks` — list subscriptions + view delivery log + retry DLQ entries + recent activity timeline
- The prompt-cache analytics widget lives at `/insights/cache` and is composed into the Phase 1 Insights page; standalone route exists until that lands.

**New SSE topic at the orchestrator:**

- `GET /api/v1/events` — envelope-formatted `GatewayEvent` stream; co-exists with the legacy `/ws` WebSocket (no migration of `/ws` subscribers planned).

**New event types on the orchestrator event bus** (consumed by the webhook delivery worker AND the SSE handler):

- `interaction.created`, `interaction.resolved`
- `maintenance.started`, `maintenance.completed`, `maintenance.failed`
- `dispatch.started`, `dispatch.completed`, `dispatch.failed`
- `telemetry.skill_invocation`, `telemetry.dispatch_decision`, `telemetry.maintenance_run`
- `auth.token.created`, `auth.token.revoked`
- `webhook.subscription.created`, `webhook.subscription.deleted`
- `webhook.delivery.failed`, `webhook.delivery.dead_lettered`

### Registrations Required

| Registry                                        | Update                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/_registry.ts`        | Register `gateway token` and `gateway deliveries` subcommand groups                                                                                                                                                       |
| `packages/cli/src/mcp/server.ts`                | Register `subscribe_webhook`, `trigger_maintenance_job`, `list_gateway_tokens`                                                                                                                                            |
| `packages/cli/src/mcp/tool-tiers.ts`            | `subscribe_webhook` → tier-1; `trigger_maintenance_job` → tier-1; `list_gateway_tokens` → tier-0                                                                                                                          |
| `packages/orchestrator/src/server/http.ts`      | Mount `/api/v1/*` route table; replace `checkAuth()` with token-store + scope middleware; preserve legacy `/api/*` routes with `Deprecation` header until `/v2`                                                           |
| `packages/orchestrator/src/auth/scopes.ts`      | Export `SCOPE_VOCABULARY` (admin, trigger-job, read-status, resolve-interaction, subscribe-webhook, modify-roadmap, read-telemetry); version-pin this file; changes require ADR                                           |
| `packages/dashboard/src/client/router.tsx`      | `/tokens`, `/webhooks` pages registered; `/insights/cache` widget composed when Phase 1 Insights page lands                                                                                                               |
| `packages/dashboard/src/server/routes/index.ts` | Mount `routes/tokens.ts` and `routes/webhooks.ts`                                                                                                                                                                         |
| `packages/types` barrel                         | Export `AuthToken`, `TokenScope`, `WebhookSubscription`, `WebhookDelivery`, `TrajectoryMetadata`, `PromptCacheStats`, `OTLPSpan`, `GatewayEvent`                                                                          |
| `harness.config.json` schema                    | New `gateway` section: `{ tokens.expiryDefault?, webhooks.maxAttempts?, webhooks.retentionDays?, openapi.outputPath? }`; new `telemetry.export` section: `{ otlp.endpoint?, otlp.headers?, otlp.serviceName?, enabled? }` |
| CI workflow                                     | New job: `openapi-drift-check` (run generate, fail on diff); new job: `webhook-queue-migration` (sqlite schema in sync)                                                                                                   |
| Slash command generator                         | `harness generate-slash-commands` re-run; `gateway` subcommands emitted per host                                                                                                                                          |
| Per-host plugin manifests                       | `harness-claude`, `harness-cursor`, `harness-codex`, `harness-gemini`, `harness-opencode` regenerated after slash-command emit                                                                                            |
| OpenAPI artifact                                | Vendored at `docs/api/openapi.yaml`; regenerated in CI                                                                                                                                                                    |

### Documentation Updates

- `README.md` — "Key features" section gains a Gateway API bullet; Quickstart for the canonical bridge-exposure tunnel pattern.
- `AGENTS.md` — new section "Gateway API + Telemetry" with usage examples; MCP tool list updated.
- `CHANGELOG.md` — per-slice entries (S1 auth, S2 versioned API, S3 webhooks, S4 durability, S5 telemetry export).
- Plugin marketplace listings (`harness-claude/README`, `harness-cursor/README`, `harness-codex/README`, `harness-gemini/README`, `harness-opencode/README`) — Gateway API surface summarized once across all.
- `docs/api/openapi.yaml` — vendored, generated; SPA can render via redoc or rapidoc.
- `docs/guides/gateway-tunnel.md` (NEW) — canonical guide: Tailscale, Cloudflare Tunnel, ngrok; includes a sample Slack-bot bridge as the end-to-end example.
- `docs/knowledge/orchestrator/gateway-api.md` (NEW) — `business_process` node ingested via knowledge pipeline; describes auth flow, scope vocabulary, audit log shape.
- `docs/knowledge/orchestrator/webhook-fanout.md` (NEW) — `business_process` node; subscribe → match → sign → deliver → retry → DLQ lifecycle.
- `docs/knowledge/core/telemetry-export.md` (NEW) — `business_concept` node; OTLP span schema + trajectory metadata fields.
- `docs/knowledge/decisions/` — Phase 0 ADRs (listed below).

### Architectural Decisions

Phase 0 lands two ADRs:

- **ADR — "Orchestrator Gateway API contract"** (parent meta-spec lists this). Versioned REST + token-scoped auth + outbound webhook delivery. Stable external interface so gateway adapters can be built without harness owning protocol-specific code.
- **ADR — "Telemetry export to OpenTelemetry"** (parent meta-spec lists this). Webhook-based emission consumed by an in-tree OTLP/HTTP exporter gives users running in production access to standard observability tools without harness owning protocol code.

A third ADR is created if needed during implementation:

- **ADR — "Webhook delivery durability model"** (conditional). If implementation surfaces edge cases (drain-on-shutdown semantics, queue corruption recovery, idempotency-key collision handling) significant enough to record beyond the spec, lift the section into its own ADR. Otherwise the spec section suffices.

### Knowledge Impact

**New `business_concept` nodes** (added when phase lands, via knowledge pipeline):

- Orchestrator API Token — identity, scope, lifetime
- Token Scope — vocabulary, admin/restricted distinction
- Webhook Subscription — URL, event filter, signing secret
- Webhook Delivery — attempt, status, idempotency key
- HMAC Signature — signing protocol
- OTLP Span — trace shape and `harness.*` attributes
- Trajectory Metadata — per-skill-invocation fields
- Prompt Cache Stats — aggregated hit-rate window
- Gateway Event Envelope — shape on the webhook + SSE buses

**New `business_process` nodes:**

- Gateway API authentication flow — lookup → expiry-check → scope-check → audit-write → handler
- Webhook fanout lifecycle — subscribe → match → sign → enqueue → deliver → retry → DLQ
- OTLP trace export — event-bus → span-builder → batch → POST → drop-or-retry
- Prompt cache instrumentation — backend-response → cache-headers → rolling-aggregate → widget

**New `business_rule` nodes:**

- Every `/api/v1/` call must pass token scope verification
- Webhook deliveries must include valid HMAC SHA-256 signature
- Webhook subscriptions must use `https`; `http` rejected at registration
- OTLP export must not block the dispatch hot path (async, best-effort)
- Audit log must NOT record payload contents — only route + status

**New relationships in the graph:**

- Auth Token `HAS_SCOPE` Token Scope
- Auth Token `OWNS` Webhook Subscription
- Webhook Subscription `PRODUCES` Webhook Delivery
- Webhook Delivery `CARRIES` Gateway Event Envelope
- Gateway Event Envelope `REPRESENTS` Orchestrator Event
- Skill Invocation `EMITS` OTLP Span
- OTLP Span `ATTACHES` Trajectory Metadata
- Orchestrator Backend `POPULATES` Prompt Cache Stats

These nodes/edges are ingested via the existing `harness:knowledge-pipeline` once `docs/knowledge/orchestrator/gateway-api.md`, `webhook-fanout.md`, and `core/telemetry-export.md` land. No hand-edits to the graph.

---

## Success Criteria

Observable, testable outcomes grouped by tier. Each criterion is gated either by automation (CI), manual verification at phase completion, or post-GA telemetry windows.

### Level 1 — Functional (per-slice exit gates)

**S1 — Auth Foundation**

- [ ] `tokens.json` schema validates against Zod schema; round-trip write→read→verify preserves all fields
- [ ] `harness gateway token create --name slack-bot --scopes trigger-job` prints a token once, never again; subsequent `list` redacts secret
- [ ] Bearer-token request to existing `/api/state` succeeds with new token; rejected without it or with wrong scope
- [ ] Legacy `HARNESS_API_TOKEN` env var continues to authenticate (backwards-compat invariant)
- [ ] Audit log entry written for every request; contains tokenId, tenantId, route, status; NO request payload
- [ ] OpenAPI artifact generated for the auth routes only; CI `openapi-drift-check` passes

**S2 — Versioned API Surface**

- [ ] Every legacy route accessible at both `/api/*` and `/api/v1/*`
- [ ] Legacy `/api/*` responses include `Deprecation: <ISO-date>` header
- [ ] `POST /api/v1/jobs/maintenance` triggers a built-in maintenance task end-to-end and returns `runId`
- [ ] `POST /api/v1/interactions/{id}/resolve` resolves a pending `emit_interaction` question (matches the existing dashboard flow)
- [ ] `GET /api/v1/events` SSE stream emits at least one event in a round-trip CI test (dispatch task → observe SSE event)
- [ ] OpenAPI artifact covers 100% of `/api/v1/` routes; CI drift-check passes

**S3 — Webhook Subscriptions + Signing**

- [ ] `POST /api/v1/webhooks` creates a subscription; secret shown once
- [ ] Local httpbin or `nock` interceptor receives a delivery with `X-Harness-Signature` header
- [ ] HMAC verification succeeds when a bridge recomputes signature from body + secret
- [ ] `http://` URLs at registration time rejected (https required)
- [ ] `DELETE /api/v1/webhooks/{id}` stops further deliveries within 1s

**S4 — Delivery Durability**

- [ ] `webhook-queue.sqlite` schema migrates cleanly; CI migration check passes
- [ ] Subscriber returning 500 retried at 1s / 4s / 16s / 64s / 256s (verified by clock-mocked test)
- [ ] 6th failure moves delivery to DLQ; `harness gateway deliveries list --status=dead` shows it
- [ ] `harness gateway deliveries retry <id>` re-enqueues from DLQ
- [ ] Queue survives orchestrator restart: `kill -9` mid-delivery → restart → pending row replayed
- [ ] Per-subscription concurrency cap enforced (default 4 in-flight verified with a slow-mock subscriber)
- [ ] Dashboard widget shows queue depth + DLQ count, updates within 1s of state change (via SSE)

**S5 — Telemetry Export**

- [ ] Local OTel collector (`otel/opentelemetry-collector-contrib` docker image) receives `skill_invocation`, `dispatch_decision`, `maintenance_run` traces from a real harness run
- [ ] Trajectory metadata fields populated on `skill_invocation` spans (`harness.skill`, `harness.outcome`, `harness.turns`, `harness.tool_calls`, `harness.tokens.input/output`, `harness.cache.hit/miss`)
- [ ] Spans correlate via `traceId`/`parentSpanId` — `maintenance_run` is parent, `skill_invocation` + `dispatch_decision` are children
- [ ] `telemetry.*` events ALSO emitted on the webhook fanout (verified via test subscription)
- [ ] OTLP exporter does not block the dispatch hot path: p99 added latency < 5 ms measured at the dispatch call site
- [ ] Prompt-cache widget shows non-zero hit-rate after a 10-prompt dogfood run

### Level 2 — Quality / Mechanical (cross-slice gates)

- [ ] `harness validate` passes for the full project
- [ ] `harness:verification` three-tier passes (EXISTS / SUBSTANTIVE / WIRED)
- [ ] `harness check-arch` clean; no layer-boundary violations
- [ ] `harness check-deps` clean
- [ ] Type-check across packages passes (no `any` introductions)
- [ ] Test coverage for new modules > 80% lines
- [ ] No new ESLint warnings; new files pass full ruleset
- [ ] Soundness-review of this spec converges with 0 blocking findings

### Level 3 — Integration / End-to-end

- [ ] One reference bridge built against the API: `examples/slack-echo-bridge/` posts to Slack on `maintenance.completed`, verifies HMAC, handles retries
- [ ] Bridge survives a 30s harness restart with no event loss (verified by killing orchestrator mid-stream, restarting, and confirming bridge receives queued deliveries)
- [ ] OpenAPI artifact loads in Redocly / Swagger UI without errors
- [ ] Tunnel guide reproducible: a fresh developer machine + Tailscale + cloud-deployed Slack bot completes the end-to-end flow

### Level 4 — Phase-readiness (from parent meta-spec)

Maps to the gate table in the parent meta-spec (Section "Phase-readiness Gates"):

- [ ] `AGENTS.md` updated with Phase 0 surface
- [ ] CHANGELOG entries land per slice
- [ ] Plugin manifests regenerated
- [ ] OpenAPI artifact vendored and current
- [ ] External test consumer exists (the reference Slack bridge)
- [ ] Phase ADR(s) merged to `docs/knowledge/decisions/`
- [ ] Knowledge graph nodes ingested via `harness:knowledge-pipeline`

### Level 5 — Post-GA telemetry windows

Measured at 30 / 60 / 90 days after Phase 0 marked done in the roadmap.

- [ ] **30 days:** ≥ 1 external bridge issues a valid signed request _(parent meta-spec's headline measurable outcome for Phase 0)_
- [ ] **30 days:** OTel collector receives `skill_invocation` events for ≥ 1 production install
- [ ] **60 days:** webhook delivery success rate > 99% across all active subscriptions (excluding subscriber 5xx)
- [ ] **60 days:** median webhook delivery latency < 2s from event emission to successful 2xx
- [ ] **90 days:** ≥ 5 tokens issued across active harness installs (any scope mix) — adoption signal
- [ ] **90 days:** prompt-cache hit-rate visible in ≥ 50% of installs running autopilot — telemetry coverage signal

### Anti-success — Red Flag Triggers

If any of these surface during or after Phase 0, halt and re-spec:

1. Auth model bug allows scope-escalation (e.g., `trigger-job` token resolves an interaction). → Security incident; phase rolled back.
2. Webhook delivery silently drops events under normal load (not just simulated DLQ scenarios). → Durability claim invalid; S4 redesign.
3. OTLP exporter measurably impacts dispatch throughput in production (> 5 ms p99 added latency). → Refactor to fully-async pipeline.
4. Reference bridge author reports the API contract is unusable. → Halt Phase 3 (which depends on Phase 0) until contract is reworked.
5. OpenAPI drift between code and committed artifact occurs in CI more than 3 times in 30 days. → Generation pipeline brittle; redesign.
6. Audit log captures payload contents (privacy regression). → Code fix + dependency-check rule against payload-logging.

### Cross-cutting telemetry signals to instrument from day 1

- Tokens issued per scope (count by scope-set)
- Webhook delivery success/failure rate per subscription
- DLQ depth (alert at > 50)
- p50/p95/p99 delivery latency
- OTLP span batch flush success rate
- Audit-log write success rate (must be 100%)

---

## Implementation Order

Five vertical slices, each independently mergeable + testable. Each slice ends with a CI-green PR, a working dashboard surface where applicable, and end-to-end testability for the surface added. Estimated total: 4–5 weeks single-contributor; ~3 weeks two-contributor.

### Step 0 — Spec lands _(completed before autopilot enters)_

- Run `harness:soundness-review --mode spec`. Iterate to 0 blocking findings. ✓
- Run `harness validate`. ✓
- Run `advise_skills`; write `docs/changes/hermes-phase-0-gateway-api/SKILLS.md`. ✓
- Request human sign-off via `emit_interaction`. ✓
- Update roadmap item #310 status `planned → in-progress`; `spec` field points to this phase spec (replacing the parent meta-spec pointer). ✓

**Exit:** spec approved, roadmap reflects in-progress; no code written yet. _(This step is meta-process, not an autopilot phase — completed 2026-05-14 before autopilot was invoked.)_

### Phase 1: Auth Foundation + OpenAPI Scaffolding

<!-- complexity: medium -->

_≈ week 1_

**Goal:** token store, scope vocabulary, CLI, audit log, OpenAPI generator working with one route end-to-end. Existing routes gain scoped auth without renaming.

**Tasks:**

1. `packages/types`: `AuthToken`, `TokenScope`, `AuthAuditEntry` schemas
2. `packages/orchestrator/src/auth/tokens.ts`: CRUD + hash/verify
3. `packages/orchestrator/src/auth/scopes.ts`: `SCOPE_VOCABULARY` + scope-check middleware
4. `packages/orchestrator/src/auth/audit.ts`: append-only JSONL writer
5. `packages/orchestrator/src/server/http.ts`: replace `checkAuth()` with token-store + scope middleware; preserve `HARNESS_API_TOKEN` admin path
6. `packages/cli/src/commands/gateway-token.ts`: create/list/revoke
7. `packages/dashboard` pages `/tokens` (list + admin-create + revoke)
8. `packages/orchestrator/src/gateway/openapi/registry.ts`: `zod-to-openapi` wrapper
9. `packages/orchestrator/src/gateway/openapi/generate.ts`: emit `docs/api/openapi.yaml` for the auth routes
10. CI: `openapi-drift-check` job

**Exit gate:** tokens created via CLI authenticate against `/api/state`; audit log captures every call; OpenAPI artifact regenerates idempotently; dashboard `/tokens` page lists tokens.

### Phase 2: Versioned API Surface + Bridge Primitives

<!-- complexity: medium -->

_≈ week 1.5_

**Goal:** `/api/v1/*` covers all existing routes plus the four bridge-primitive routes. OpenAPI artifact covers 100% of v1.

**Tasks:**

1. `packages/orchestrator/src/server/routes/v1/`: one wrapper file per existing route (re-export handlers under `/api/v1/<name>`)
2. Add `Deprecation` header to legacy `/api/*` routes
3. Implement `POST /api/v1/jobs/maintenance` (calls into existing `MaintenanceScheduler.dispatchAdHoc`)
4. Implement `POST /api/v1/interactions/{id}/resolve` (delegates to existing `InteractionQueue.updateStatus(id, 'resolved')` — see `packages/orchestrator/src/core/interaction-queue.ts`)
5. Implement `GET /api/v1/events` SSE handler subscribing to the orchestrator event bus
6. `packages/cli/src/mcp`: register `trigger_maintenance_job` and `list_gateway_tokens` (`subscribe_webhook` deferred to Slice 3)
7. Regenerate OpenAPI artifact across all v1 routes; CI drift-check covers all
8. Slash-command generator re-run; per-host plugin manifests regenerated

**Exit gate:** every legacy route reachable at `/api/v1/*`; SSE stream end-to-end testable; OpenAPI artifact covers 100% of v1 routes; drift-check CI green.

### Phase 3: Webhook Subscriptions + Signing (in-memory)

<!-- complexity: medium -->

_≈ week 2_

**Goal:** subscriptions, signing, in-memory delivery. End-to-end testable against a local httpbin. No persistence yet — that's Slice 4.

**Tasks:**

1. `packages/types`: `WebhookSubscription`, `GatewayEvent` schemas
2. `packages/orchestrator/src/gateway/webhooks/store.ts`: `webhooks.json` reader/writer (in-memory cache + on-disk persistence)
3. `signer.ts`: HMAC SHA-256 helpers + 5-line bridge-verification snippet in the tunnel guide
4. `delivery.ts` (in-memory only): 3s timeout, no retry yet
5. `events.ts`: subscribe to orchestrator event bus → enqueue in-memory deliveries
6. `POST /api/v1/webhooks`, `DELETE /api/v1/webhooks/{id}`, `GET /api/v1/webhooks`
7. `https`-only validation at registration
8. MCP tool: `subscribe_webhook` (tier-1)
9. Dashboard `/webhooks` page: list + delete (no DLQ surface yet)
10. Integration test: `nock` or httpbin verifies `X-Harness-Signature`

**Exit gate:** subscription created → orchestrator event fires → bridge URL receives signed POST → bridge verifies signature.

### Phase 4: Delivery Durability

<!-- complexity: high -->

_≈ week 3_

**Goal:** SQLite-backed queue with retry ladder, DLQ, idempotency guarantees, drain-on-shutdown, dashboard surface.

**Tasks:**

1. `packages/types`: `WebhookDelivery` schema
2. `packages/orchestrator/src/gateway/webhooks/queue.ts`: SQLite schema + migration helper
3. Refactor `delivery.ts`: pulls from queue, retry ladder (1/4/16/64/256s), moves to DLQ at attempt 5
4. Add `X-Harness-Delivery-Id`, `X-Harness-Event-Type`, `X-Harness-Timestamp` headers (signature already in place from Slice 3)
5. Per-subscription concurrency semaphore (default 4)
6. Drain-on-shutdown: SIGTERM handler, 30s graceful window, flush in-progress attempts back to queue as pending
7. CLI: `harness gateway deliveries list/retry/purge`
8. Dashboard `/webhooks` page: queue depth + DLQ count + retry actions
9. CI: `webhook-queue-migration` job (schema version vs code in sync)
10. Integration test: `kill -9` mid-delivery, restart, verify replay
11. `cleanup-sessions` extension to include old delivery rows (≥ retention window) — placeholder hook; Phase 2 fills retention logic

**Exit gate:** orchestrator restart test passes; 6th-failure DLQ test passes; CLI retry restores a dead delivery to pending; widget shows live counts.

### Phase 5: Telemetry Export

<!-- complexity: high -->

_≈ week 4_

**Goal:** OTLP/HTTP exporter, trajectory metadata, prompt-cache analytics. Wire `telemetry.*` events onto webhook fanout for adapter parity.

**Tasks:**

1. `packages/types`: `TrajectoryMetadata`, `PromptCacheStats`, `OTLPSpan`
2. `packages/core/src/telemetry/exporter/types.ts`: `TraceSpan` / `SpanKind` / `SpanAttributes`
3. `trajectory.ts`: builder reading `adoption.jsonl` + `AgentEvent` stream
4. `cache-metrics.ts`: hooks `anthropic.ts` (and any future backend) response handling; computes rolling hit-rate windows
5. `otlp-http.ts`: span buffer (64 spans / 2s flush) → POST `/v1/traces`; 3-attempt backoff, then drop
6. Wire orchestrator event bus → `otlp-http.ts` and ALSO → `gateway/webhooks/events.ts` as `telemetry.*` `GatewayEvent`s
7. `harness.config.json` schema: `telemetry.export.otlp` section
8. Dashboard widget at `/insights/cache.tsx`: sparkline + breakdown (standalone route until Phase 1 Insights page lands)
9. Integration test: local `otel/opentelemetry-collector-contrib` docker image; verify three trace kinds + correlation
10. Latency test: p99 added latency at dispatch call site < 5 ms with exporter enabled

**Exit gate:** OTel collector receives all three trace kinds; spans correlate end-to-end; cache widget shows non-zero hit-rate after a 10-prompt dogfood run; `telemetry.*` events visible on a test webhook subscription.

### Phase 6: Reference Slack Bridge

<!-- complexity: low -->

_≈ 2 days_

**Goal:** External test consumer at `examples/slack-echo-bridge/` that proves the Phase 0 gateway API is usable by an outside bridge author (anti-success #4). Subscribes to `maintenance.completed` webhooks, verifies HMAC SHA-256 signatures via constant-time compare, posts to Slack. Treated as the canonical example for the tunnel guide (Phase 0.2). Deferred from the initial Phase 0 ship; tracked as roadmap item "Hermes Phase 0.1".

**Tasks:**

1. `examples/slack-echo-bridge/package.json`: standalone Node project, no harness workspace deps — must be installable by an external author
2. `webhook-handler.ts`: HTTP listener for `POST /webhooks/maintenance-completed`; raw-body capture for HMAC verification
3. `signer.ts`: HMAC SHA-256 verify using constant-time compare (mirror the helper from §792); reject on missing/malformed `X-Harness-Signature`
4. `slack-client.ts`: `chat.postMessage` with configurable channel; surface Slack API errors verbatim
5. `index.ts`: wire handler → signer → slack-client; structured logs
6. `README.md`: env vars (`HARNESS_WEBHOOK_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`), local-run quickstart, pointer to tunnel guide
7. `__tests__/signer.test.ts`: valid signature accepted, invalid/missing rejected, timing-equality (constant-time) property test
8. `__tests__/webhook-handler.test.ts`: full request flow with mocked Slack client
9. Manual: subscribe the bridge to a live orchestrator via tunnel; trigger a maintenance job; verify message lands in Slack; log every API-contract friction point as a `phase-0-contract-gap` issue

**Exit gate:** Real `maintenance.completed` webhook delivered end-to-end, HMAC verified, message visible in the target Slack channel; any contract-gap issues filed are either resolved or explicitly deferred with rationale in `decisions[]`. Satisfies success-criteria §672 ("reference bridge built against the API") and §685 ("external test consumer exists").

### Step N — Finalization _(handled by autopilot's PHASE_COMPLETE + FINAL_REVIEW + DONE flow)_

After all 6 phases:

1. Run `harness:verification` three-tier (EXISTS / SUBSTANTIVE / WIRED)
2. Run `harness:integration` to ingest the new `business_concept` / `business_process` / `business_rule` nodes via knowledge pipeline
3. Land the two parent-meta-spec-named ADRs in `docs/knowledge/decisions/`
4. Reference Slack-echo bridge: see Phase 6 (deferred from initial Phase 0 ship as roadmap item "Hermes Phase 0.1")
5. README + AGENTS.md + plugin marketplace listings updated
6. Roadmap item #310 moves `in-progress → done`
7. Parent meta-spec roadmap entry status reflects Phase 0 complete; downstream phases (2/3/4) become unblocked

**Exit gate:** parent-meta-spec Phase 0 readiness gate row all checked.

### Sequencing options

| Pace                         | Description                                                                                                                                 | Time estimate |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Default (single contributor) | S0 spec → S1 → S2 → S3 → S4 → S5 → finalization                                                                                             | ≈ 4–5 weeks   |
| Two-contributor              | S0 → S1 (one contributor); S2 + S5 parallel after S1 (independent code paths); S3 + S4 sequential (S4 depends on S3)                        | ≈ 3 weeks     |
| Three-contributor            | Adds complexity coordinating S2/S3/S5 in parallel; not recommended for a foundation phase where consistency matters more than calendar time | —             |

### Triggers for re-spec

Re-decompose Phase 0 if any of these surface during execution:

1. Slice scope exceeds 1.5 weeks during implementation → split the slice, amend this section
2. Reference bridge author reports the API contract is unusable → halt Slice 4+ until contract reshaped
3. OTLP exporter cannot be made async-safe (Slice 5 latency target missed) → redesign exporter to use a worker thread
4. Auth model bug surfaces in production → security incident; roll back Slice 1 + re-spec
5. Webhook queue corruption observed → may require Slice 4 redesign (move to a more durable queue) — escalate to architecture review

In all cases: amend this spec, not silently change behavior; re-run `harness:soundness-review` on amended sections.
