---
number: 0011
title: Orchestrator Gateway API contract
date: 2026-05-13
status: in-progress
tier: large
source: docs/changes/hermes-phase-0-gateway-api/proposal.md
---

## Context

The orchestrator HTTP server (`packages/orchestrator/src/server/http.ts`) historically exposed an unversioned `/api/*` surface protected by a single shared-secret environment variable, `HARNESS_API_TOKEN`. This was sufficient when the only consumer was the local dashboard, but Phase 0 of the Hermes proposal commits to a much wider surface: external bridge adapters (Slack, Discord, GitHub Apps), webhook fan-out to subscribers, and OpenTelemetry export from the dispatch hot path.

Two pressures collided on this surface at the start of Phase 0:

1. **External-consumer compatibility.** A stable, versioned, machine-readable contract is needed so adapters can be built and maintained independently of orchestrator releases. Without versioning and a published artifact, every bridge couples to internal route shapes.
2. **Multi-tenant credential isolation.** A single shared secret cannot support per-bridge identity, per-bridge revocation, or audit attribution. Scoped tokens are required before any of the Phase 2/3/5 primitives can be exposed safely.

This ADR records the contract decisions locked in **Phase 1 (Auth Foundation + OpenAPI Scaffolding)**. The contract spans Phases 1, 2, and 3 of the Hermes proposal; this ADR will be updated to status `accepted` once Phase 3 lands the webhook surface that completes the contract. Until then, it captures the decisions that are already implemented and that downstream phases must build on.

## Decision

The orchestrator gateway API contract has four pillars. Phase 1 (this commit) locks the first two and bootstraps the fourth.

### 1. Token-scoped bearer auth (Phase 1 — locked)

Every request to `/api/*` is funneled through `dispatchAuthedRequest`, which:

- Reads `Authorization: Bearer tok_<id>.<base64url-secret>` and verifies the secret against a bcryptjs-hashed record in `.harness/tokens.json` via `TokenStore`.
- Maps `(method, path)` to a `TokenScope | null` via `requiredScopeForRoute`. Null is default-deny.
- Resolves the request as admin if the orchestrator is in unauth-dev mode (tokens.json empty AND `HARNESS_API_TOKEN` unset) and surfaces this via `X-Harness-Auth-Mode: unauth-dev` plus a one-time `console.warn`.
- Preserves the legacy `HARNESS_API_TOKEN` env-var as a synthetic admin token for backward compatibility.

The scope vocabulary is pinned (`SCOPE_VOCABULARY` in `packages/orchestrator/src/auth/scopes.ts`):

```
admin, trigger-job, read-status, resolve-interaction,
subscribe-webhook, modify-roadmap, read-telemetry
```

Adding, removing, or renaming a scope requires a follow-up ADR.

### 2. Audit log (Phase 1 — locked)

Every request — authenticated, rejected, or unmatched — produces exactly one JSONL line in `.harness/audit.log` via `AuditLogger`. The shape is `{timestamp, tokenId, tenantId?, route, method, status}`. The log records WHO + WHAT route + WHAT result, never WHAT payload. Write failures degrade silently so audit never blocks request handling.

**Route ownership corollary (Phase 1 review-fix cycle).** The auth admin routes (`POST /api/v1/auth/token`, `GET /api/v1/auth/tokens`, `DELETE /api/v1/auth/tokens/{id}`) are owned by the **orchestrator** package — handlers live in `packages/orchestrator/src/server/routes/auth.ts` and are registered in `OrchestratorServer.buildApiRoutes()`. The dashboard does NOT mount a parallel `TokenStore`; it proxies the `/api/v1` prefix to the orchestrator via `packages/dashboard/src/server/orchestrator-proxy.ts`. This decision was solidified in commits `e3430cec` (orchestrator handlers) and `0f7ac0b4` (dashboard proxy + parallel router removal) after Phase 1 review surfaced three findings the dual-router architecture caused: `dashboard-tokens-unauthenticated` (critical, AC#8), `dashboard-tokens-write-race` (important), and `dashboard-tokens-error-leak` (important). Single-writer invariant on `.harness/tokens.json` is now structural, not coincidental. The orchestrator's auth middleware + scope gate is the single chokepoint for all token-CRUD requests, which makes pillar 1 (token-scoped bearer auth) and pillar 2 (audit log) hold uniformly — including for browser-initiated traffic — without per-host re-implementation.

### 3. Versioned route surface (Phase 2 — landed)

Every legacy `/api/*` route is doubled at `/api/v1/*`. Legacy paths emit a `Deprecation: <ISO-date>` header (default `2027-05-14`, override via `HARNESS_DEPRECATION_DATE`). New routes added during Phase 2+ live only under `/api/v1/`. A second contract version (`/api/v2/`) will only ship when a breaking change is unavoidable; rolling forward through additive `/api/v1/` extensions is the strong default.

**Phase 2 amendment.** The versioning surface landed via URL rewrite inside `dispatchAuthedRequest` (`packages/orchestrator/src/server/http.ts:413-446`). A `V1_WRAPPABLE` set of twelve legacy slugs (`interactions, plans, analyze, analyses, roadmap-actions, dispatch-actions, local-model, local-models, maintenance, streams, sessions, chat-proxy`) gates the rewrite; `/api/v1/state` is special-cased via an inlined shortcut. The `Deprecation` header gating keys off the **pre-rewrite** URL — `dispatchAuthedRequest` captures the `v1Match` regex before rewriting, then stamps the header only when the original URL was `/api/<name>` and not `/api/v1/<name>`. This pre-rewrite capture is the load-bearing invariant: without it, a v1 request that landed via the rewrite would also be marked deprecated. Per-handler v1-prefix awareness was rejected (twelve file edits + test churn for no behavior gain; spec D7).

In the same phase, three new operational endpoints landed natively under `/api/v1/` — the **bridge primitives**:

- `POST /api/v1/jobs/maintenance` (scope `trigger-job`) — dispatches a maintenance task via `Orchestrator.dispatchAdHoc`; 200 / 404 / 409.
- `POST /api/v1/interactions/{id}/resolve` (scope `resolve-interaction`) — invokes `InteractionQueue.updateStatus(id, 'resolved')`; 200 / 404 / 409.
- `GET /api/v1/events` (scope `read-telemetry`) — Server-Sent Events stream of the orchestrator event bus.

The SSE transport is the v1-events delivery channel. Frames are SSE-standard with `evt_<hex>` cursor IDs; nine event topics fan out (`state_change`, `agent_event`, `interaction.created`, `interaction.resolved`, `maintenance:started`, `maintenance:completed`, `maintenance:error`, `maintenance:baseref_fallback`, `local-model:status`); 15-second heartbeat comment frames; `X-Accel-Buffering: no` defeats proxy buffering. Reconnection-via-`Last-Event-ID` is deferred to Phase 4 when the durable webhook queue lands the same persistence layer.

The `interaction.created` and `interaction.resolved` topics are emitted by `InteractionQueue` exclusively. The constructor now accepts an optional `EventEmitter` and `Orchestrator.constructor` passes `this` (Orchestrator extends EventEmitter) into the queue, giving the queue and the SSE handler a single bus. The WebSocket broadcaster (`server.broadcastInteraction`) continues to run alongside event-bus emission for legacy dashboard consumers — no rip-out planned. Node's `defaultMaxListeners=10` collided with the nine-topic subscribe-on-connect pattern; `Orchestrator.constructor` calls `this.setMaxListeners(50)` and the orchestrator integration tests pin `getMaxListeners() >= 50` so this invariant cannot silently regress.

Webhooks (Phase 3) will be the **durable** counterpart to SSE's live-only delivery — SSE is the read-telemetry stream a client subscribes to while connected; webhooks will be a persistent subscription with HMAC signatures and at-least-once delivery. The two channels are complementary, not redundant.

**Architectural cleanup at the Phase 2 exit gate.** Commit `3736eac5` closed two circular dependencies that `harness check-deps` flagged after Task 13: `packages/orchestrator/src/gateway/* <-> packages/orchestrator/src/server/*` paths created by the inlined OpenAPI schema imports. The fix routed the shared types through `packages/types/` and removed direct cross-imports between `gateway/` and `server/`. This reinforces the architectural intent — `gateway/` is the contract surface (OpenAPI registry, schemas, generation); `server/` is the wire surface (route handlers, dispatch, audit). The boundary between them was always meant to be one-way (server depends on gateway types; never the reverse).

### 4. OpenAPI artifact generation (Phase 1 — bootstrapped)

The contract is published as a vendored OpenAPI 3.1.0 artifact at `docs/api/openapi.yaml`. Generation is driven from Zod schemas via `@asteasolutions/zod-to-openapi`; the registry lives at `packages/orchestrator/src/gateway/openapi/registry.ts` and the emitter at `gateway/openapi/generate.ts`. The npm script `openapi:generate` regenerates the artifact deterministically; CI workflow `.github/workflows/openapi-drift-check.yml` rejects PRs that change the generator without committing the regenerated YAML.

The Phase 1 artifact covers only the three auth-admin routes (`POST /api/v1/auth/token`, `GET /api/v1/auth/tokens`, `DELETE /api/v1/auth/tokens/{id}`). Each subsequent phase appends to the registry; the drift-check workflow ensures the artifact never lags the code.

## Status: in-progress

Phases 1, 2, and 3 have shipped pillars 1, 2, 3 (with one residual: legacy alias response schemas in the artifact, deferred to `/api/v2` per plan risk #5), and 4 (registry now covers all 18 `/api/v1/*` paths in the artifact — 3 auth + 3 bridge primitives + 10 documented legacy aliases + 2 webhook routes; `/api/v1/webhooks` is POST+GET on the same path, `/api/v1/webhooks/{id}` is DELETE only). Phase 3 added the webhook subscription/signing/in-memory-delivery surface, but the ADR remains in-progress until Phase 4 (durable webhook delivery, at-least-once semantics, SQLite-backed queue) and Phase 5 (telemetry export) land — those phases close out the "every `/api/v1/*` route is contracted _and_ operationally durable" criterion that promotes this ADR to `accepted`.

While in-progress, additive decisions inside the same four pillars may be appended below without superseding the ADR. Structural changes (a new pillar, a breaking change to the scope vocabulary, a switch off OpenAPI as the contract substrate) require a new ADR that supersedes this one.

## Consequences

**Positive:**

- External adapters can be built against a published, versioned contract without coupling to orchestrator internals.
- Per-token identity enables per-bridge revocation, per-bridge audit, and (in Phase 3) per-bridge webhook subscriptions.
- The scope vocabulary is small and discoverable. Default-deny on unmapped routes means new routes cannot accidentally inherit public access.
- The CI drift-check turns artifact freshness into a mechanical guarantee instead of a code-review checklist item.

**Negative:**

- bcryptjs cost=12 verification is far slower than the plan's 5ms target (measured p99 ≈ 256ms). Phase 1.1 must migrate to `@node-rs/argon2` or tune cost before the auth hot path sees deployment-worthy load. Per-IP rate limiting protects against unbounded CPU consumption but does not solve perceived latency for legitimate clients.
- Every new route requires a scope mapping. Forgetting to extend `requiredScopeForRoute` makes the route inaccessible (default-deny). This is the safer failure mode but produces a "feature works locally, 404s in CI" foot-gun if a developer tests in unauth-dev mode.
- The OpenAPI determinism workaround (a JSON round-trip inside `generate.ts` to defeat `yaml`'s anchor/alias machinery on reference-equal subtrees emitted by `zod-to-openapi`) is dependency-pinning-sensitive. A renovate bump on either library may force a re-investigation.

**Neutral:**

- The unauth-dev fallback preserves the localhost-developer experience while broadcasting the mode change explicitly via header + log. Operators who treat the warning as load-bearing get a clean upgrade path; operators who ignore it ship un-authed.
- The legacy `HARNESS_API_TOKEN` continues to work indefinitely. Deprecation of the env-var is a separate decision (a future ADR) once external adoption of the token store crosses a yet-undefined threshold.

**Implementation divergence resolved in Phase 1 review-cycle 2.** Commit `e3430cec` wired the admin-gated `/api/v1/auth/*` handlers into `dispatchAuthedRequest` but left in place a default-permit conjunction (`if (required && !hasScope(...))`) that violated the documented default-deny invariant on line 30 of this ADR. Combined with `scopes.ts` using exact path equality, a read-status bearer could mint admin tokens by appending any query string to `POST /api/v1/auth/token` — the lookup missed, `required` was null, and the conjunction short-circuited into a permit. The fix-cycle resolved this by (a) stripping the query string in `dispatchAuthedRequest` before `requiredScopeForRoute` is called, and (b) changing the conjunction to `if (!required || !hasScope(...))` so a null-required result is an explicit 403. Parametrized regression tests in `packages/orchestrator/src/server/routes/auth.test.ts` cover query-string variants of each admin route plus an unknown-route default-deny case. The ADR text on line 30 is unchanged — the implementation caught up to the documented contract.

**Phase 2 carry-forwards (acknowledged, not blocking).**

- `scopes.ts:requiredScopeForRoute` cyclomaticComplexity grew from 22 (Phase 1) to 28 (Phase 2 Task 4 added the bridge-primitive mappings); check-arch flags it informationally. Suggested refactor: split by route prefix into per-namespace resolver functions.
- `v1-registry.ts:buildV1Registry` is `functionLength=101 / nestingDepth=6` — the OpenAPI schema literals are inherently long. Suggested refactor: split into `registerAuthPaths`, `registerBridgePaths`, `registerLegacyAliasPaths` rather than try to compress the schema literals themselves.
- The OpenAPI artifact has 16 `/api/v1/*` paths (3 auth + 3 bridge + 10 documented legacy aliases) vs. the Phase 2 plan brief's target of 18. Four legacy slugs (`analyze`, `roadmap-actions`, `dispatch-actions`, `chat-proxy`) and the maintenance routes (split into history/status pairs rather than a single entry) account for the difference. The routes are reachable through the alias rewrite and audited as normal; only the response-schema modeling is deferred to the `/api/v2` cutover per plan risk #5.
- `opencode` is not a registered platform in the slash-command generator; the in-repo generator covers four platforms (claude-code, gemini-cli, cursor, codex). Five plugin packages live outside this monorepo. Backlog item: either register opencode as a fifth platform here (preferred) or accept the gap until the external plugin packages adopt the harness slash-command manifest schema.

### Webhook secret storage model (Phase 3)

**Decision.** Webhook subscription HMAC secrets are stored **plaintext at rest** in `.harness/webhooks.json` with file mode `0600`. The secret is generated server-side as 32 random bytes (hex-encoded), returned to the caller exactly once in the create-response body, and never re-disclosed by any subsequent API call. Rotation is "delete + recreate" — there is no in-place rotate endpoint.

**Alternatives rejected.**

- **Application-layer encryption with an env-var key.** Rejected: the decryption key has to live somewhere the orchestrator process can read at startup (env-var, config file, KMS endpoint). For the threat model that actually matters — an attacker who has read access to `.harness/` — that key is almost always reachable too (process environ via `/proc/<pid>/environ`, shell history, the same config dir). The encryption is a speedbump, not a barrier; the operational cost (key-management, key-rotation, key-recovery) is real.
- **HKDF-derived encryption key from `tokens.json` material.** Rejected: circular. Compromising `.harness/` compromises both files at once — the derived key offers no separation of concerns. Worse, rotating the token-store key (a sensible periodic action) would invalidate every webhook secret, which is not the user-facing semantics anyone expects.
- **OS keychain (macOS Keychain / Windows DPAPI / Linux libsecret).** Rejected: cross-platform fragility. The three backends have incompatible APIs, divergent auth-prompt models, and break entirely in headless / CI / Docker / serverless environments — the same environments where harness will be deployed as a single-tenant runtime. The portability tax outweighs the benefit.

**Threat model justification.** The industry pattern for webhook secrets at single-tenant scope is _infrastructure-layer encryption_, not application-layer:

- GitHub, Stripe, Slack store webhook signing secrets plaintext in their datastores and rely on database-level encryption + access control.
- Kubernetes Secrets are base64 (not encryption) at rest, with etcd encryption recommended as an operator-level concern.
- The attack scenarios that matter — compromised orchestrator process, accidental repo commit, path-traversal exfil, backup theft, bridge-author leaks their own copy — are either unhelped by application-layer encryption, or are better solved at the infrastructure layer (FDE / etcd encryption / KMS / repo `.gitignore`).

**Mitigations in place.**

- `WebhookStore` writes `.harness/webhooks.json` with `fs.chmod(path, 0o600)` after every persist; tests assert the mode.
- `.gitignore` excludes `**/.harness/webhooks.json` (added in Phase 3 Task 14; the entry sits immediately after `tokens.json` and `audit.log` so the three runtime secret artifacts share one block).
- Operator-level: full-disk encryption is the default on modern macOS, Linux (LUKS), and Windows (BitLocker) — the substrate this runtime expects.
- Spec's existing "delete + recreate to rotate" model neatly sidesteps the encryption-key-rotation problem: rotating a webhook secret is a subscription replacement, not a re-encryption.
- The MCP `subscribe_webhook` tool's response is the only secret-disclosure surface; both the agent transcript and the dashboard's one-shot reveal carry "treat this as a credential" copy.

**Future escape hatch.** When (and only when) harness gains a hosted / multi-tenant runtime, secret-storage backends should integrate at the **deployment layer**, not the application layer: 1Password CLI, AWS Secrets Manager, HashiCorp Vault, Doppler, or Kubernetes Secrets + sealed-secrets. The current `WebhookStore` interface is small enough (`create / get / list / delete / listForEvent`) to wrap with a pluggable backend without rewriting the contract.

## Related

- Parent meta-spec: `docs/changes/hermes-phase-0-gateway-api/proposal.md`
- Phase 1 plan: `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-1-auth-foundation-plan.md`
- Phase 2 plan: `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-2-versioned-api-plan.md`
- Phase 3 plan: `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-3-webhook-signing-plan.md`
- Knowledge node: `docs/knowledge/orchestrator/gateway-api.md` (business process — Phases 1+2+3 contract)
- Follow-up ADRs (anticipated): Telemetry export to OpenTelemetry; Webhook delivery durability model (Phase 4).
