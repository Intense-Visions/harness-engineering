---
type: business_process
domain: orchestrator
tags:
  [
    gateway,
    auth,
    tokens,
    scopes,
    audit,
    bearer,
    api,
    versioning,
    sse,
    bridge-primitives,
    webhooks,
    hmac,
  ]
phase: hermes-phase-0-phase-3
status: in-progress
---

# Gateway API Contract

Phases 1, 2, and 3 of Hermes Phase 0 deliver the orchestrator's external HTTP contract: token-scoped bearer auth on a versioned `/api/v1/*` surface, an append-only audit log, three "bridge primitive" operational endpoints, a Server-Sent Events stream for live event fan-out, and HMAC-signed webhook subscriptions for durable out-of-process delivery. This document is the business-process node for that substrate — what it does, why it exists, and the invariants the rest of Phase 0 (durable webhook delivery in Phase 4, telemetry export in Phase 5) will build on top of.

- **Phase 1** (auth substrate): structured `TokenStore`, pinned scope vocabulary, audit log, OpenAPI artifact scaffolding, three auth-admin routes.
- **Phase 2** (versioned API + bridge primitives): `/api/v1/*` aliases with `Deprecation` headers on legacy `/api/*`, three new bridge primitives (`POST /api/v1/jobs/maintenance`, `POST /api/v1/interactions/{id}/resolve`, `GET /api/v1/events` SSE), event-bus emission from the `InteractionQueue`, two MCP tools (`trigger_maintenance_job`, `list_gateway_tokens`), full OpenAPI artifact coverage of v1 routes.
- **Phase 3** (webhook subscriptions + signing, in-memory delivery): `POST /api/v1/webhooks` create with secret-once disclosure, `DELETE /api/v1/webhooks/{id}` revoke, `GET /api/v1/webhooks` list (secrets redacted), HMAC SHA-256 signing via `X-Harness-Signature: sha256=<hex>`, event-bus fan-out with segment-glob filter, MCP tool `subscribe_webhook` (tier-1), dashboard `/s/webhooks` page. Sibling node [`webhook-fanout.md`](./webhook-fanout.md) covers the fan-out pipeline in detail.
- **Phase 4** (pending): durable webhook delivery with SQLite-backed queue, exponential-backoff retry ladder, dead-letter queue, drain-on-shutdown.
- **Phase 5** (pending): telemetry export via OTLP/HTTP.

## Auth Resolution Lifecycle

When an HTTP request arrives at the orchestrator, every `/api/*` URL is funneled through `dispatchAuthedRequest` (`packages/orchestrator/src/server/http.ts`). The lifecycle has five phases:

1. **Unauth-dev fallback check** — If `.harness/tokens.json` is empty AND `HARNESS_API_TOKEN` is unset, the request resolves as a synthetic admin token (`tok_unauth_dev`). The response carries `X-Harness-Auth-Mode: unauth-dev` on every reply, and the orchestrator logs a one-time `console.warn` per process advising the operator that the API is unauthenticated. This is the localhost-development affordance — production deployments MUST configure at least one token.
2. **Bearer header parse** — Read `Authorization: Bearer <token>`. Missing or malformed header returns 401.
3. **Token verification** — Two paths:
   - **Legacy env-var path**: If `HARNESS_API_TOKEN` is set AND the bearer matches it, `TokenStore.legacyEnvToken` returns a synthetic admin record. This preserves backward compatibility for existing scripts and CI configs.
   - **Stored token path**: `TokenStore.verify` parses `tok_<id>.<base64url-secret>`, looks up the record by id, checks expiry, and `bcryptjs.compareSync`s the secret against the stored hash. Invalid tokens return 401.
4. **Scope check** — `requiredScopeForRoute(method, url)` returns a `TokenScope | null`. Null means the route has no scope mapping yet (default-deny: return 403). Otherwise `hasScope(token.scopes, required)` returns true if the token holds the required scope OR holds `admin`. Scope mismatch returns 403.
5. **Audit log append + dispatch** — `AuditLogger.append` writes a JSONL entry to `.harness/audit.log` with `{timestamp, tokenId, tenantId?, route, status, method}`. Write failures are swallowed with a `console.warn` — auditing never blocks request handling. After audit, the request dispatches to the route handler.

## Token Format and Storage

Tokens are minted by `TokenStore.create()` and follow the format `tok_<16-hex-id>.<32-byte-base64url-secret>`. Only the bcryptjs-hashed secret (cost 12) is persisted to `.harness/tokens.json`; the plaintext secret is returned exactly once on creation and never recoverable. The CLI `harness gateway token create` and the dashboard `/s/tokens` page both surface a one-time reveal flow.

The `tokens.json` file uses atomic write-and-rename (temp file + `fs.rename`) to avoid partial reads under concurrent access. The schema is enforced by `AuthTokenSchema` (`@harness-engineering/types/src/auth.ts`):

- `id: string` — `tok_[a-f0-9]{16}`, lookup key
- `name: string` — operator-supplied label (e.g. "slack-bot", "ci-dispatcher")
- `scopes: TokenScope[]` — non-empty array of values from `SCOPE_VOCABULARY`
- `hashedSecret: string` — bcryptjs hash
- `createdAt: string` — ISO-8601 timestamp
- `expiresAt?: string` — optional ISO-8601 timestamp; verify returns null if expired
- `tenantId?: string` — optional opaque tag forwarded into audit entries
- `bridgeKind?: 'slack' | 'discord' | 'github-app' | 'custom'` — labels a token as belonging to a Phase 2 bridge adapter (future)

## Scope Vocabulary

The scope vocabulary is pinned in `packages/orchestrator/src/auth/scopes.ts` and mirrored in `@harness-engineering/types/src/auth.ts`. Changes to this set require an ADR (spec decision D2). The seven scopes:

| Scope                 | Permits                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `admin`               | Everything; specifically, the only scope authorized for `/api/v1/auth/*` token admin routes |
| `trigger-job`         | Dispatch maintenance tasks, ad-hoc agents, chat proxy spawns                                |
| `read-status`         | Read orchestrator state, plans, analyses, sessions, streams, local-model status             |
| `resolve-interaction` | Answer pending `emit_interaction` questions                                                 |
| `subscribe-webhook`   | (Phase 3) Create/list/delete webhook subscriptions                                          |
| `modify-roadmap`      | Issue assigns, completes, pilot transitions                                                 |
| `read-telemetry`      | (Phase 5) Pull adoption metrics and trajectory data                                         |

The `admin` scope is a superset — `hasScope(['admin'], anyScope)` always returns true. This is what makes the unauth-dev synthetic token and the legacy `HARNESS_API_TOKEN` env compatible with every route.

## Route Ownership

The auth admin routes (`/api/v1/auth/token`, `/api/v1/auth/tokens`, `/api/v1/auth/tokens/{id}`) are owned by the **orchestrator** package (`packages/orchestrator/src/server/routes/auth.ts`). The dashboard does NOT mount a parallel TokenStore — it proxies `/api/v1/*` to the orchestrator via `packages/dashboard/src/server/orchestrator-proxy.ts`, which preserves the `Authorization` header and body. Single-writer invariant: only the orchestrator process writes `.harness/tokens.json`, eliminating the cross-process write race that an earlier dual-router architecture introduced.

Phase 2 will widen the orchestrator's `/api/v1/*` route table beyond these three auth routes. The pattern established here (handler file under `routes/`, closure entry in `OrchestratorServer.buildApiRoutes()`, scope mapping in `auth/scopes.ts`, OpenAPI registration in `gateway/openapi/registry.ts`) is what Phase 2 extends.

## Route → Scope Mapping

`requiredScopeForRoute` resolves a method+path to its required scope. The Phase 1 mapping (`packages/orchestrator/src/auth/scopes.ts`):

| Route prefix                              | Required scope        |
| ----------------------------------------- | --------------------- |
| `POST /api/v1/auth/token`                 | `admin`               |
| `GET /api/v1/auth/tokens`                 | `admin`               |
| `DELETE /api/v1/auth/tokens/{id}`         | `admin`               |
| `GET /api/state`, `GET /api/v1/state`     | `read-status`         |
| `/api/interactions/*`                     | `resolve-interaction` |
| `/api/plans/*`                            | `read-status`         |
| `/api/analyze`, `/api/analyses/*`         | `read-status`         |
| `/api/roadmap-actions/*`                  | `modify-roadmap`      |
| `/api/dispatch-actions/*`                 | `trigger-job`         |
| `/api/local-model*`, `/api/local-models*` | `read-status`         |
| `/api/maintenance/*`                      | `trigger-job`         |
| `/api/streams/*`                          | `read-status`         |
| `/api/sessions/*`                         | `read-status`         |
| `/api/chat-proxy/*`                       | `trigger-job`         |
| `POST /api/v1/jobs/maintenance`           | `trigger-job`         |
| `POST /api/v1/interactions/{id}/resolve`  | `resolve-interaction` |
| `GET /api/v1/events`                      | `read-telemetry`      |
| `POST /api/v1/webhooks`                   | `subscribe-webhook`   |
| `DELETE /api/v1/webhooks/{id}`            | `subscribe-webhook`   |
| `GET /api/v1/webhooks`                    | `subscribe-webhook`   |

The `/api/v1/<slug>(/...)` aliases for the twelve wrappable legacy routes (interactions, plans, analyze, analyses, roadmap-actions, dispatch-actions, local-model, local-models, maintenance, streams, sessions, chat-proxy) inherit the legacy route's scope mapping via the URL rewrite — the scope table does not need separate entries for the v1 aliases.

Unmapped routes return null, which `dispatchAuthedRequest` treats as a 403 after audit (default-deny per ADR 0011 line 30). A route that has not been opted into the scope table is rejected, not exposed-but-broken.

## Audit Log Shape

`.harness/audit.log` is a JSONL file written best-effort by `AuditLogger`. Each line is an `AuthAuditEntry`:

```json
{
  "timestamp": "2026-05-14T12:34:56.789Z",
  "tokenId": "tok_a1b2c3d4e5f60718",
  "tenantId": "slack-bridge",
  "route": "/api/v1/state",
  "method": "GET",
  "status": 200
}
```

Invariants the spec pins (S1 exit gate):

- Every request produces exactly one audit line — including 401 (no token), 403 (wrong scope), and 404 (no route match). The `tokenId` field becomes the literal string `"anonymous"` when auth failed before token resolution.
- Request payload, response body, query params with secrets — none of these appear. Only `route` (the path with query string stripped), `method`, and `status` are recorded.
- Write failures (`ENOSPC`, `EACCES`, disk full) emit a `console.warn` and DO NOT throw. Auditing must never break the request loop.

The append uses an in-process serialization queue (`this.queue = this.queue.then(...)`) to prevent interleaved writes from concurrent requests. Cross-process serialization would require an external coordinator; Phase 1 assumes a single orchestrator process per `.harness/` directory (consistent with the single-machine-deployment assumption baked into other subsystems).

## API Versioning (Phase 2)

Phase 2 introduces the versioned `/api/v1/*` surface. Every legacy `/api/<name>(/...)` route is reachable at `/api/v1/<name>(/...)` with identical request/response semantics. The implementation is a URL rewrite inside `dispatchAuthedRequest` (`packages/orchestrator/src/server/http.ts:413-435`) — a single `V1_WRAPPABLE` `Set` lists the twelve legacy slugs that may be reached under `/api/v1/`:

```
interactions, plans, analyze, analyses, roadmap-actions, dispatch-actions,
local-model, local-models, maintenance, streams, sessions, chat-proxy
```

When `req.url` matches `^/api/v1/<slug>(...)`, the slug is checked against `V1_WRAPPABLE` and (on hit) the URL is rewritten in place to `/api/<slug>(...)` before the route table runs. Per-handler v1-prefix awareness was rejected (12 file edits + test churn for no behavior gain — see spec cross-cutting decision D7). The `/api/state` route is special-cased by an inlined shortcut that accepts both `/api/state` and `/api/v1/state` without going through the rewrite, because state is a hot-path snapshot route.

The legacy `/api/*` paths still respond, but every response carries:

```
Deprecation: 2027-05-14
```

(or whatever `process.env.HARNESS_DEPRECATION_DATE` overrides it to). The gating logic keys off the **pre-rewrite** URL: `dispatchAuthedRequest` captures `v1Match` from the raw `req.url` before rewriting, then sets the header only when the original URL was `/api/<name>` (not `/api/v1/<name>`). This pre-rewrite capture is the load-bearing invariant — without it, a v1 request that landed via the rewrite would also get the legacy header. See `http-v1-aliases.test.ts` for the table-test that verifies every alias on both code paths.

Removal of the legacy `/api/*` prefix is scheduled for either an eventual `/api/v2` cutover or 12 months after the Phase 0 GA milestone, whichever comes first. Until then, legacy paths are first-class — `Deprecation` is a signal, not an enforcement.

## Bridge Primitives (Phase 2)

Three operational endpoints land in Phase 2 to satisfy the external-bridge use cases the Hermes proposal anchors on (Slack/Discord/GitHub-App ops, AI agent maintenance dispatch, live event subscription). Each lives under `packages/orchestrator/src/server/routes/v1/`.

### `POST /api/v1/jobs/maintenance` — trigger a maintenance task

- **Scope:** `trigger-job`
- **Body:** `{ taskId: string }` (taskId must exist in the maintenance task registry)
- **Success:** `200 { ok: true, taskId, runId }` — dispatches via the existing `Orchestrator.dispatchAdHoc` triggerFn so the WS + SSE fan-out fires the same `maintenance:started`/`completed` frames a scheduled run would
- **Errors:** `404` (unknown taskId), `409` (a run of the same task is already in flight)

This is the "kick the build" primitive — bridges call it to trigger arch-violations, doc-drift, dependency-health, etc. on demand.

### `POST /api/v1/interactions/{id}/resolve` — resolve a pending interaction

- **Scope:** `resolve-interaction`
- **Body:** none (the resolution is the act of calling)
- **Success:** `200 { resolved: true }` — invokes `InteractionQueue.updateStatus(id, 'resolved')`, which writes the file AND emits `interaction.resolved` on the orchestrator's event bus
- **Errors:** `404` (unknown id), `409` (already resolved)

This is what answers a pending `emit_interaction` question — bridges expose this to humans via Slack approve-buttons, GitHub PR-comment reactions, etc.

### `GET /api/v1/events` — Server-Sent Events stream

- **Scope:** `read-telemetry`
- **Requires:** `Accept: text/event-stream`
- **Response:** Long-lived stream of SSE frames; see "SSE Event Bus" below

These three routes plus the three Phase 1 auth-admin routes (`POST /api/v1/auth/token`, `GET /api/v1/auth/tokens`, `DELETE /api/v1/auth/tokens/{id}`) are the only Phase 2 routes the OpenAPI artifact documents _natively_; the ten legacy aliases are catalogued but inherit their request/response shapes from the legacy handlers (response-schema upgrade for the aliases is deferred to the `/api/v2` cutover per plan risk #5). Phase 3 added two more natively-documented routes (`/api/v1/webhooks` POST+GET on the same path; `/api/v1/webhooks/{id}` DELETE), bringing the artifact's path count to 18.

## SSE Event Bus (Phase 2)

`GET /api/v1/events` is the live event channel external consumers subscribe to. Implementation: `packages/orchestrator/src/server/routes/v1/events-sse.ts`. Topology:

- **Source:** the orchestrator instance itself — `Orchestrator extends EventEmitter` (`packages/orchestrator/src/orchestrator.ts`). The SSE handler `bus.on(topic, ...)` against the same emitter the rest of the orchestrator emits onto.
- **Topics fanned out (11 after Phase 3):** `state_change`, `agent_event`, `interaction.created`, `interaction.resolved`, `maintenance:started`, `maintenance:completed`, `maintenance:error`, `maintenance:baseref_fallback`, `local-model:status`, plus Phase 3's `webhook.subscription.created` and `webhook.subscription.deleted`.
- **Frame format:** SSE-standard with cursor IDs:

  ```
  event: <topic>
  data: <JSON-encoded payload>
  id: evt_<8-byte-hex>

  ```

  IDs are minted via `crypto.randomBytes(8).toString('hex')` and prefixed `evt_`. Reconnection-via-`Last-Event-ID` is reserved for Phase 4 (durable webhook queue lands the same persistence layer).

- **Heartbeat:** 15-second `: heartbeat\n\n` comment frames keep proxies and load balancers from idling out the connection. The heartbeat timer is `.unref()`'d so it never blocks process exit.
- **Proxy-buffer defeat:** `X-Accel-Buffering: no` is set on the response so nginx, Cloudflare, and similar proxies stream rather than buffer.
- **Cleanup:** On `close` and `finish`, the handler `removeListener`s every subscribed topic and clears the heartbeat interval — no listener leak on disconnect.
- **EventEmitter ceiling:** Node's default `defaultMaxListeners` is 10, which collides with the 9-topic subscribe-on-connect pattern. `Orchestrator.constructor` calls `this.setMaxListeners(50)` (raised from the default) and the orchestrator integration tests pin `getMaxListeners() >= 50` so this invariant cannot silently regress.

### Event-bus single-emission via `InteractionQueue` constructor injection

The `interaction.created` / `interaction.resolved` topics are emitted exclusively by `InteractionQueue`. The wiring (`InteractionQueue.constructor(dir, emitter?)`) accepts an optional `EventEmitter`; when present, `push()` emits `interaction.created` and `updateStatus(id, 'resolved')` emits `interaction.resolved`. `Orchestrator.constructor` passes `this` into the queue, so the queue and the SSE handler share a single bus.

The WebSocket broadcaster (`server.broadcastInteraction`) continues to run **alongside** the event-bus emission for legacy dashboard consumers; the two are independent channels with the same payload. See commit `16a88281` for the inline annotation at the dual-channel call site. There is no plan to rip out the WebSocket fan-out — it serves the dashboard's existing dependency and is cheaper than forcing a migration during Phase 2.

## MCP Tools (Phase 2)

Two new MCP tools are registered in `packages/cli/src/mcp/tools/gateway-tools.ts` and wired through `packages/cli/src/mcp/server.ts`:

| Tool                      | Tier                     | Effect                          |
| ------------------------- | ------------------------ | ------------------------------- |
| `trigger_maintenance_job` | **tier-1** (`standard+`) | `POST /api/v1/jobs/maintenance` |
| `list_gateway_tokens`     | **tier-0** (`core+`)     | `GET /api/v1/auth/tokens`       |

Tier assignments live in `packages/cli/src/mcp/tool-tiers.ts` — `list_gateway_tokens` in `CORE_TOOL_NAMES` (line 26), `trigger_maintenance_job` in `STANDARD_EXTRA` (line 57). Phase 3 added `subscribe_webhook` at tier-1 (`STANDARD_EXTRA` line 58); the tool-tiers tests assert tool-count totals across `server.test.ts` / `server-integration.test.ts` / `setup-mcp.test.ts` so drift on additions or removals fails the test suite.

## Webhook Subscriptions (Phase 3)

Phase 3 adds **out-of-process, HMAC-authenticated event delivery** to the gateway. Where SSE is the live-only channel a client subscribes to while connected, webhooks are persistent subscriptions stored on the orchestrator — the event-bus fans out to every matching subscription on every emit. Subscription-level routing happens via segment-glob patterns; delivery is signed with a per-subscription secret. Phase 3 ships the surface; Phase 4 will add the durable queue, retry ladder, and dead-letter queue described in spec D7.

### Routes (3)

Handlers in `packages/orchestrator/src/server/routes/v1/webhooks.ts`. The path-method pairs and their scopes also live in `V1_BRIDGE_ROUTES` (`packages/orchestrator/src/server/v1-bridge-routes.ts`) — the single source of truth that both the route mounting in `buildApiRoutes()` and the scope resolver in `scopes.ts` consume (closes DELTA-SUG-1).

| Route                          | Scope               | Behavior                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/webhooks`        | `subscribe-webhook` | Create a subscription. Body `{ url: string (https only), events: string[] }`. URL must be https:// and must not target private or loopback addresses (rejected with 422 otherwise; the integration test bypasses this validator at the store layer). Response (200) `{ id, tokenId, url, events, secret, createdAt }` — **the only time `secret` is ever returned**. |
| `DELETE /api/v1/webhooks/{id}` | `subscribe-webhook` | Delete a subscription. 204 on success, 404 if unknown. Token scope must be `subscribe-webhook` (or `admin`).                                                                                                                                                                                                                                                         |
| `GET /api/v1/webhooks`         | `subscribe-webhook` | List subscriptions for the bearer token's `tokenId`. Response items have exactly `{id, tokenId, url, events, createdAt}` — `secret` and `hashedSecret` are stripped via positive Object.keys allow-list assertion + a JSON-stringify negative `/secret/i` regex (DELTA-SUG-2 belt-and-braces).                                                                       |

### Storage model: `.harness/webhooks.json` mode 0600

`WebhookStore` (`packages/orchestrator/src/gateway/webhooks/store.ts`) persists subscriptions to `.harness/webhooks.json` with `fs.chmod(path, 0o600)` after every write. Secrets are stored **plaintext at rest** — this is a deliberate decision documented in ADR 0011's "Webhook secret storage model (Phase 3)" addendum. The rationale: the industry pattern at single-tenant scope is infrastructure-layer encryption (FDE, etcd-at-rest) rather than application-layer, because the decryption key has to live somewhere the orchestrator process can read at startup and that location is almost always reachable by the same attacker who can read `.harness/`. Three mitigations: file mode 0600, `.gitignore` excludes `**/.harness/webhooks.json`, and the spec's delete-and-recreate rotation model neatly sidesteps key-rotation. See ADR 0011 § "Webhook secret storage model (Phase 3)" for full alternatives-rejected analysis and the external-secrets-backend escape hatch for a future hosted runtime.

Secret format: 32 random bytes hex-encoded, generated server-side via `crypto.randomBytes(32).toString('hex')`. The plaintext is returned exactly once in the create response and is never recoverable through the API.

### HMAC SHA-256 signing

The webhook signer (`packages/orchestrator/src/gateway/webhooks/signer.ts`) signs the **verbatim request body** with the subscription's secret. The signature header format:

```
X-Harness-Signature: sha256=<lowercase-hex>
```

Each delivery POSTs a serialized `GatewayEvent` envelope (`@harness-engineering/types`) and carries four canonical headers:

| Header                  | Format                                                  |
| ----------------------- | ------------------------------------------------------- |
| `X-Harness-Signature`   | `sha256=<lowercase-hex>` of HMAC-SHA256(secret, body)   |
| `X-Harness-Delivery-Id` | `dlv_<8-byte-hex>` (per-delivery, not per-subscription) |
| `X-Harness-Event-Type`  | The normalized event type (e.g. `maintenance.started`)  |
| `X-Harness-Timestamp`   | Unix millis at delivery emit, stringified               |

**Body-verbatim contract.** The signature is computed against the exact bytes POSTed. Bridges MUST verify the signature against the raw request body BEFORE parsing JSON — any normalization (whitespace collapse, key re-ordering by a parser) breaks the signature. The integration test at `packages/orchestrator/src/server/webhooks-integration.test.ts:40-51` records exactly what the orchestrator POSTed and recomputes the HMAC against that recorded buffer; this IS the spec exit-gate proof.

**~5-line bridge verification snippet** (Node, but the algorithm is portable):

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
function verifyHmac(secret, rawBody, headerSig) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(headerSig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Any HMAC-SHA256 primitive plus constant-time string compare can drop in identically. The verification helper in `signer.ts:21-31` and the inlined helper at `webhooks-integration.test.ts:40-51` are byte-equivalent; the second exists to prove the contract holds when the bridge has no access to harness internals.

### Event-bus fan-out with segment-glob filter

`wireWebhookFanout` (`packages/orchestrator/src/gateway/webhooks/events.ts`) subscribes to 9 orchestrator event topics on the same `EventEmitter` the SSE handler uses. When a topic emits, the fan-out queries `store.listForEvent(eventType)` for every subscription whose `events[]` pattern matches via segment-glob (`eventMatches` in `signer.ts:43-51`), then dispatches a delivery per match. The filter is synchronous and runs on every emit so revocation (via DELETE) takes effect immediately — the integration test pins zero deliveries within 200 ms after `store.delete(sub.id)`.

**Topic normalization.** The orchestrator emits 3 topics with colon separators inherited from earlier callsites (`maintenance:started`, `maintenance:completed`, `maintenance:error`). The fan-out normalizes these to dotted form (`maintenance.started`) BEFORE running the segment-glob filter, so a subscription with `events: ['maintenance.*']` matches all three (`packages/orchestrator/src/gateway/webhooks/events.ts:47`). New topics added in Phase 3+ should be dotted at the source so the normalization layer can be retired once the colon-separated topics fade.

**Segment-glob semantics** (intentionally narrow — `**` and other minimatch features out of scope):

- `interaction.*` matches `interaction.created` (true), `interaction.foo.bar` (false — segment count mismatch).
- `*` matches any single-segment type.
- `*.*` matches any two-segment type.

**Phase 3 delivery is in-memory and best-effort.** Each delivery has a 3-second timeout (`packages/orchestrator/src/gateway/webhooks/delivery.ts:22`). Failures (non-2xx response, network error, timeout) are logged with `console.warn` and dropped — there is no retry, no persistent queue, no dead-letter handling. Phase 4 will add SQLite-backed persistence, an exponential-backoff retry ladder (1s / 5s / 25s / 2m / 10m / 1h with jitter), a DLQ for subscriptions that fail consistently, and drain-on-shutdown so in-flight deliveries complete before SIGTERM resolves. The `WebhookDelivery.deliver(sub, event)` API shape is intentionally the same Phase 4 will subclass, so the swap is purely additive (no breaking changes to fan-out callers).

See sibling node [`webhook-fanout.md`](./webhook-fanout.md) for the in-depth fan-out pipeline reference (subscription lifecycle, topic registry, delivery worker contract, Phase 4 extension points).

### Dashboard `/s/webhooks` page

`packages/dashboard/src/client/pages/Webhooks.tsx` provides list / create / revoke UX. The page calls `/api/v1/webhooks` directly (via the dashboard's orchestrator proxy). Create flow: POST returns the secret once; the page renders it inside a "treat this as a credential" reveal panel that disappears on navigation. List flow: GET returns secret-redacted public-shape items. Revoke flow: DELETE per id. The page is registered in `SYSTEM_PAGES` (`packages/dashboard/src/client/types/thread.ts:67`) as `{ page: 'webhooks', label: 'Webhooks', route: '/s/webhooks' }` (12th entry) and bound in `ThreadView.tsx:40` (`webhooks: Webhooks`).

**Browser-auth carry-forward inherited from Phase 2.** The `/s/webhooks` page inherits the same `dashboard-browser-auth-context` gap `/s/tokens` carries: browser-originated fetches do not attach `Authorization` headers, relying on the orchestrator-proxy to forward whatever the browser sends. In localhost-dev the unauth-dev fallback admits the request; in production with a configured admin token, browser-initiated calls would 401. A cookie-bound dashboard session that mints a short-lived dashboard-only bearer at login is still pending; Phase 4 should address or escalate.

## Compatibility Headers and Modes

- **`X-Harness-Auth-Mode: unauth-dev`** — Set on every response when the orchestrator is operating in the unauth-dev fallback. Clients and operators can detect "I am not protected" without parsing the warning log.
- **Legacy `HARNESS_API_TOKEN`** — Honored as a synthetic admin token. The legacy env-var has the same semantics as before Phase 1 (no scope check, no audit-friendly identity), but every request still produces an audit line tagged `tokenId: tok_legacy_env`.
- **`Deprecation: <ISO-date>`** — Set on every response from a legacy `/api/<name>` route (not on `/api/v1/<name>`). Default `2027-05-14`; override via `HARNESS_DEPRECATION_DATE` env-var.

## Known Concerns and Follow-Ups

### Phase 1 carry-forwards (still open)

- **bcryptjs verify latency.** Measured at p99 ≈ 256ms at cost=12 on a development darwin/arm64 machine — roughly 50× the 5ms threshold the plan set for the auth hot path. The plan-anticipated mitigation is migration to `@node-rs/argon2` (or a cost reduction with a documented security trade-off) in Phase 1.1, before any deployment-worthy traffic exercises `/api/state`. Per-IP rate limiting (existing) caps the worst case at ~600 verify-ops per IP per minute.
- **OpenAPI determinism.** The Phase 1 `openapi:generate` script uses a JSON round-trip workaround inside `gateway/openapi/generate.ts` to neutralize a `yaml` anchor/alias edge case triggered by reference-equal subtrees emitted by `@asteasolutions/zod-to-openapi`. The CI drift-check workflow at `.github/workflows/openapi-drift-check.yml` regenerates and compares on every PR; if a future renovate bump breaks the workaround, the determinism test in `generate.test.ts` will fail first.
- **Dashboard browser auth context (Phase 2 scope, not closed).** `Tokens.tsx` and other browser-side fetch calls do not currently attach `Authorization` headers — they rely on the dashboard's `orchestrator-proxy.ts` forwarding whatever `Authorization` header the browser sends. In localhost-dev this works because the unauth-dev fallback admits unauthenticated requests; in production deployments with a configured token, browser-initiated calls would 401 (no bearer reaches the orchestrator). A cookie-bound dashboard session that mints a short-lived dashboard-only bearer at login and forwards it via the proxy is still pending. Tracked in the session learnings as `dashboard-browser-auth-context`.

### Phase 2 carry-forwards (new)

- **`scopes.ts:requiredScopeForRoute` complexity growth.** Phase 1 reported cyclomaticComplexity=22; Phase 2 Task 4 (scope mappings for the new bridge primitives) raised it to **cc=28**. The check-arch metric is informational (above the 15 threshold, error severity) but `harness validate` continues to pass. Backlog suggestion: split the function by route prefix (`/api/v1/auth/*` resolver, `/api/v1/jobs/*` resolver, etc.) so each branch is independently testable; the table-driven shape is already there, just needs an extraction pass.
- **`v1-registry.ts:buildV1Registry` long-function warning.** Phase 2 Task 9 registers 16 routes inline (3 auth + 3 bridge + 10 documented aliases); the OpenAPI schema literals inherent to that registration produce `functionLength=101` and `nestingDepth=6`, both check-arch warnings. The underlying signals (schema literals) are inherent to the contract, not a code-smell — backlog suggestion is to mechanically split into per-prefix `registerAuthPaths`, `registerBridgePaths`, `registerLegacyAliasPaths` functions rather than try to compress the literals themselves.
- **opencode plugin platform gap.** The slash-command generator (`packages/cli/src/commands/generate-slash-commands.ts:40-48`) registers four platforms (claude-code, gemini-cli, cursor, codex). The plan named `opencode` as a fifth target, but its plugin package lives outside the monorepo and is not a registered platform here. Phase 2 ships generator coverage for the four in-repo platforms (38 files each); the opencode artifact is a carry-forward, not a blocker. Resolution: either register opencode as a fifth platform here (preferred — the manifest shape is portable) or accept the gap until the opencode plugin package adopts the harness slash-command schema.
- **OpenAPI path count drift vs plan brief.** The Phase 2 plan brief targeted "18 paths (3+12+3)"; the actual artifact has 16 (3 auth + 3 bridge + 10 documented legacy aliases). Two slugs from the legacy set don't get full alias path entries in the registry (the catalogued-but-not-modelled legacy aliases — analyze, roadmap-actions, dispatch-actions, chat-proxy, plus the maintenance routes which split into history/status pairs rather than a single maintenance entry). This is intentional drift per plan risk #5 ("legacy alias response schemas deferred to /api/v2"); the routes ARE reachable through the rewrite and ARE audited, they are just not modelled in the artifact yet.
- **Working-tree pollution during multi-agent runs.** The autopilot session noted `maxConcurrentAgents=0` is intentional for this user's setup; nothing to fix here. Recorded for future autopilot dispatchers as expected-non-error state.

## Known Concerns and Follow-Ups (Phase 3 additions)

### Phase 3 carry-forwards (new)

- **`phase-3-typecheck-not-in-task-gate` (medium).** Three TS errors in `orchestrator.ts` survived 12 task commits because vitest doesn't invoke `tsc` (esbuild is transpile-only). The phase-exit `pnpm -r typecheck` caught them, but per-task quality gates run by `harness-execution` (harness validate + check-deps + vitest) do not. Recommendation for Phase 4 plan's quality-gate definition: include `tsc --noEmit` per-task (cheap, scoped to touched package) or hard-fail `pnpm -r typecheck` at phase-exit. Fixed inline in Task 14 (`2b47ba3b`).
- **`phase-3-arch-hook-noise` (low, informational).** Pre-commit lint-staged arch check reports NEW: violations against a stale baseline diff, but standalone `harness check-arch` reports `28 violation(s) resolved since baseline`. Hook output is misleading at commit time; rely on the standalone check for the authoritative signal.
- **`phase-3-slash-command-coverage-gap` (low, backlog).** `pnpm harness generate-slash-commands` covers 2 of 4 host targets (claude-code + gemini-cli); cursor + codex have command dirs maintained outside the generator; opencode is unregistered (ADR 0011 Phase 2 carry-forward). Adding `subscribe_webhook` to the MCP registry is invisible at the slash-command layer because manifests describe SKILLS, not raw MCP tool names — Task 13 was a documented no-op as a result.

## Phase 4/5 Will Add

Out of scope for this document; flagged here so future readers know the boundary:

- **Phase 4** — Durable webhook delivery. SQLite-backed delivery queue, exponential-backoff retry ladder (1s/5s/25s/2m/10m/1h with jitter), dead-letter queue for subscriptions that fail consistently, drain-on-shutdown so in-flight deliveries complete before SIGTERM resolves, and `Last-Event-ID` reconnection support on the SSE channel (same persistence layer). The `WebhookDelivery.deliver(sub, event)` API shape is already what Phase 4 will subclass — the swap is purely additive.
- **Phase 5** — Telemetry export via OTLP/HTTP. The `read-telemetry` scope is reserved.

When those phases land, this document expands further — the sibling [`webhook-fanout.md`](./webhook-fanout.md) is the dedicated landing zone for Phase 4 material (durable queue, retry ladder, DLQ, drain semantics).
