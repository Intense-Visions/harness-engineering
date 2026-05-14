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

### 3. Versioned route surface (Phase 2 — pending)

Every legacy `/api/*` route will be doubled at `/api/v1/*`. Legacy paths will emit a `Deprecation: <ISO-date>` header. New routes added during Phase 2+ will live only under `/api/v1/`. A second contract version (`/api/v2/`) will only ship when a breaking change is unavoidable; rolling forward through additive `/api/v1/` extensions is the strong default.

### 4. OpenAPI artifact generation (Phase 1 — bootstrapped)

The contract is published as a vendored OpenAPI 3.1.0 artifact at `docs/api/openapi.yaml`. Generation is driven from Zod schemas via `@asteasolutions/zod-to-openapi`; the registry lives at `packages/orchestrator/src/gateway/openapi/registry.ts` and the emitter at `gateway/openapi/generate.ts`. The npm script `openapi:generate` regenerates the artifact deterministically; CI workflow `.github/workflows/openapi-drift-check.yml` rejects PRs that change the generator without committing the regenerated YAML.

The Phase 1 artifact covers only the three auth-admin routes (`POST /api/v1/auth/token`, `GET /api/v1/auth/tokens`, `DELETE /api/v1/auth/tokens/{id}`). Each subsequent phase appends to the registry; the drift-check workflow ensures the artifact never lags the code.

## Status: in-progress

Phase 1 has shipped pillars 1, 2, and the scaffolding for 4. Pillar 3 (versioned route surface) and the full route coverage of pillar 4 remain. This ADR will be revised to status `accepted` once Phase 3 lands — at which point the webhook surface joins the contract and the registry covers every `/api/v1/*` route the gateway exposes.

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

## Related

- Parent meta-spec: `docs/changes/hermes-phase-0-gateway-api/proposal.md`
- Phase 1 plan: `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-1-auth-foundation-plan.md`
- Knowledge node: `docs/knowledge/orchestrator/gateway-api.md` (business process — Phase 1 substrate)
- Follow-up ADRs (anticipated): Telemetry export to OpenTelemetry; Webhook delivery durability model (conditional).
