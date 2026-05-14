---
type: business_process
domain: orchestrator
tags: [gateway, auth, tokens, scopes, audit, bearer, api]
phase: hermes-phase-0-phase-1
status: in-progress
---

# Gateway API Authentication Flow

Phase 1 of Hermes Phase 0 replaces the single `HARNESS_API_TOKEN` env-var auth model on the orchestrator HTTP server with a structured token store, a pinned scope vocabulary, and an append-only audit log. This document describes the Phase 1 auth substrate: what it does, why it exists, and the invariants the rest of Phase 0 (versioned routes, webhooks, telemetry export) will build on top of.

Phase 2 will add `/api/v1/*` route doubling, Phase 3 will add webhook subscriptions, Phase 5 will add telemetry export. None of those primitives are present yet; this doc covers only the auth substrate that ships in Phase 1.

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

Unmapped routes return null, which `dispatchAuthedRequest` treats as a 404 after audit. The 404 path is intentional: a route that has not been opted into the scope table is invisible to authenticated clients, not exposed-but-broken.

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

## Compatibility Headers and Modes

- **`X-Harness-Auth-Mode: unauth-dev`** — Set on every response when the orchestrator is operating in the unauth-dev fallback. Clients and operators can detect "I am not protected" without parsing the warning log.
- **Legacy `HARNESS_API_TOKEN`** — Honored as a synthetic admin token. The legacy env-var has the same semantics as before Phase 1 (no scope check, no audit-friendly identity), but every request still produces an audit line tagged `tokenId: tok_legacy_env`.

## Known Concerns and Phase 1.1 Follow-Ups

- **bcryptjs verify latency.** Measured at p99 ≈ 256ms at cost=12 on a development darwin/arm64 machine — roughly 50× the 5ms threshold the plan set for the auth hot path. The plan-anticipated mitigation is migration to `@node-rs/argon2` (or a cost reduction with a documented security trade-off) in Phase 1.1, before any deployment-worthy traffic exercises `/api/state`. Per-IP rate limiting (existing) caps the worst case at ~600 verify-ops per IP per minute.
- **OpenAPI determinism.** The Phase 1 `openapi:generate` script uses a JSON round-trip workaround inside `gateway/openapi/generate.ts` to neutralize a `yaml` anchor/alias edge case triggered by reference-equal subtrees emitted by `@asteasolutions/zod-to-openapi`. The CI drift-check workflow at `.github/workflows/openapi-drift-check.yml` regenerates and compares on every PR; if a future renovate bump breaks the workaround, the determinism test in `generate.test.ts` will fail first.

## Phase 2/3/5 Will Add

Out of scope for this document; flagged here so future readers know the boundary:

- Phase 2 — `/api/v1/*` route doubling with `Deprecation` headers on the legacy `/api/*` paths; SSE event stream at `/api/v1/events`.
- Phase 3 — Webhook subscriptions, HMAC SHA-256 delivery, retry/DLQ. New scopes: `subscribe-webhook` is reserved; webhook routes will use it.
- Phase 5 — Telemetry export via OTLP/HTTP. The `read-telemetry` scope is reserved.

When those phases land, this document expands (or splits into `webhook-fanout.md` and `telemetry-export.md` siblings under `docs/knowledge/`).
