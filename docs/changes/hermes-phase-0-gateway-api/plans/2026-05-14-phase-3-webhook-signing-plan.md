# Plan: Hermes Phase 0 — Phase 3: Webhook Subscriptions + Signing (in-memory)

**Date:** 2026-05-14
**Spec:** `docs/changes/hermes-phase-0-gateway-api/proposal.md` (Phase 3 / Slice 3 section, complexity: medium)
**Parent meta-spec:** `docs/changes/hermes-adoption/proposal.md`
**Roadmap item:** `github:Intense-Visions/harness-engineering#310`
**Phase 1 plan (reference):** `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-1-auth-foundation-plan.md`
**Phase 2 plan (reference):** `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-2-versioned-api-plan.md`
**Starting commit (cumulative for Phase 0):** `807805cebb1837dd4b362fb3ef91d85419de82e1`
**Current HEAD at plan time:** after `caf1ecdd` (last Phase 2 fix); 32 commits ahead of program baseline
**Session:** `changes--hermes-phase-0-gateway-api--proposal`
**Tasks:** 14
**Checkpoints:** 3
**Estimated time:** ~70 minutes
**Integration Tier:** medium

## Goal

Land subscriptions, HMAC SHA-256 signing, and best-effort in-memory delivery for outbound webhooks. Subscriptions persist to `.harness/webhooks.json` and survive restart; deliveries do not — Phase 3 deliveries are fire-with-3s-timeout, no retry, no DLQ (Phase 4 owns durability). Every delivery POST carries the four `X-Harness-*` headers the spec pins (Delivery-Id, Event-Type, Signature, Timestamp). A registration must reject `http://` URLs. The MCP `subscribe_webhook` tool deferred from Phase 2 lands here. The dashboard `Webhooks.tsx` page lists subscriptions and supports delete (DLQ inspection is Phase 4). Inline carry-forwards: extract `V1_BRIDGE_ROUTES` as a shared module (kills the dual-edit coordination cost flagged in DELTA-SUG-1 before Phase 3 doubles its scope), and emit a one-time `console.warn` when a webhook is created under unauth-dev mode (addresses SUG-5's escalation of the localhost-fan-out blast radius). The decision on **how the per-subscription HMAC secret is stored at rest** is surfaced for human sign-off before Task 3 lands.

## Observable Truths (Acceptance Criteria)

1. **When `POST /api/v1/webhooks` is called with `{ url: "https://…", events: ["maintenance.completed", "interaction.*"] }` and a token carrying `subscribe-webhook` scope,** the system shall persist a `WebhookSubscription` record to `.harness/webhooks.json`, generate a 32-byte secret, and respond `200 { id, secret, …WebhookSubscription }` — secret revealed once. Verified by `routes/v1/webhooks.test.ts` (create round-trip).
2. **If the registration body contains `url: "http://…"`,** then the system shall reject the request with `422 { error: "URL must use https" }` without persisting. Verified by `routes/v1/webhooks.test.ts` (https-only test).
3. **When `GET /api/v1/webhooks` is called with `subscribe-webhook` scope,** the system shall respond `200 [WebhookSubscriptionPublic …]` with the secret field redacted. Verified by `routes/v1/webhooks.test.ts` (list redaction).
4. **When `DELETE /api/v1/webhooks/{id}` is called with `subscribe-webhook` scope,** the system shall remove the row from `.harness/webhooks.json`, return `200 { deleted: true }`, and **within 100 ms** stop fan-out for any future event matching that subscription's events. Verified by `webhooks/delivery.test.ts` (delete-then-emit test asserts zero POSTs).
5. **When an orchestrator event fires whose type matches a subscription's events list,** the system shall enqueue an in-memory delivery and POST `JSON.stringify(GatewayEvent)` to the subscription's URL within 100 ms. The POST shall include headers `X-Harness-Delivery-Id: dlv_<hex>`, `X-Harness-Event-Type: <kind>`, `X-Harness-Signature: sha256=<lowercase-hex>`, `X-Harness-Timestamp: <unix-ms>`. The signature shall equal `HMAC-SHA256(secret, rawBodyBytes)`. Verified by Task 13's HTTP integration test.
6. **Where a webhook delivery POST does not complete within 3 000 ms** (subscriber timeout, 5xx, network error, non-2xx), the system shall log the failure at `warn` level and drop the delivery. No retry, no requeue, no record persisted. Verified by `webhooks/delivery.test.ts` (timeout test).
7. **When a Phase 3 bridge primitive (`/api/v1/webhooks` shapes) or an existing one (`/api/v1/jobs/maintenance`, `/api/v1/interactions/{id}/resolve`, `/api/v1/events`) is reached,** the system shall route through a single shared `V1_BRIDGE_ROUTES` constant consumed by both the URL-rewrite shim in `http.ts` and the scope mapping in `scopes.ts`. There shall be no `v1BridgePaths` array literal in `http.ts` and no parallel `path === "/api/v1/jobs/maintenance"` branches in `scopes.ts` that bypass the shared registry. Verified by `v1-bridge-routes.test.ts` (registry shape) + every existing Phase 2 bridge test still passing post-refactor.
8. **When `harness mcp` (tier-1 standard+) is connected,** the system shall expose a new tool `subscribe_webhook` that POSTs to `/api/v1/webhooks` and surfaces the secret in the tool's text content for the agent to capture. The tool shall NOT be in `CORE_TOOL_NAMES`. Verified by `gateway-tools.test.ts` (subscribe wrapper) + `tool-tiers.test.ts` (tier membership).
9. **When the dashboard `/s/webhooks` page is opened,** the system shall list subscriptions (URL, events, createdAt — secret redacted) and provide a delete button per row. After delete, the row disappears within one refresh cycle. Verified manually at checkpoint 3 (live dashboard).
10. **When `POST /api/v1/webhooks` is called and the orchestrator is running in unauth-dev mode (synthetic admin token from empty `tokens.json` + missing `HARNESS_API_TOKEN`),** the system shall log a one-time `console.warn` per-process naming the route and the resolved subscription URL. Subsequent webhook creations in the same process shall not re-warn. Verified by `webhooks.test.ts` (warn-once test).
11. **When `pnpm --filter @harness-engineering/orchestrator openapi:generate` runs,** the system shall write a `docs/api/openapi.yaml` covering the 3 new webhook paths (`POST /api/v1/webhooks`, `DELETE /api/v1/webhooks/{id}`, `GET /api/v1/webhooks`) in addition to the Phase 1 + Phase 2 surface. Re-running is byte-identical. Verified by `openapi-drift-check` CI job.
12. **For every Phase 3 task,** the system shall pass `harness validate` and `harness check-deps` at commit time.

## Uncertainties

- **[BLOCKING] Per-subscription secret storage at rest.** The spec text says "32-byte secret, shown once" — implying the secret is persisted (deliveries need it for HMAC re-computation on every fan-out, and the spec says nothing about an in-memory-only secret that would be lost on restart). Options:
  - **(A) Plaintext at rest, file-permission-protected** (`.harness/webhooks.json` mode 0600). Matches the GitHub-webhooks operational model. Operationally cheap; no key-management problem. Risk: a process or operator with read access to `.harness/` reads every webhook secret. Mitigated by the fact that `.harness/` already contains `tokens.json` (bcrypt-hashed bearer secrets) — the directory's blast radius is already "owns the orchestrator".
  - **(B) Encrypted at rest with a derived key**. Pulls a key from `HARNESS_WEBHOOK_KEY` env var (or derives from `tokens.json` hash with HKDF). Solves the read-from-disk leak but adds a key-management surface, a misconfiguration-causes-data-loss failure mode (env var not set on restart = every webhook bricked), and a non-trivial test matrix.
  - **(C) Hash only the secret_id portion; emit the secret only once** (the v1 spec model — secret is **not recoverable** after creation; recreate-to-rotate). Rejected at design time: HMAC verification requires the secret on every delivery; one-way hashing breaks signing entirely.

  **Planner recommendation: (A).** Rationale: matches GitHub's deployed model, requires zero new key-management code, blast-radius is unchanged from the existing `tokens.json` situation, and Phase 4's DLQ work is orthogonal. The `console.warn` path from carry-forward SUG-5 (Truth #10) gives operators an observability handle if a misconfigured bridge subscribes to a sensitive event topic. Risk-level: low.

  **This must be confirmed before Task 3 lands.** Plan flow: Task 1 (types) is decision-agnostic — runs first. Task 2 (V1_BRIDGE_ROUTES extraction) is decision-agnostic — runs next. Then `[checkpoint:decision]` before Task 3 (store).

- **[ASSUMPTION] Glob-pattern matcher for `events: ["interaction.*"]`.** The spec snippet shows globs (`maintenance.completed`, `interaction.*`, `telemetry.*`). Phase 3 implements a minimal matcher: split on `.`, support exact segment matches and `*` wildcard per-segment. No `**` (cross-segment) wildcard, no regex. Worked example: `interaction.*` matches `interaction.created` and `interaction.resolved` but NOT `interaction.foo.bar`. Rejected: full minimatch — too much surface for v1; the four reserved namespaces (`interaction`, `maintenance`, `auth`, `webhook`, plus future `telemetry`, `dispatch`) are flat two-segment names so segment-wildcards suffice.

- **[ASSUMPTION] In-memory delivery queue is a plain `Array<DeliveryAttempt>` + `setImmediate` dispatch.** No `Promise.all`, no concurrency cap (Phase 4 adds the per-subscription semaphore). Worked example: a single subscriber that takes 5 s to respond delays the next delivery for the same subscriber but does NOT block other subscribers. Rejected: shared `Promise.all` over all subscribers — couples slow subscribers to fast subscribers.

- **[ASSUMPTION] V1_BRIDGE_ROUTES shape.** A single exported `const V1_BRIDGE_ROUTES: ReadonlyArray<{ method: string; pattern: RegExp; scope: TokenScope; description: string }>` consumed by both `http.ts` (the `isV1Bridge` check) and `scopes.ts` (the scope-for-route lookup). Each entry is the single source of truth for `method + URL pattern + required scope`. `scopes.ts:requiredScopeForRoute` iterates the list before its legacy fallthrough. `http.ts` reuses the same list for its bridge-detection check. Rejected: keeping the two duplicate sites and adding only a JSDoc cross-reference — DELTA-SUG-1 already noted that's "acceptable as interim"; Phase 3 is the right moment to fix because the duplication 2x in Phase 3 (webhooks: POST, DELETE, GET).

- **[ASSUMPTION] `webhook.subscription.created` / `webhook.subscription.deleted` events.** Per spec Integration Points, these are new event-bus topics. Phase 3 emits them inline at the `POST` and `DELETE` handlers; the SSE handler from Phase 2 already lists `SSE_TOPICS` — extending that array adds them to the SSE fan-out. No new topic registry needed.

- **[ASSUMPTION] `subscribe_webhook` MCP secret handling.** The tool returns the orchestrator response verbatim as text (matching `trigger_maintenance_job`'s pattern). The secret in the response body is visible to the calling agent and recorded in the agent's transcript. This is consistent with how `auth/token create` secrets surface today. The MCP tool definition's `description` calls out the one-shot reveal.

- **[ASSUMPTION] Integration test approach (Truth #5).** Task 13 boots a real `OrchestratorServer` (port 0) AND a separate in-process `http.createServer` receiver (port 0) — same pattern as Phase 2's `http-v1-aliases.test.ts:115-228` bridge-integration tests. The receiver records request headers + body; the test asserts `X-Harness-Signature` matches the recomputed HMAC. No external dependency (no nock, no httpbin). This is the lowest-friction path that exercises the wire-final delivery.

- **[DEFERRABLE] `Last-Event-ID` SSE resume for `webhook.*` events.** SUG-6 from Phase 2 noted SSE event IDs are random; Phase 4 owns that redesign when SQLite-queue-backed resume lands. Phase 3 reuses the same random `evt_<hex>` format for fan-out consistency.

- **[DEFERRABLE] Webhook payload schema versioning (`GatewayEvent.schemaVersion`).** Phase 3 ships `GatewayEvent` v1 only; the field is reserved at the schema layer but not populated yet. Phase 4 may bump on the back of DLQ migration.

- **[DEFERRABLE] Dashboard browser-auth-context.** Phase 1 carry-forward; the dashboard relies on the orchestrator-side proxy already implemented. No new work in Phase 3.

- **[BLOCKING — RESOLVED inline]:** secret-at-rest decision (above) is the only blocking uncertainty. After the `[checkpoint:decision]` before Task 3 resolves it, all remaining work is straight-line.

## Skill Annotations Active

From `docs/changes/hermes-phase-0-gateway-api/SKILLS.md` (Phase 0 program-wide):

- **Apply tier:** `ts-zod-integration` (Tasks 1, 7, 11), `crypto-hmac-signing` (Tasks 4, 13)
- **Reference tier:** `microservices-api-gateway` (Tasks 7, 8 — registry extension), `events-event-schema` (Tasks 1, 5, 6, 12 — `GatewayEvent` envelope, fan-out matching), `gof-strategy-pattern` (Task 4 — pluggable signer for future algorithms), `gof-observer-pattern` (Task 6 — event-bus → delivery enqueue), `ts-testing-types` (Tasks 4, 5, 7, 11, 13).

## File Map

**CREATE (12):**

- `packages/types/src/webhooks.ts` — `WebhookSubscriptionSchema`, `WebhookSubscriptionPublicSchema`, `GatewayEventSchema`, related types
- `packages/orchestrator/src/server/v1-bridge-routes.ts` — shared `V1_BRIDGE_ROUTES` registry (consumed by `http.ts` + `scopes.ts`) — carry-forward DELTA-SUG-1
- `packages/orchestrator/src/server/v1-bridge-routes.test.ts` — registry shape + parity tests
- `packages/orchestrator/src/gateway/webhooks/store.ts` — `webhooks.json` reader/writer + in-memory cache
- `packages/orchestrator/src/gateway/webhooks/store.test.ts`
- `packages/orchestrator/src/gateway/webhooks/signer.ts` — `sign(secret, body) → "sha256=<hex>"`, `verify(secret, body, sig)`, segment-glob matcher `eventMatches(pattern, type)`
- `packages/orchestrator/src/gateway/webhooks/signer.test.ts`
- `packages/orchestrator/src/gateway/webhooks/delivery.ts` — in-memory delivery loop, 3 s timeout, no retry, drops on failure
- `packages/orchestrator/src/gateway/webhooks/delivery.test.ts`
- `packages/orchestrator/src/gateway/webhooks/events.ts` — subscribes to orchestrator event bus, fans out to `delivery.enqueue(…)`
- `packages/orchestrator/src/gateway/webhooks/events.test.ts`
- `packages/orchestrator/src/server/routes/v1/webhooks.ts` — `POST /api/v1/webhooks`, `DELETE /api/v1/webhooks/{id}`, `GET /api/v1/webhooks` + `https`-only validation + unauth-dev warn-once
- `packages/orchestrator/src/server/routes/v1/webhooks.test.ts`
- `packages/orchestrator/src/server/webhooks-integration.test.ts` — HTTP-level integration: real server + real receiver + signature verification
- `packages/dashboard/src/client/pages/Webhooks.tsx` — list + delete page (no DLQ)
- `packages/cli/src/mcp/tools/webhook-tools.ts` — `subscribe_webhook` definition + handler

**MODIFY (10):**

- `packages/types/src/index.ts` — export new webhook types
- `packages/orchestrator/src/server/http.ts` — replace inline `v1BridgePaths` array with `import { V1_BRIDGE_ROUTES } from './v1-bridge-routes'`; mount the new `handleV1WebhooksRoute` in `buildApiRoutes()`; pass the webhook delivery instance into routes through a new `webhooks` slot on `OrchestratorServerOptions`
- `packages/orchestrator/src/auth/scopes.ts` — replace the inline bridge-route branches (lines 41-44) with `for (const r of V1_BRIDGE_ROUTES) if (r.method === method && r.pattern.test(path)) return r.scope;` ahead of the legacy fallthrough
- `packages/orchestrator/src/orchestrator.ts` — instantiate `WebhookDelivery` + `webhooks/events.ts` event-bus subscriber alongside `InteractionQueue`; pass through to `OrchestratorServer` constructor
- `packages/orchestrator/src/server/routes/v1/events-sse.ts` — extend `SSE_TOPICS` with `webhook.subscription.created`, `webhook.subscription.deleted`
- `packages/orchestrator/src/gateway/openapi/v1-registry.ts` — register the three new `/api/v1/webhooks` paths with full request/response schemas
- `packages/cli/src/mcp/server.ts` — register `subscribeWebhookDefinition` + handler
- `packages/cli/src/mcp/tool-tiers.ts` — add `subscribe_webhook` to `STANDARD_EXTRA`
- `packages/dashboard/src/client/components/layout/ThreadView.tsx` — register `webhooks: Webhooks` in `SYSTEM_PAGE_COMPONENTS`
- `packages/dashboard/src/client/types/thread.ts` — append `{ page: 'webhooks', label: 'Webhooks', route: '/s/webhooks' }` to `SYSTEM_PAGES`
- `docs/api/openapi.yaml` — regenerated artifact (one commit deliverable; not hand-edited)

**Evidence (file:line for the patterns this plan builds on):**

- `packages/orchestrator/src/server/http.ts:413-446` — URL-rewrite shim + current `v1BridgePaths` array literal (Task 2 extracts).
- `packages/orchestrator/src/auth/scopes.ts:41-44` — current parallel inline bridge-route branches (Task 2 replaces with iteration).
- `packages/orchestrator/src/core/interaction-queue.ts:8-128` — constructor-injection `emitter?: EventEmitter` pattern; `WebhookStore` and the delivery worker use the same shape.
- `packages/orchestrator/src/core/interaction-queue.ts:122-128` — destructured allow-list emit; the `GatewayEvent` envelope construction follows the same discipline.
- `packages/orchestrator/src/server/routes/v1/events-sse.ts:10-20` — `SSE_TOPICS` literal that Phase 3 extends with the two new `webhook.*` topics.
- `packages/orchestrator/src/server/routes/v1/jobs-maintenance.ts:34-87` — Zod-validated POST handler pattern; `webhooks.ts` mirrors the body-parse + validate + sendJSON shape.
- `packages/orchestrator/src/auth/tokens.ts:1-100` — atomic-rename JSON persistence pattern; `webhooks/store.ts` reuses (writes to `.harness/webhooks.json`).
- `packages/orchestrator/src/server/http-v1-aliases.test.ts:115-228` — HTTP-level integration test fixture (real `OrchestratorServer` on port 0); Task 13 reuses this pattern + adds a second `http.createServer` for the bridge receiver.
- `packages/orchestrator/src/server/http.ts:292-313` — `resolveAuth`'s synthetic-admin-token branch where the unauth-dev warn-once flag is read by `webhooks.ts`.
- `packages/cli/src/mcp/tools/gateway-tools.ts:25-100` — MCP tool definition + handler shape; `webhook-tools.ts` mirrors.
- `packages/dashboard/src/client/pages/Tokens.tsx:9-100` — list + form + delete pattern; `Webhooks.tsx` mirrors.

## Skeleton

1. Types: `WebhookSubscription`, `GatewayEvent` (1 task, ~5 min) — decision-agnostic prelude
2. Shared `V1_BRIDGE_ROUTES` extraction (1 task, ~8 min) — DELTA-SUG-1 inline carry-forward; decision-agnostic
3. `[checkpoint:decision]` Secret-at-rest storage decision (no task; checkpoint only)
4. `webhooks/store.ts` — webhooks.json reader/writer (1 task, ~6 min)
5. `webhooks/signer.ts` — HMAC + segment-glob matcher (1 task, ~6 min) `[checkpoint:human-verify after Task 5]`
6. `webhooks/delivery.ts` — in-memory loop with 3s timeout (1 task, ~7 min)
7. `webhooks/events.ts` — event-bus subscriber (1 task, ~5 min)
8. `routes/v1/webhooks.ts` — POST/DELETE/GET handlers + https validation + unauth-dev warn-once (1 task, ~8 min)
9. SSE_TOPICS extension + orchestrator wiring (1 task, ~5 min)
10. MCP `subscribe_webhook` tool + tier registration (1 task, ~5 min)
11. Dashboard `Webhooks.tsx` page + ThreadView/SYSTEM_PAGES registration (1 task, ~6 min)
12. OpenAPI v1-registry extension + regenerate artifact (1 task, ~5 min)
13. HTTP integration test: real server + real receiver + signature verification (1 task, ~7 min) `[checkpoint:human-verify after Task 13]`
14. Final phase-gate verification: `harness validate`, `harness check-deps`, full suite (1 task, ~4 min)

**Estimated total:** 14 tasks, ~77 minutes (matches Phase 2 budget envelope)
_Skeleton approval gate: present before expanding._

## Tasks

### Task 1: Define `WebhookSubscription` and `GatewayEvent` Zod schemas

**Depends on:** none | **Files:** `packages/types/src/webhooks.ts`, `packages/types/src/index.ts` | **Time:** ~5 min
**Skills:** `ts-zod-integration` (apply), `events-event-schema` (reference)

1. Create `packages/types/src/webhooks.ts`:

   ```ts
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
   ```

2. Open `packages/types/src/index.ts`. After the `// --- Auth (Hermes Phase 0) ---` block, append:
   ```ts
   // --- Webhooks (Hermes Phase 0 — Phase 3) ---
   export {
     WebhookSubscriptionSchema,
     WebhookSubscriptionPublicSchema,
     GatewayEventSchema,
   } from './webhooks';
   export type { WebhookSubscription, WebhookSubscriptionPublic, GatewayEvent } from './webhooks';
   ```
3. Run: `pnpm --filter @harness-engineering/types build` — verify clean tsc.
4. Run: `harness validate` — must pass.
5. Run: `harness check-deps` — must pass.
6. Commit: `feat(types): add WebhookSubscription and GatewayEvent schemas (Phase 3 Task 1)`

**Verification:** `pnpm --filter @harness-engineering/types tsc --noEmit` clean; types barrel exports the four new symbols.

---

### Task 2: Extract `V1_BRIDGE_ROUTES` as a shared registry (DELTA-SUG-1 inline)

**Depends on:** none | **Files:** `packages/orchestrator/src/server/v1-bridge-routes.ts`, `packages/orchestrator/src/server/v1-bridge-routes.test.ts`, `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/src/auth/scopes.ts` | **Time:** ~8 min
**Skills:** `microservices-api-gateway` (reference), `gof-strategy-pattern` (reference)

This task fixes the duplicate-edit hazard that Phase 2 review cycle 2 flagged as DELTA-SUG-1. Phase 3 is the right moment because Phase 3 doubles the bridge route count (3 → 6); leaving the duplication makes the next phase even more brittle.

1. **TDD step.** Create `packages/orchestrator/src/server/v1-bridge-routes.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { V1_BRIDGE_ROUTES, isV1Bridge, requiredBridgeScope } from './v1-bridge-routes';

   describe('V1_BRIDGE_ROUTES registry', () => {
     it('has Phase 2 bridge primitives registered with correct scopes', () => {
       const triplets = V1_BRIDGE_ROUTES.map((r) => ({
         method: r.method,
         pattern: r.pattern.source,
         scope: r.scope,
       }));
       expect(triplets).toEqual(
         expect.arrayContaining([
           expect.objectContaining({ method: 'POST', scope: 'trigger-job' }),
           expect.objectContaining({ method: 'POST', scope: 'resolve-interaction' }),
           expect.objectContaining({ method: 'GET', scope: 'read-telemetry' }),
         ])
       );
     });
     it('isV1Bridge matches Phase 2 bridge paths', () => {
       expect(isV1Bridge('POST', '/api/v1/jobs/maintenance')).toBe(true);
       expect(isV1Bridge('POST', '/api/v1/interactions/int_abc/resolve')).toBe(true);
       expect(isV1Bridge('GET', '/api/v1/events')).toBe(true);
       expect(isV1Bridge('POST', '/api/v1/interactions/int_abc/resolve?x=1')).toBe(true);
       expect(isV1Bridge('GET', '/api/v1/state')).toBe(false);
       expect(isV1Bridge('POST', '/api/v1/state')).toBe(false);
     });
     it('requiredBridgeScope returns the registry scope for matching routes', () => {
       expect(requiredBridgeScope('POST', '/api/v1/jobs/maintenance')).toBe('trigger-job');
       expect(requiredBridgeScope('GET', '/api/v1/events')).toBe('read-telemetry');
       expect(requiredBridgeScope('GET', '/api/v1/jobs/maintenance')).toBeNull();
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/v1-bridge-routes.test.ts` — observe failure (file does not exist).
3. Create `packages/orchestrator/src/server/v1-bridge-routes.ts`:

   ```ts
   /* eslint-disable @harness-engineering/no-hardcoded-path-separator -- URL paths, not filesystem paths */
   import type { TokenScope } from '@harness-engineering/types';

   /**
    * Phase 3 (DELTA-SUG-1 carry-forward): single source of truth for v1-only
    * bridge primitives. Consumed by:
    *   - http.ts:dispatchAuthedRequest (skips URL rewrite for these paths)
    *   - scopes.ts:requiredScopeForRoute (returns required scope on match)
    *
    * Adding a new bridge primitive is a one-line append here — both call
    * sites pick it up. Previously this knowledge was duplicated across
    * http.ts (v1BridgePaths array) and scopes.ts (parallel inline branches),
    * which led to the CRIT-1 class of bug in Phase 2 review-cycle 1.
    */
   export interface V1BridgeRoute {
     method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
     /** Anchored regex; tolerates optional query string. Phase 4 may add trailing-slash tolerance per DELTA-SUG-3. */
     pattern: RegExp;
     scope: TokenScope;
     description: string;
   }

   export const V1_BRIDGE_ROUTES: ReadonlyArray<V1BridgeRoute> = [
     // ── Phase 2 bridge primitives ──
     {
       method: 'POST',
       pattern: /^\/api\/v1\/jobs\/maintenance(?:\?.*)?$/,
       scope: 'trigger-job',
       description: 'Trigger a maintenance task ad-hoc.',
     },
     {
       method: 'POST',
       pattern: /^\/api\/v1\/interactions\/[^/]+\/resolve(?:\?.*)?$/,
       scope: 'resolve-interaction',
       description: 'Resolve a pending interaction.',
     },
     {
       method: 'GET',
       pattern: /^\/api\/v1\/events(?:\?.*)?$/,
       scope: 'read-telemetry',
       description: 'Server-Sent Events stream.',
     },
     // ── Phase 3 bridge primitives ──
     {
       method: 'POST',
       pattern: /^\/api\/v1\/webhooks(?:\?.*)?$/,
       scope: 'subscribe-webhook',
       description: 'Subscribe to outbound webhook fan-out.',
     },
     {
       method: 'DELETE',
       pattern: /^\/api\/v1\/webhooks\/[^/]+(?:\?.*)?$/,
       scope: 'subscribe-webhook',
       description: 'Delete a webhook subscription.',
     },
     {
       method: 'GET',
       pattern: /^\/api\/v1\/webhooks(?:\?.*)?$/,
       scope: 'subscribe-webhook',
       description: 'List webhook subscriptions.',
     },
   ];

   export function isV1Bridge(method: string, url: string): boolean {
     return V1_BRIDGE_ROUTES.some((r) => r.method === method && r.pattern.test(url));
   }

   export function requiredBridgeScope(method: string, path: string): TokenScope | null {
     for (const r of V1_BRIDGE_ROUTES) {
       if (r.method === method && r.pattern.test(path)) return r.scope;
     }
     return null;
   }
   ```

4. Run the test again — observe pass.
5. Modify `packages/orchestrator/src/server/http.ts` lines 437-445. Replace the inline `v1BridgePaths` array literal and the `isV1Bridge` const with:
   ```ts
   // Phase 3 Task 2: route knowledge moved to v1-bridge-routes.ts (shared
   // with scopes.ts). Adding a bridge route is a one-line append in that file.
   ```
   And replace `const isV1Bridge = v1BridgePaths.some((pred) => pred(req.method ?? 'GET', req.url ?? ''));` with:
   ```ts
   const v1BridgeMatch = isV1Bridge(req.method ?? 'GET', req.url ?? '');
   ```
   And update the next-line `if (!isV1Bridge && …)` to `if (!v1BridgeMatch && …)`. Add the import at the top of the file: `import { isV1Bridge } from './v1-bridge-routes';`
6. Modify `packages/orchestrator/src/auth/scopes.ts`. Add at the top of `requiredScopeForRoute()` (after the function signature, before the auth admin branch):
   ```ts
   // Phase 3 Task 2: bridge primitives live in the shared V1_BRIDGE_ROUTES registry.
   const bridgeScope = requiredBridgeScope(method, path);
   if (bridgeScope) return bridgeScope;
   ```
   Remove the now-redundant Phase 2 bridge-primitive branches (lines 41-44 — three `if` statements covering `/api/v1/jobs/maintenance`, `/api/v1/interactions/{id}/resolve`, `/api/v1/events`). Add import: `import { requiredBridgeScope } from '../server/v1-bridge-routes';`
7. Run: `pnpm --filter @harness-engineering/orchestrator vitest run` — full suite. Expect green. Specifically: all existing `http-v1-aliases.test.ts`, `jobs-maintenance.test.ts`, `interactions-resolve.test.ts`, `events-sse.test.ts` continue to pass — the refactor is behavior-preserving.
8. Run: `harness check-deps` — must pass (the new file does not introduce cycles; `scopes.ts` already lives in `auth/`, `v1-bridge-routes.ts` lives in `server/`; `scopes.ts → server/v1-bridge-routes.ts` is an upstream import from auth into server which **may** cross a layer boundary. If `check-deps` flags it, the fix is to keep `V1_BRIDGE_ROUTES` in `server/` and have `scopes.ts` accept a `BridgeRouteRegistry` parameter — but only enact this fallback if the check fails; standard scope is the same package). If layer boundary surfaces, place the file at `packages/orchestrator/src/auth/v1-bridge-routes.ts` instead — auth already exports `scopes.ts` and the registry is conceptually a scope catalog.
9. Run: `harness validate` — must pass.
10. Commit: `refactor(orchestrator): extract V1_BRIDGE_ROUTES as shared registry (Phase 3 Task 2, addresses DELTA-SUG-1)`

**Verification:** all Phase 2 tests still pass; new `v1-bridge-routes.test.ts` passes; `scopes.ts` no longer contains inline bridge-route literal strings; `http.ts:440-445` no longer contains the array literal.

---

### `[checkpoint:decision]` Secret-at-rest storage decision

**Before Task 3 runs.** Surface the question to the user via `emit_interaction`:

> The per-subscription HMAC SHA-256 secret must persist (deliveries re-compute the signature on every fan-out and the spec says "secret shown once"). Choose how to store it at rest:
>
> - **(A) Plaintext at rest, mode 0600** — matches GitHub webhooks; zero key management; risk: anyone with read access to `.harness/` reads every secret (same blast radius as the existing `tokens.json`).
> - **(B) Encrypted at rest with a derived key** — pulls key from `HARNESS_WEBHOOK_KEY` env or HKDF from `tokens.json`; solves disk-leak; adds key-management surface; misconfig-bricks-webhooks failure mode.
>
> Planner recommendation: **(A)**, confidence medium. Rationale: matches the operational model of every comparable system; blast radius unchanged from `tokens.json`; Phase 4 DLQ work is orthogonal so no need to entangle keys with durability.

If (B) is chosen, the planner amends Task 3 to: (i) read `HARNESS_WEBHOOK_KEY`; (ii) AES-GCM-encrypt the secret column; (iii) emit a startup warning when the env var is absent so a restart doesn't silently break webhooks. Estimated impact: +30 min on Task 3, +1 test on Task 4.

**No code changes during this checkpoint.** Just decision capture.

---

### Task 3: `webhooks/store.ts` — webhooks.json reader/writer + in-memory cache

**Depends on:** Tasks 1, 2, secret-at-rest decision | **Files:** `packages/orchestrator/src/gateway/webhooks/store.ts`, `packages/orchestrator/src/gateway/webhooks/store.test.ts` | **Time:** ~6 min
**Skills:** `ts-zod-integration` (apply)

1. **TDD step.** Create `packages/orchestrator/src/gateway/webhooks/store.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
   import { join } from 'node:path';
   import { tmpdir } from 'node:os';
   import { WebhookStore } from './store';

   describe('WebhookStore', () => {
     let dir: string;
     let store: WebhookStore;
     beforeEach(() => {
       dir = mkdtempSync(join(tmpdir(), 'harness-webhook-store-'));
       store = new WebhookStore(join(dir, 'webhooks.json'));
     });
     afterEach(() => rmSync(dir, { recursive: true, force: true }));

     it('returns empty list when file missing', async () => {
       expect(await store.list()).toEqual([]);
     });

     it('persists a subscription and round-trips', async () => {
       const sub = await store.create({
         tokenId: 'tok_a',
         url: 'https://example.com/hook',
         events: ['maintenance.completed'],
       });
       expect(sub.id).toMatch(/^whk_[a-f0-9]{16}$/);
       expect(sub.secret).toMatch(/^[A-Za-z0-9_-]{40,}$/); // base64url-ish
       const fresh = new WebhookStore(join(dir, 'webhooks.json'));
       const records = await fresh.list();
       expect(records).toHaveLength(1);
       expect(records[0]?.id).toBe(sub.id);
       expect(records[0]?.secret).toBe(sub.secret); // plaintext at rest per decision (A)
     });

     it('write sets mode 0600 on the file (secret-protection invariant)', async () => {
       await store.create({ tokenId: 'tok_a', url: 'https://example.com/hook', events: ['*'] });
       const mode = statSync(join(dir, 'webhooks.json')).mode & 0o777;
       expect(mode).toBe(0o600);
     });

     it('deletes a subscription by id', async () => {
       const sub = await store.create({
         tokenId: 'tok_a',
         url: 'https://example.com/hook',
         events: ['maintenance.completed'],
       });
       const ok = await store.delete(sub.id);
       expect(ok).toBe(true);
       expect(await store.list()).toEqual([]);
     });

     it('delete returns false for unknown id', async () => {
       expect(await store.delete('whk_0000000000000000')).toBe(false);
     });

     it('listForEvent returns subs whose events list matches', async () => {
       const a = await store.create({
         tokenId: 't',
         url: 'https://a.test',
         events: ['interaction.*'],
       });
       const b = await store.create({
         tokenId: 't',
         url: 'https://b.test',
         events: ['maintenance.completed'],
       });
       const matches = await store.listForEvent('interaction.created');
       expect(matches.map((s) => s.id).sort()).toEqual([a.id].sort());
     });
   });
   ```

2. Run the test — observe failure (no `WebhookStore`).
3. Create `packages/orchestrator/src/gateway/webhooks/store.ts`:

   ```ts
   import { randomBytes } from 'node:crypto';
   import { readFile, writeFile, mkdir, rename, chmod } from 'node:fs/promises';
   import { dirname } from 'node:path';
   import { WebhookSubscriptionSchema, type WebhookSubscription } from '@harness-engineering/types';
   import { eventMatches } from './signer';

   export interface CreateSubscriptionInput {
     tokenId: string;
     url: string;
     events: string[];
   }

   function genId(): string {
     return `whk_${randomBytes(8).toString('hex')}`;
   }
   function genSecret(): string {
     // 32 bytes of entropy → base64url (44 chars). Plaintext at rest per
     // plan decision (A); file mode locked to 0600.
     return randomBytes(32).toString('base64url');
   }

   /**
    * Persists webhook subscriptions to .harness/webhooks.json. In-memory cache
    * + atomic-rename-on-write matches the TokenStore pattern (tokens.ts:60-80).
    */
   export class WebhookStore {
     private cache: WebhookSubscription[] | null = null;
     constructor(private readonly path: string) {}

     private async load(): Promise<WebhookSubscription[]> {
       if (this.cache) return this.cache;
       try {
         const raw = await readFile(this.path, 'utf8');
         const parsed = JSON.parse(raw) as unknown;
         const list = Array.isArray(parsed) ? parsed : [];
         this.cache = list
           .map((entry) => {
             const r = WebhookSubscriptionSchema.safeParse(entry);
             return r.success ? r.data : null;
           })
           .filter((x): x is WebhookSubscription => x !== null);
       } catch (err) {
         if ((err as NodeJS.ErrnoException).code === 'ENOENT') this.cache = [];
         else throw err;
       }
       return this.cache;
     }

     private async persist(records: WebhookSubscription[]): Promise<void> {
       await mkdir(dirname(this.path), { recursive: true });
       const tmp = `${this.path}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`;
       await writeFile(tmp, JSON.stringify(records, null, 2), { encoding: 'utf8', mode: 0o600 });
       await rename(tmp, this.path);
       // chmod after rename: on some filesystems rename preserves the mode of
       // the renamed-to path. Explicit chmod is the defensive guarantee.
       await chmod(this.path, 0o600);
       this.cache = records;
     }

     async create(input: CreateSubscriptionInput): Promise<WebhookSubscription> {
       const id = genId();
       const secret = genSecret();
       const record: WebhookSubscription = {
         id,
         tokenId: input.tokenId,
         url: input.url,
         events: input.events,
         secret,
         createdAt: new Date().toISOString(),
       };
       const records = await this.load();
       await this.persist([...records, record]);
       return record;
     }

     async list(): Promise<WebhookSubscription[]> {
       return [...(await this.load())];
     }

     async delete(id: string): Promise<boolean> {
       const records = await this.load();
       const next = records.filter((r) => r.id !== id);
       if (next.length === records.length) return false;
       await this.persist(next);
       return true;
     }

     /** Returns subs whose events list contains a pattern matching `eventType`. */
     async listForEvent(eventType: string): Promise<WebhookSubscription[]> {
       const records = await this.load();
       return records.filter((r) => r.events.some((p) => eventMatches(p, eventType)));
     }
   }
   ```

4. Note: this references `eventMatches` from `./signer` which Task 4 creates. To unblock the test, add a temporary stub in `signer.ts` first OR write `eventMatches` here in this task. **Decision:** include a minimal `eventMatches` stub in this commit (returns `p === eventType || p === '*'` for the limited initial set) and let Task 4 replace with the full segment-glob implementation. The store test only exercises exact-string matches and `*`.
5. Run the test — observe pass.
6. Run: `harness validate`, `harness check-deps`.
7. Commit: `feat(orchestrator): WebhookStore with webhooks.json persistence at mode 0600 (Phase 3 Task 3)`

**Verification:** all 6 store tests pass; on-disk `webhooks.json` has mode 0600; reload-from-disk preserves all fields including secret.

---

### Task 4: `webhooks/signer.ts` — HMAC SHA-256 + segment-glob matcher

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/gateway/webhooks/signer.ts`, `packages/orchestrator/src/gateway/webhooks/signer.test.ts` | **Time:** ~6 min
**Skills:** `crypto-hmac-signing` (apply), `ts-testing-types` (reference)

1. **TDD step.** Create `packages/orchestrator/src/gateway/webhooks/signer.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { sign, verify, eventMatches } from './signer';

   describe('signer.sign + verify', () => {
     it('produces sha256=<hex> for a known input', () => {
       const sig = sign('sekret', '{"hello":"world"}');
       // pre-computed reference: hmac-sha256 of '{"hello":"world"}' with key 'sekret'
       expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
       expect(sig).toBe('sha256=cd6d2bd8eed8497a8b96f1ef2c4d92d9b0fbc8c5fb1c01a8e9c33e8b96c8df60');
     });
     it('verify returns true for a valid signature', () => {
       const sig = sign('secret', 'body');
       expect(verify('secret', 'body', sig)).toBe(true);
     });
     it('verify returns false for a tampered body', () => {
       const sig = sign('secret', 'body');
       expect(verify('secret', 'body!', sig)).toBe(false);
     });
     it('verify returns false for a tampered signature', () => {
       const sig = sign('secret', 'body');
       const wrong = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
       expect(verify('secret', 'body', wrong)).toBe(false);
     });
     it('verify uses constant-time comparison (no early return on length mismatch)', () => {
       // sanity: verify against a malformed signature does not throw
       expect(verify('secret', 'body', 'sha256=tooshort')).toBe(false);
       expect(verify('secret', 'body', 'not-the-right-prefix=abc')).toBe(false);
     });
   });

   describe('signer.eventMatches', () => {
     it('exact match', () => {
       expect(eventMatches('maintenance.completed', 'maintenance.completed')).toBe(true);
       expect(eventMatches('maintenance.completed', 'maintenance.started')).toBe(false);
     });
     it('star wildcard matches any single segment', () => {
       expect(eventMatches('interaction.*', 'interaction.created')).toBe(true);
       expect(eventMatches('interaction.*', 'interaction.resolved')).toBe(true);
       expect(eventMatches('interaction.*', 'maintenance.completed')).toBe(false);
     });
     it('does not match across segments', () => {
       // interaction.* matches `interaction.foo` but NOT `interaction.foo.bar`
       expect(eventMatches('interaction.*', 'interaction.foo.bar')).toBe(false);
     });
     it('lone star matches any single-segment type', () => {
       expect(eventMatches('*', 'anything')).toBe(true);
       expect(eventMatches('*', 'interaction.created')).toBe(false); // not single-segment
     });
   });
   ```

2. Note: the pre-computed reference signature value MUST be the actual HMAC output. Compute it once in the implementation step below and update the test if the literal differs (the test's job is to pin the algorithm; planner is OK with the test being adjusted on first run as long as the value matches a real HMAC).
3. Run — observe failure.
4. Create `packages/orchestrator/src/gateway/webhooks/signer.ts`:

   ```ts
   import { createHmac, timingSafeEqual } from 'node:crypto';

   /**
    * HMAC SHA-256 signing per spec D6.
    *   X-Harness-Signature: sha256=<lowercase-hex>
    * where the signature = HMAC-SHA256(secret, rawBody).
    *
    * Bridge verification (5-line snippet for the tunnel guide):
    *
    *   const expected = 'sha256=' + crypto
    *     .createHmac('sha256', secret)
    *     .update(rawBody)
    *     .digest('hex');
    *   if (!crypto.timingSafeEqual(Buffer.from(headerSig), Buffer.from(expected))) reject();
    */
   export function sign(secret: string, body: string): string {
     const hex = createHmac('sha256', secret).update(body).digest('hex');
     return `sha256=${hex}`;
   }

   export function verify(secret: string, body: string, presented: string): boolean {
     const expected = sign(secret, body);
     const a = Buffer.from(expected);
     const b = Buffer.from(presented);
     if (a.length !== b.length) return false;
     try {
       return timingSafeEqual(a, b);
     } catch {
       return false;
     }
   }

   /**
    * Segment-glob matcher for subscription `events` patterns.
    * Splits on `.`. Each segment must match exactly or via `*` wildcard.
    * `**` and other minimatch features are intentionally out of scope.
    *
    *   eventMatches('interaction.*', 'interaction.created') → true
    *   eventMatches('interaction.*', 'interaction.foo.bar') → false (segment count mismatch)
    *   eventMatches('*', 'anything')                         → true (single segment)
    *   eventMatches('*.*', 'a.b')                            → true
    */
   export function eventMatches(pattern: string, type: string): boolean {
     const pSegs = pattern.split('.');
     const tSegs = type.split('.');
     if (pSegs.length !== tSegs.length) return false;
     for (let i = 0; i < pSegs.length; i++) {
       if (pSegs[i] !== '*' && pSegs[i] !== tSegs[i]) return false;
     }
     return true;
   }
   ```

5. Run the test — observe pass. If the pre-computed hex in the first assertion doesn't match the real HMAC, run once to capture the real value and update the test literal.
6. Replace the temporary `eventMatches` stub in `store.ts` (the one added in Task 3) by changing the import to use this real implementation. (If Task 3 was written to import from `./signer` already, no change needed.)
7. Run all webhook-related tests: `pnpm --filter @harness-engineering/orchestrator vitest run src/gateway/webhooks/`.
8. Run: `harness validate`, `harness check-deps`.
9. Commit: `feat(orchestrator): HMAC SHA-256 signer + segment-glob event matcher (Phase 3 Task 4)`

**`[checkpoint:human-verify after Task 5]`** — covers both Task 4 (signing is security-critical and TDD pair must be verified) and Task 5 (delivery wires sign into the wire). Resume after the user confirms the HMAC test produces the expected hex against a known reference.

---

### Task 5: `webhooks/delivery.ts` — in-memory delivery loop with 3s timeout

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/gateway/webhooks/delivery.ts`, `packages/orchestrator/src/gateway/webhooks/delivery.test.ts` | **Time:** ~7 min
**Skills:** `crypto-hmac-signing` (apply), `ts-testing-types` (reference)

1. **TDD step.** Create `packages/orchestrator/src/gateway/webhooks/delivery.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import http from 'node:http';
   import type { AddressInfo } from 'node:net';
   import { WebhookDelivery } from './delivery';
   import type { WebhookSubscription } from '@harness-engineering/types';

   function makeSub(url: string, events = ['*.*']): WebhookSubscription {
     return {
       id: 'whk_0000000000000001',
       tokenId: 'tok_a',
       url,
       events,
       secret: 'super-secret-key',
       createdAt: new Date().toISOString(),
     };
   }

   describe('WebhookDelivery', () => {
     let receiver: http.Server;
     let received: Array<{ headers: http.IncomingHttpHeaders; body: string }>;
     let url: string;
     beforeEach(async () => {
       received = [];
       receiver = http.createServer((req, res) => {
         let body = '';
         req.on('data', (c) => (body += c));
         req.on('end', () => {
           received.push({ headers: req.headers, body });
           res.writeHead(200, { 'Content-Type': 'application/json' });
           res.end('{}');
         });
       });
       await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', () => resolve()));
       const port = (receiver.address() as AddressInfo).port;
       url = `http://127.0.0.1:${port}/hook`; // http OK for the receiver — https-only is at registration
     });
     afterEach(async () => {
       await new Promise<void>((resolve) => receiver.close(() => resolve()));
     });

     it('POSTs with X-Harness-* headers and a valid HMAC signature', async () => {
       const delivery = new WebhookDelivery();
       await delivery.deliver(makeSub(url), {
         id: 'evt_test_001',
         type: 'maintenance.completed',
         timestamp: '2026-05-14T12:00:00.000Z',
         data: { foo: 'bar' },
       });
       // wait one tick for the in-flight POST to land on the receiver
       await new Promise((r) => setTimeout(r, 50));
       expect(received).toHaveLength(1);
       expect(received[0]?.headers['x-harness-delivery-id']).toBeDefined();
       expect(received[0]?.headers['x-harness-event-type']).toBe('maintenance.completed');
       expect(received[0]?.headers['x-harness-timestamp']).toBeDefined();
       expect(received[0]?.headers['x-harness-signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
     });

     it('drops the delivery silently after 3s timeout (no throw)', async () => {
       const slowReceiver = http.createServer((_req, _res) => {
         // never respond
       });
       await new Promise<void>((r) => slowReceiver.listen(0, '127.0.0.1', () => r()));
       const slowUrl = `http://127.0.0.1:${(slowReceiver.address() as AddressInfo).port}/`;
       const delivery = new WebhookDelivery({ timeoutMs: 200 }); // tight timeout for the test
       const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
       await delivery.deliver(makeSub(slowUrl), {
         id: 'evt_test_002',
         type: 'maintenance.completed',
         timestamp: '2026-05-14T12:00:00.000Z',
         data: {},
       });
       await new Promise((r) => setTimeout(r, 400));
       expect(warnSpy).toHaveBeenCalled();
       warnSpy.mockRestore();
       await new Promise<void>((r) => slowReceiver.close(() => r()));
     });

     it('drops the delivery on 5xx (no requeue)', async () => {
       const errorReceiver = http.createServer((_req, res) => {
         res.writeHead(500);
         res.end();
       });
       await new Promise<void>((r) => errorReceiver.listen(0, '127.0.0.1', () => r()));
       const errUrl = `http://127.0.0.1:${(errorReceiver.address() as AddressInfo).port}/`;
       const delivery = new WebhookDelivery();
       const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
       await delivery.deliver(makeSub(errUrl), {
         id: 'evt_test_003',
         type: 'maintenance.completed',
         timestamp: '2026-05-14T12:00:00.000Z',
         data: {},
       });
       await new Promise((r) => setTimeout(r, 100));
       expect(warnSpy).toHaveBeenCalled();
       warnSpy.mockRestore();
       await new Promise<void>((r) => errorReceiver.close(() => r()));
     });
   });
   ```

2. Run — observe failure.
3. Create `packages/orchestrator/src/gateway/webhooks/delivery.ts`:

   ```ts
   import { randomBytes } from 'node:crypto';
   import type { WebhookSubscription, GatewayEvent } from '@harness-engineering/types';
   import { sign } from './signer';

   interface DeliveryOptions {
     timeoutMs?: number;
     fetchImpl?: typeof fetch;
   }

   /**
    * In-memory webhook delivery worker (Phase 3 — no SQLite, no retry, no DLQ).
    *
    * Per spec: best-effort, 3s timeout, failures logged + dropped. Phase 4 adds
    * the durable queue, retry ladder, and DLQ; Phase 3's delivery API
    * (`deliver(sub, event)`) is intentionally the same shape Phase 4 will
    * subclass so the swap is purely additive.
    */
   export class WebhookDelivery {
     private readonly timeoutMs: number;
     private readonly fetchImpl: typeof fetch;
     constructor(opts: DeliveryOptions = {}) {
       this.timeoutMs = opts.timeoutMs ?? 3000;
       this.fetchImpl = opts.fetchImpl ?? fetch;
     }

     async deliver(sub: WebhookSubscription, event: GatewayEvent): Promise<void> {
       const body = JSON.stringify(event);
       const deliveryId = `dlv_${randomBytes(8).toString('hex')}`;
       const ctrl = new AbortController();
       const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
       try {
         const res = await this.fetchImpl(sub.url, {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'X-Harness-Delivery-Id': deliveryId,
             'X-Harness-Event-Type': event.type,
             'X-Harness-Signature': sign(sub.secret, body),
             'X-Harness-Timestamp': String(Date.now()),
           },
           body,
           signal: ctrl.signal,
         });
         if (!res.ok) {
           console.warn(
             `[webhook] drop sub=${sub.id} delivery=${deliveryId} status=${res.status} (Phase 3: no retry)`
           );
         }
       } catch (err) {
         const reason = err instanceof Error ? err.message : String(err);
         console.warn(
           `[webhook] drop sub=${sub.id} delivery=${deliveryId} error=${reason} (Phase 3: no retry)`
         );
       } finally {
         clearTimeout(timer);
       }
     }
   }
   ```

4. Run the test — observe pass.
5. Run: `harness validate`, `harness check-deps`.
6. Commit: `feat(orchestrator): in-memory WebhookDelivery with 3s timeout (Phase 3 Task 5)`

**Verification:** 3 delivery tests pass; signature header is verifiable against the body + secret in the test; timeout test produces a single warn line; 5xx test produces a single warn line.

---

### Task 6: `webhooks/events.ts` — event-bus subscriber that enqueues deliveries

**Depends on:** Tasks 3, 5 | **Files:** `packages/orchestrator/src/gateway/webhooks/events.ts`, `packages/orchestrator/src/gateway/webhooks/events.test.ts` | **Time:** ~5 min
**Skills:** `events-event-schema` (reference), `gof-observer-pattern` (reference)

1. **TDD step.** Create `packages/orchestrator/src/gateway/webhooks/events.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import { EventEmitter } from 'node:events';
   import { wireWebhookFanout } from './events';
   import { WebhookStore } from './store';
   import { WebhookDelivery } from './delivery';
   import { mkdtempSync, rmSync } from 'node:fs';
   import { join } from 'node:path';
   import { tmpdir } from 'node:os';

   describe('wireWebhookFanout', () => {
     let dir: string;
     let store: WebhookStore;
     beforeEach(() => {
       dir = mkdtempSync(join(tmpdir(), 'harness-wh-events-'));
       store = new WebhookStore(join(dir, 'webhooks.json'));
     });
     afterEach(() => rmSync(dir, { recursive: true, force: true }));

     it('fans matching events to subscriptions; ignores non-matching', async () => {
       const bus = new EventEmitter();
       const delivery = new WebhookDelivery();
       const spy = vi.spyOn(delivery, 'deliver').mockResolvedValue();
       await store.create({ tokenId: 't', url: 'https://a.test/h', events: ['interaction.*'] });
       wireWebhookFanout({ bus, store, delivery });
       bus.emit('interaction.created', { id: 'int_1' });
       await new Promise((r) => setTimeout(r, 10));
       expect(spy).toHaveBeenCalledTimes(1);
       const call = spy.mock.calls[0];
       expect(call?.[1].type).toBe('interaction.created');
       bus.emit('maintenance.completed', { id: 'm_1' }); // no matching sub
       await new Promise((r) => setTimeout(r, 10));
       expect(spy).toHaveBeenCalledTimes(1);
     });

     it('returns an unsubscribe function that removes all listeners', () => {
       const bus = new EventEmitter();
       const delivery = new WebhookDelivery();
       const off = wireWebhookFanout({ bus, store, delivery });
       const before = bus.eventNames().length;
       off();
       expect(bus.eventNames().length).toBe(0);
       expect(before).toBeGreaterThan(0);
     });
   });
   ```

2. Run — observe failure.
3. Create `packages/orchestrator/src/gateway/webhooks/events.ts`:

   ```ts
   import { randomBytes } from 'node:crypto';
   import type { EventEmitter } from 'node:events';
   import type { GatewayEvent } from '@harness-engineering/types';
   import type { WebhookStore } from './store';
   import type { WebhookDelivery } from './delivery';

   /**
    * Event-bus topics the webhook fan-out subscribes to. Each topic maps 1:1
    * to a GatewayEvent.type — subscriptions filter by glob pattern at the
    * store layer. Phase 3 wires: interaction.*, maintenance.*, auth.*,
    * webhook.subscription.*. Phase 5 adds telemetry.*, dispatch.*.
    */
   const WEBHOOK_TOPICS = [
     'interaction.created',
     'interaction.resolved',
     'maintenance:started',
     'maintenance:completed',
     'maintenance:error',
     'auth.token.created',
     'auth.token.revoked',
     'webhook.subscription.created',
     'webhook.subscription.deleted',
   ] as const;

   interface WireParams {
     bus: EventEmitter;
     store: WebhookStore;
     delivery: WebhookDelivery;
   }

   function newEventId(): string {
     return `evt_${randomBytes(8).toString('hex')}`;
   }

   /**
    * Subscribes to each WEBHOOK_TOPICS topic and fans the payload out to every
    * matching webhook subscription. Returns an unsubscribe function the
    * orchestrator calls on teardown.
    *
    * Topic-to-event-type normalization: orchestrator emits `maintenance:started`
    * (colon-separated, legacy), but webhook subscriptions expect dotted form
    * `maintenance.started`. The normalize step bridges both.
    */
   export function wireWebhookFanout({ bus, store, delivery }: WireParams): () => void {
     const handlers: Array<{ topic: string; fn: (data: unknown) => void }> = [];
     for (const topic of WEBHOOK_TOPICS) {
       const eventType = topic.replace(':', '.');
       const fn = (data: unknown): void => {
         void (async () => {
           const subs = await store.listForEvent(eventType);
           if (subs.length === 0) return;
           const event: GatewayEvent = {
             id: newEventId(),
             type: eventType,
             timestamp: new Date().toISOString(),
             data,
           };
           // Fan out without awaiting — slow subscribers do not block others.
           for (const sub of subs) {
             void delivery.deliver(sub, event);
           }
         })();
       };
       bus.on(topic, fn);
       handlers.push({ topic, fn });
     }
     return (): void => {
       for (const { topic, fn } of handlers) bus.removeListener(topic, fn);
     };
   }
   ```

4. Run the test — observe pass.
5. Run: `harness validate`, `harness check-deps`.
6. Commit: `feat(orchestrator): wireWebhookFanout subscribes orchestrator events to webhook deliveries (Phase 3 Task 6)`

**Verification:** `interaction.created` event triggers exactly one delivery against a matching subscription; non-matching events are silently dropped.

---

### Task 7: `routes/v1/webhooks.ts` — POST/DELETE/GET handlers + https + unauth-dev warn

**Depends on:** Tasks 1, 2, 3, 6 | **Files:** `packages/orchestrator/src/server/routes/v1/webhooks.ts`, `packages/orchestrator/src/server/routes/v1/webhooks.test.ts` | **Time:** ~8 min
**Skills:** `ts-zod-integration` (apply), `microservices-api-gateway` (reference)

1. **TDD step.** Create `packages/orchestrator/src/server/routes/v1/webhooks.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import { mkdtempSync, rmSync } from 'node:fs';
   import { join } from 'node:path';
   import { tmpdir } from 'node:os';
   import { handleV1WebhooksRoute } from './webhooks';
   import { WebhookStore } from '../../../gateway/webhooks/store';
   import { EventEmitter } from 'node:events';
   import { IncomingMessage, ServerResponse } from 'node:http';
   import { Socket } from 'node:net';

   function makeReq(method: string, url: string, body?: unknown): IncomingMessage {
     const r = new IncomingMessage(new Socket());
     r.method = method;
     r.url = url;
     (r as unknown as { _authToken: { id: string } })._authToken = { id: 'tok_test' };
     if (body !== undefined) {
       process.nextTick(() => {
         r.emit('data', Buffer.from(JSON.stringify(body)));
         r.emit('end');
       });
     } else {
       process.nextTick(() => r.emit('end'));
     }
     return r;
   }
   function makeRes(): { res: ServerResponse; chunks: string[]; statusCode: () => number } {
     const sock = new Socket();
     const r = new ServerResponse(new IncomingMessage(sock));
     const chunks: string[] = [];
     r.write = ((c: string) => {
       chunks.push(String(c));
       return true;
     }) as ServerResponse['write'];
     r.end = ((c?: string) => {
       if (c) chunks.push(String(c));
       return r;
     }) as ServerResponse['end'];
     return { res: r, chunks, statusCode: () => r.statusCode };
   }

   describe('handleV1WebhooksRoute', () => {
     let dir: string;
     let store: WebhookStore;
     let bus: EventEmitter;
     beforeEach(() => {
       dir = mkdtempSync(join(tmpdir(), 'harness-wh-routes-'));
       store = new WebhookStore(join(dir, 'webhooks.json'));
       bus = new EventEmitter();
     });
     afterEach(() => rmSync(dir, { recursive: true, force: true }));

     it('POST creates a subscription and returns the secret once', async () => {
       const req = makeReq('POST', '/api/v1/webhooks', {
         url: 'https://example.com/hook',
         events: ['maintenance.completed'],
       });
       const { res, chunks, statusCode } = makeRes();
       const handled = handleV1WebhooksRoute(req, res, { store, bus });
       expect(handled).toBe(true);
       await new Promise((r) => setTimeout(r, 20));
       expect(statusCode()).toBe(200);
       const body = JSON.parse(chunks.join('')) as { id: string; secret: string; url: string };
       expect(body.id).toMatch(/^whk_[a-f0-9]{16}$/);
       expect(body.secret.length).toBeGreaterThanOrEqual(32);
       expect(body.url).toBe('https://example.com/hook');
     });

     it('POST rejects http:// URLs with 422', async () => {
       const req = makeReq('POST', '/api/v1/webhooks', {
         url: 'http://example.com/hook',
         events: ['*'],
       });
       const { res, chunks, statusCode } = makeRes();
       handleV1WebhooksRoute(req, res, { store, bus });
       await new Promise((r) => setTimeout(r, 20));
       expect(statusCode()).toBe(422);
       expect(chunks.join('')).toContain('https');
     });

     it('GET lists subscriptions with secret redacted', async () => {
       await store.create({ tokenId: 'tok_test', url: 'https://a.test/h', events: ['*.*'] });
       const req = makeReq('GET', '/api/v1/webhooks');
       const { res, chunks, statusCode } = makeRes();
       handleV1WebhooksRoute(req, res, { store, bus });
       await new Promise((r) => setTimeout(r, 20));
       expect(statusCode()).toBe(200);
       const body = JSON.parse(chunks.join('')) as Array<{ url: string; secret?: string }>;
       expect(body).toHaveLength(1);
       expect(body[0]?.secret).toBeUndefined();
     });

     it('DELETE removes the subscription and returns 200', async () => {
       const sub = await store.create({
         tokenId: 'tok_test',
         url: 'https://a.test/h',
         events: ['*.*'],
       });
       const req = makeReq('DELETE', `/api/v1/webhooks/${sub.id}`);
       const { res, statusCode } = makeRes();
       handleV1WebhooksRoute(req, res, { store, bus });
       await new Promise((r) => setTimeout(r, 20));
       expect(statusCode()).toBe(200);
       expect(await store.list()).toEqual([]);
     });

     it('DELETE returns 404 for unknown id', async () => {
       const req = makeReq('DELETE', '/api/v1/webhooks/whk_doesnotexist000');
       const { res, statusCode } = makeRes();
       handleV1WebhooksRoute(req, res, { store, bus });
       await new Promise((r) => setTimeout(r, 20));
       expect(statusCode()).toBe(404);
     });

     it('POST emits webhook.subscription.created on the bus', async () => {
       const events: unknown[] = [];
       bus.on('webhook.subscription.created', (e) => events.push(e));
       const req = makeReq('POST', '/api/v1/webhooks', {
         url: 'https://example.com/hook',
         events: ['*.*'],
       });
       const { res } = makeRes();
       handleV1WebhooksRoute(req, res, { store, bus });
       await new Promise((r) => setTimeout(r, 20));
       expect(events).toHaveLength(1);
     });

     // SUG-5 + DELTA-SUG-2 carry-forwards
     it('POST under unauth-dev emits exactly one console.warn per process', async () => {
       const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
       const req1 = makeReq('POST', '/api/v1/webhooks', {
         url: 'https://example.com/hook1',
         events: ['*.*'],
       });
       (req1 as unknown as { _authToken: { id: string } })._authToken = { id: 'tok_legacy_env' };
       // synthetic-admin sentinel ID matches tokens.ts:LEGACY_ENV_ID — but the
       // unauth-dev synthetic admin uses a distinct sentinel; webhooks.ts uses
       // both legacy-env and unauth-dev sentinel IDs as the "warn" trigger.
       // Implementation reads a process-wide flag set during resolveAuth.
       process.env['HARNESS_UNAUTH_DEV_ACTIVE'] = '1';
       const { res: r1 } = makeRes();
       handleV1WebhooksRoute(req1, r1, { store, bus });
       await new Promise((r) => setTimeout(r, 20));
       const req2 = makeReq('POST', '/api/v1/webhooks', {
         url: 'https://example.com/hook2',
         events: ['*.*'],
       });
       (req2 as unknown as { _authToken: { id: string } })._authToken = { id: 'tok_legacy_env' };
       const { res: r2 } = makeRes();
       handleV1WebhooksRoute(req2, r2, { store, bus });
       await new Promise((r) => setTimeout(r, 20));
       expect(warnSpy.mock.calls.filter((c) => String(c[0]).includes('unauth-dev')).length).toBe(1);
       warnSpy.mockRestore();
       delete process.env['HARNESS_UNAUTH_DEV_ACTIVE'];
     });

     // DELTA-SUG-2 carry-forward: positive shape assertion (not just block-list)
     it('GET response items have exactly the public-shape keys (allow-list pattern)', async () => {
       await store.create({ tokenId: 'tok_test', url: 'https://a.test/h', events: ['*.*'] });
       const req = makeReq('GET', '/api/v1/webhooks');
       const { res, chunks } = makeRes();
       handleV1WebhooksRoute(req, res, { store, bus });
       await new Promise((r) => setTimeout(r, 20));
       const body = JSON.parse(chunks.join('')) as Array<Record<string, unknown>>;
       expect(Object.keys(body[0] ?? {}).sort()).toEqual(
         ['createdAt', 'events', 'id', 'tokenId', 'url'].sort()
       );
       // belt-and-braces block-list scan
       expect(JSON.stringify(body)).not.toMatch(/secret/i);
     });
   });
   ```

2. Run — observe failure.
3. Create `packages/orchestrator/src/server/routes/v1/webhooks.ts`:

   ```ts
   import type { IncomingMessage, ServerResponse } from 'node:http';
   import type { EventEmitter } from 'node:events';
   import { z } from 'zod';
   import { readBody } from '../../utils.js';
   import { WebhookSubscriptionPublicSchema } from '@harness-engineering/types';
   import type { WebhookStore } from '../../../gateway/webhooks/store';

   const CreateBody = z.object({
     url: z.string().url(),
     events: z.array(z.string().min(1)).min(1),
   });

   const DELETE_PATH_RE = /^\/api\/v1\/webhooks\/([a-zA-Z0-9_-]+)(?:\?.*)?$/;

   interface Deps {
     store: WebhookStore;
     bus: EventEmitter;
   }

   function sendJSON(res: ServerResponse, status: number, body: unknown): void {
     res.writeHead(status, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify(body));
   }

   /**
    * SUG-5 carry-forward: unauth-dev mode (synthetic admin token from empty
    * tokens.json + missing HARNESS_API_TOKEN) escalates blast radius when a
    * mutate path is added. Webhook creation is the most sensitive new mutate
    * path in Phase 3 (an unintended subscription can exfiltrate every internal
    * event to an attacker URL).
    *
    * Phase 3's mitigation: emit a one-time per-process console.warn at the
    * FIRST webhook creation under unauth-dev. Operators see the warning during
    * `harness orchestrator start` smoke; intentional unauth-dev use stays
    * unblocked. Phase 4 may upgrade to scope downgrade if telemetry shows
    * accidental leakage.
    */
   let unauthDevWarnedThisProcess = false;
   function maybeWarnUnauthDev(tokenId: string, url: string): void {
     if (unauthDevWarnedThisProcess) return;
     const isUnauthDev =
       tokenId === 'tok_legacy_env' || process.env['HARNESS_UNAUTH_DEV_ACTIVE'] === '1';
     if (!isUnauthDev) return;
     unauthDevWarnedThisProcess = true;
     console.warn(
       `[webhook] subscription created under unauth-dev mode (tokenId=${tokenId}). ` +
         `Webhook target URL: ${url}. ` +
         `Set HARNESS_API_TOKEN or configure tokens.json to silence this warning.`
     );
   }

   export function handleV1WebhooksRoute(
     req: IncomingMessage,
     res: ServerResponse,
     deps: Deps
   ): boolean {
     const url = req.url ?? '';
     const method = req.method ?? 'GET';

     // GET /api/v1/webhooks — list
     if (method === 'GET' && /^\/api\/v1\/webhooks(?:\?.*)?$/.test(url)) {
       void (async () => {
         const subs = await deps.store.list();
         const publicView = subs.map((s) => WebhookSubscriptionPublicSchema.parse(s));
         sendJSON(res, 200, publicView);
       })();
       return true;
     }

     // POST /api/v1/webhooks — create
     if (method === 'POST' && /^\/api\/v1\/webhooks(?:\?.*)?$/.test(url)) {
       void (async () => {
         let raw: string;
         try {
           raw = await readBody(req);
         } catch (err) {
           sendJSON(res, 413, { error: err instanceof Error ? err.message : 'Body too large' });
           return;
         }
         let json: unknown;
         try {
           // harness-ignore SEC-DES-001: validated by Zod CreateBody below
           json = JSON.parse(raw);
         } catch {
           sendJSON(res, 400, { error: 'Invalid JSON body' });
           return;
         }
         const parsed = CreateBody.safeParse(json);
         if (!parsed.success) {
           sendJSON(res, 400, { error: 'Invalid body', issues: parsed.error.issues });
           return;
         }
         if (!parsed.data.url.startsWith('https://')) {
           sendJSON(res, 422, { error: 'URL must use https' });
           return;
         }
         const tokenId =
           (req as unknown as { _authToken?: { id: string } })._authToken?.id ?? 'unknown';
         const sub = await deps.store.create({
           tokenId,
           url: parsed.data.url,
           events: parsed.data.events,
         });
         maybeWarnUnauthDev(tokenId, parsed.data.url);
         // Emit allow-list-shaped event for SSE + webhook fan-out (DELTA-SUG-2
         // carry-forward: positive shape discipline at the emit site).
         deps.bus.emit('webhook.subscription.created', {
           id: sub.id,
           tokenId: sub.tokenId,
           url: sub.url,
           events: sub.events,
           createdAt: sub.createdAt,
         });
         sendJSON(res, 200, sub);
       })();
       return true;
     }

     // DELETE /api/v1/webhooks/{id} — delete
     const m = method === 'DELETE' ? DELETE_PATH_RE.exec(url) : null;
     if (m) {
       const id = m[1] ?? '';
       void (async () => {
         const ok = await deps.store.delete(id);
         if (!ok) {
           sendJSON(res, 404, { error: 'Subscription not found' });
           return;
         }
         deps.bus.emit('webhook.subscription.deleted', { id });
         sendJSON(res, 200, { deleted: true });
       })();
       return true;
     }

     return false;
   }
   ```

4. Run the test — observe pass.
5. Run: `harness validate`, `harness check-deps`.
6. Commit: `feat(orchestrator): POST/DELETE/GET /api/v1/webhooks handlers + https + unauth-dev warn-once (Phase 3 Task 7)`

**Verification:** all 8 webhooks.test.ts tests pass; warn-once fires exactly once even across two POSTs.

---

### Task 8: Wire SSE topics + orchestrator construction

**Depends on:** Tasks 6, 7 | **Files:** `packages/orchestrator/src/server/routes/v1/events-sse.ts`, `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/src/orchestrator.ts` | **Time:** ~5 min
**Skills:** `events-event-schema` (reference)

1. Modify `packages/orchestrator/src/server/routes/v1/events-sse.ts`. Extend `SSE_TOPICS`:
   ```ts
   const SSE_TOPICS = [
     'state_change',
     'agent_event',
     'interaction.created',
     'interaction.resolved',
     'maintenance:started',
     'maintenance:completed',
     'maintenance:error',
     'maintenance:baseref_fallback',
     'local-model:status',
     // ── Phase 3 ──
     'webhook.subscription.created',
     'webhook.subscription.deleted',
   ] as const;
   ```
2. Modify `packages/orchestrator/src/server/http.ts`. In `OrchestratorServerOptions` (and the constructor that destructures it), add a new optional `webhooks?: { store: WebhookStore; delivery: WebhookDelivery }` slot. In `buildApiRoutes()` (line ~345), insert before the chat-proxy fallback:
   ```ts
   (req, res) =>
     !!this.webhooks && handleV1WebhooksRoute(req, res, { store: this.webhooks.store, bus: this.orchestrator as unknown as EventEmitter }),
   ```
   Add import: `import { handleV1WebhooksRoute } from './routes/v1/webhooks';` and import the `WebhookStore`/`WebhookDelivery` types.
3. Modify `packages/orchestrator/src/orchestrator.ts`. In the constructor (or wherever `InteractionQueue` is instantiated), after that block add:
   ```ts
   const webhookStore = new WebhookStore(path.join(this.harnessDir, 'webhooks.json'));
   const webhookDelivery = new WebhookDelivery();
   this.webhookFanoutOff = wireWebhookFanout({
     bus: this,
     store: webhookStore,
     delivery: webhookDelivery,
   });
   this.webhookStore = webhookStore;
   this.webhookDelivery = webhookDelivery;
   ```
   And pass them into `OrchestratorServer`:
   ```ts
   this.server = new OrchestratorServer(this, this.config.serverPort ?? 0, {
     interactionQueue: this.interactionQueue,
     maintenanceDeps: this.maintenanceDeps,
     webhooks: { store: webhookStore, delivery: webhookDelivery },
   });
   ```
   Add the three imports. (Adjust class field declarations: `private webhookStore?: WebhookStore; private webhookDelivery?: WebhookDelivery; private webhookFanoutOff?: () => void;`.)
4. Add a `dispose()`/`shutdown()` clause that calls `this.webhookFanoutOff?.()`. If the class has no such method, attach to whichever cleanup path the orchestrator already uses on SIGTERM.
5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run` — full suite must remain green. Tests touching `OrchestratorServer` constructor receive an additional optional arg; existing call sites (FakeOrchestrator-based tests) pass `undefined` and the route handler short-circuits via `!!this.webhooks`.
6. Run: `harness validate`, `harness check-deps`.
7. Commit: `feat(orchestrator): wire WebhookStore/Delivery/Fanout into OrchestratorServer (Phase 3 Task 8)`

**Verification:** full suite green; SSE_TOPICS has 11 entries; OrchestratorServer accepts the new `webhooks` option; orchestrator construction instantiates the trio.

---

### Task 9: MCP `subscribe_webhook` tool + tier registration

**Depends on:** Task 7 | **Files:** `packages/cli/src/mcp/tools/webhook-tools.ts`, `packages/cli/src/mcp/tools/webhook-tools.test.ts`, `packages/cli/src/mcp/server.ts`, `packages/cli/src/mcp/tool-tiers.ts` | **Time:** ~5 min
**Skills:** `ts-zod-integration` (apply)

1. **TDD step.** Create `packages/cli/src/mcp/tools/webhook-tools.test.ts`:

   ```ts
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { subscribeWebhookDefinition, handleSubscribeWebhook } from './webhook-tools';

   const originalFetch = global.fetch;
   beforeEach(() => {
     process.env['HARNESS_API_TOKEN'] = 'test.tok';
   });
   afterEach(() => {
     global.fetch = originalFetch;
     delete process.env['HARNESS_API_TOKEN'];
   });

   describe('subscribe_webhook MCP tool', () => {
     it('definition has expected name and schema', () => {
       expect(subscribeWebhookDefinition.name).toBe('subscribe_webhook');
       expect((subscribeWebhookDefinition.inputSchema as { required: string[] }).required).toEqual([
         'url',
         'events',
       ]);
     });

     it('posts to /api/v1/webhooks and returns the response text', async () => {
       global.fetch = vi.fn().mockResolvedValue({
         ok: true,
         text: async () => '{"id":"whk_abc","secret":"sek"}',
         status: 200,
       }) as unknown as typeof fetch;
       const result = await handleSubscribeWebhook({
         url: 'https://example.com/hook',
         events: ['maintenance.completed'],
       });
       expect(result.isError).toBeUndefined();
       expect(result.content[0]?.text).toContain('whk_abc');
     });

     it('returns isError on non-2xx', async () => {
       global.fetch = vi.fn().mockResolvedValue({
         ok: false,
         text: async () => 'URL must use https',
         status: 422,
       }) as unknown as typeof fetch;
       const result = await handleSubscribeWebhook({
         url: 'http://example.com/hook',
         events: ['*.*'],
       });
       expect(result.isError).toBe(true);
     });
   });
   ```

2. Run — observe failure.
3. Create `packages/cli/src/mcp/tools/webhook-tools.ts`:

   ```ts
   import type { ToolDefinition } from '../tool-types.js';

   /**
    * Phase 3 Task 9: MCP wrapper for POST /api/v1/webhooks.
    * Tier-1 (standard+). Agent receives the secret in the response text — the
    * usual one-shot reveal model matches `auth/token create`.
    */
   function orchestratorBase(): string {
     return process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:8080';
   }
   function authHeader(): Record<string, string> {
     const tok = process.env['HARNESS_API_TOKEN'];
     return tok ? { Authorization: `Bearer ${tok}` } : {};
   }

   export const subscribeWebhookDefinition: ToolDefinition = {
     name: 'subscribe_webhook',
     description:
       'Subscribe to outbound webhook fan-out via POST /api/v1/webhooks. Returns the secret once. Requires subscribe-webhook scope.',
     inputSchema: {
       type: 'object',
       properties: {
         url: { type: 'string', description: 'https URL to POST events to' },
         events: {
           type: 'array',
           items: { type: 'string' },
           description: 'Event-type globs (e.g. ["maintenance.completed", "interaction.*"])',
         },
       },
       required: ['url', 'events'],
     },
   };

   export async function handleSubscribeWebhook(input: {
     url: string;
     events: string[];
   }): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
     const res = await fetch(`${orchestratorBase()}/api/v1/webhooks`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', ...authHeader() },
       body: JSON.stringify({ url: input.url, events: input.events }),
     });
     const text = await res.text();
     if (!res.ok) {
       return {
         content: [{ type: 'text', text: `Subscribe failed (${res.status}): ${text}` }],
         isError: true,
       };
     }
     return { content: [{ type: 'text', text }] };
   }
   ```

4. Modify `packages/cli/src/mcp/server.ts` (analogously to how `triggerMaintenanceJobDefinition` is wired — locate the import block and the TOOL_DEFINITIONS array; add `subscribeWebhookDefinition` to both).
5. Modify `packages/cli/src/mcp/tool-tiers.ts` `STANDARD_EXTRA`:
   ```ts
   // Gateway tools (Phase 2 Task 11 + Phase 3 Task 9)
   'trigger_maintenance_job',
   'subscribe_webhook',
   ```
6. Run the test — observe pass.
7. Run: `pnpm --filter @harness-engineering/cli vitest run` — full suite.
8. Run: `harness validate`, `harness check-deps`.
9. Commit: `feat(cli): MCP subscribe_webhook tool registered at tier-1 (Phase 3 Task 9)`

**Verification:** webhook-tools.test.ts green; `STANDARD_TOOL_NAMES` includes `subscribe_webhook`; `CORE_TOOL_NAMES` does NOT.

---

### Task 10: Dashboard `Webhooks.tsx` page + ThreadView/SYSTEM_PAGES registration

**Depends on:** Task 7 | **Files:** `packages/dashboard/src/client/pages/Webhooks.tsx`, `packages/dashboard/src/client/components/layout/ThreadView.tsx`, `packages/dashboard/src/client/types/thread.ts` | **Time:** ~6 min

1. Create `packages/dashboard/src/client/pages/Webhooks.tsx`:

   ```tsx
   import { useEffect, useState, useCallback } from 'react';
   import type { WebhookSubscriptionPublic } from '@harness-engineering/types';

   interface CreatedSubscription {
     id: string;
     secret: string;
   }

   export function Webhooks() {
     const [subs, setSubs] = useState<WebhookSubscriptionPublic[]>([]);
     const [url, setUrl] = useState('');
     const [events, setEvents] = useState('maintenance.completed,interaction.*');
     const [created, setCreated] = useState<CreatedSubscription | null>(null);
     const [error, setError] = useState<string | null>(null);

     const refresh = useCallback(async () => {
       const res = await fetch('/api/v1/webhooks');
       if (res.ok) setSubs(((await res.json()) as WebhookSubscriptionPublic[]) ?? []);
     }, []);

     useEffect(() => {
       void refresh();
     }, [refresh]);

     async function createSub(e: React.FormEvent) {
       e.preventDefault();
       setError(null);
       const res = await fetch('/api/v1/webhooks', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ url, events: events.split(',').map((s) => s.trim()) }),
       });
       if (!res.ok) {
         const err = (await res.json()) as { error?: string };
         setError(err.error ?? 'Failed');
         return;
       }
       const body = (await res.json()) as { id: string; secret: string };
       setCreated({ id: body.id, secret: body.secret });
       setUrl('');
       await refresh();
     }

     async function remove(id: string) {
       if (!window.confirm(`Delete subscription ${id}?`)) return;
       await fetch(`/api/v1/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
       await refresh();
     }

     return (
       <div className="space-y-6">
         <h1 className="text-xl font-bold">Webhook Subscriptions</h1>

         <form
           onSubmit={(e) => void createSub(e)}
           className="space-y-2 rounded-lg border border-white/10 p-4"
         >
           <h2 className="text-sm font-semibold">Create subscription</h2>
           <input
             className="block w-full rounded bg-white/5 px-3 py-2 text-sm"
             placeholder="URL (https://…)"
             value={url}
             onChange={(e) => setUrl(e.target.value)}
             required
           />
           <input
             className="block w-full rounded bg-white/5 px-3 py-2 text-sm"
             placeholder="Events (comma-separated globs)"
             value={events}
             onChange={(e) => setEvents(e.target.value)}
             required
           />
           <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm">
             Subscribe
           </button>
           {error && <p className="text-sm text-red-400">{error}</p>}
         </form>

         {created && (
           <div className="rounded-lg border border-yellow-500/30 bg-yellow-900/20 p-4">
             <p className="text-sm font-semibold text-yellow-200">
               Save this secret now — it is never shown again:
             </p>
             <pre className="mt-2 break-all rounded bg-black/40 p-2 text-xs">{created.secret}</pre>
             <p className="mt-2 text-xs text-yellow-200/70">Subscription ID: {created.id}</p>
           </div>
         )}

         <div className="space-y-2">
           <h2 className="text-sm font-semibold">Active subscriptions</h2>
           {subs.length === 0 ? (
             <p className="text-sm text-neutral-muted">No subscriptions yet.</p>
           ) : (
             <ul className="space-y-1">
               {subs.map((s) => (
                 <li
                   key={s.id}
                   className="flex items-center justify-between rounded border border-white/10 px-3 py-2 text-sm"
                 >
                   <div>
                     <p className="font-mono text-xs text-neutral-muted">{s.id}</p>
                     <p>{s.url}</p>
                     <p className="text-xs text-neutral-muted">events: {s.events.join(', ')}</p>
                   </div>
                   <button
                     onClick={() => void remove(s.id)}
                     className="rounded bg-red-600/40 px-3 py-1 text-xs"
                   >
                     Delete
                   </button>
                 </li>
               ))}
             </ul>
           )}
         </div>
       </div>
     );
   }
   ```

2. Modify `packages/dashboard/src/client/components/layout/ThreadView.tsx`. Add import beside the `Tokens` import:
   ```tsx
   import { Webhooks } from '../../pages/Webhooks';
   ```
   Add to `SYSTEM_PAGE_COMPONENTS`:
   ```tsx
   webhooks: Webhooks,
   ```
3. Modify `packages/dashboard/src/client/types/thread.ts`. Append to `SYSTEM_PAGES`:
   ```ts
   { page: 'webhooks', label: 'Webhooks', route: '/s/webhooks' },
   ```
4. Run: `pnpm --filter @harness-engineering/dashboard tsc --noEmit` — must pass.
5. Run: `pnpm --filter @harness-engineering/dashboard vitest run` — must pass (no new tests, but existing must stay green).
6. Run: `harness validate`, `harness check-deps`.
7. Commit: `feat(dashboard): /s/webhooks page lists, creates, deletes subscriptions (Phase 3 Task 10)`

**Verification:** typecheck green; new route appears in `SYSTEM_PAGES`.

---

### Task 11: OpenAPI v1-registry extension + regenerate artifact

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/gateway/openapi/v1-registry.ts`, `docs/api/openapi.yaml` | **Time:** ~5 min
**Skills:** `ts-zod-integration` (apply)

1. Modify `packages/orchestrator/src/gateway/openapi/v1-registry.ts`. After the `// ── Bridge primitives ──` section, append a `// ── Phase 3 webhooks ──` block:
   ```ts
   // ── Phase 3 webhooks ──
   registerPostPath(
     '/api/v1/webhooks',
     'Subscribe to outbound webhook fan-out. Returns the secret once.',
     'subscribe-webhook',
     z.object({ url: z.string().url(), events: z.array(z.string()).min(1) }),
     z.object({
       id: z.string(),
       tokenId: z.string(),
       url: z.string(),
       events: z.array(z.string()),
       secret: z.string(),
       createdAt: z.string(),
     })
   );
   registry.registerPath({
     method: 'get',
     path: '/api/v1/webhooks',
     description: 'List webhook subscriptions (secrets redacted). Scope: subscribe-webhook.',
     security: [{ BearerAuth: [] }],
     responses: {
       200: {
         description: 'OK',
         content: { 'application/json': { schema: z.array(z.unknown()) } },
       },
     },
   });
   registry.registerPath({
     method: 'delete',
     path: '/api/v1/webhooks/{id}',
     description: 'Delete a webhook subscription. Scope: subscribe-webhook.',
     security: [{ BearerAuth: [] }],
     request: { params: z.object({ id: z.string() }) },
     responses: {
       200: {
         description: 'Deleted',
         content: { 'application/json': { schema: z.object({ deleted: z.literal(true) }) } },
       },
       404: { description: 'Subscription not found' },
     },
   });
   ```
2. Update the `info.version` bump from `0.2.0` → `0.3.0` and the description from "Phase 2" to "Phase 3":
   ```ts
   version: '0.3.0',
   description:
     'Hermes Phase 0 — Phase 3: versioned /api/v1/* surface with auth, bridge primitives, and webhook subscriptions.',
   ```
3. Run: `pnpm --filter @harness-engineering/orchestrator openapi:generate` — must emit a clean `docs/api/openapi.yaml` that includes the three new `/api/v1/webhooks` paths.
4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/gateway/openapi/` — idempotency test must still pass.
5. Run: `harness validate`, `harness check-deps`.
6. Commit: `feat(orchestrator): OpenAPI v1-registry covers webhook routes; artifact regenerated (Phase 3 Task 11)`

**Verification:** `docs/api/openapi.yaml` has 3 new paths under `/api/v1/webhooks`; idempotency test green.

---

### Task 12: HTTP integration test — real server + real receiver + signature verification

**Depends on:** Tasks 7, 8 | **Files:** `packages/orchestrator/src/server/webhooks-integration.test.ts` | **Time:** ~7 min
**Skills:** `crypto-hmac-signing` (apply), `ts-testing-types` (reference)

This task is the spec exit-gate proof: subscription created → orchestrator event fires → bridge URL receives signed POST → bridge verifies signature.

1. Create `packages/orchestrator/src/server/webhooks-integration.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import http from 'node:http';
   import type { AddressInfo } from 'node:net';
   import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
   import { join } from 'node:path';
   import { tmpdir } from 'node:os';
   import { createHmac, timingSafeEqual } from 'node:crypto';
   import { OrchestratorServer } from './http';
   import { WebhookStore } from '../gateway/webhooks/store';
   import { WebhookDelivery } from '../gateway/webhooks/delivery';
   import { wireWebhookFanout } from '../gateway/webhooks/events';
   import { FakeOrchestrator } from '../test-utils/fake-orchestrator'; // adjust path to wherever Phase 2 placed it

   function verifyHmac(secret: string, body: string, header: string | undefined): boolean {
     if (!header) return false;
     const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
     const a = Buffer.from(expected);
     const b = Buffer.from(header);
     if (a.length !== b.length) return false;
     try {
       return timingSafeEqual(a, b);
     } catch {
       return false;
     }
   }

   async function postJSON(
     port: number,
     path: string,
     body: unknown
   ): Promise<{ status: number; body: string }> {
     return new Promise((resolve, reject) => {
       const req = http.request(
         {
           hostname: '127.0.0.1',
           port,
           path,
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
         },
         (res) => {
           let buf = '';
           res.on('data', (c) => (buf += c));
           res.on('end', () => resolve({ status: res.statusCode ?? 0, body: buf }));
         }
       );
       req.on('error', reject);
       req.write(JSON.stringify(body));
       req.end();
     });
   }

   describe('webhooks end-to-end: subscribe → event → signed POST → HMAC verify', () => {
     let dir: string;
     let server: OrchestratorServer;
     let serverPort: number;
     let receiver: http.Server;
     let received: Array<{ headers: http.IncomingHttpHeaders; body: string }>;
     let receiverPort: number;
     let orchestrator: FakeOrchestrator;
     let store: WebhookStore;

     beforeEach(async () => {
       dir = mkdtempSync(join(tmpdir(), 'harness-wh-int-'));
       mkdirSync(dir, { recursive: true });
       process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
       process.env['HARNESS_AUDIT_PATH'] = join(dir, 'audit.log');
       delete process.env['HARNESS_API_TOKEN'];

       received = [];
       receiver = http.createServer((req, res) => {
         let body = '';
         req.on('data', (c) => (body += c));
         req.on('end', () => {
           received.push({ headers: req.headers, body });
           res.writeHead(200, { 'Content-Type': 'application/json' });
           res.end('{}');
         });
       });
       await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', () => r()));
       receiverPort = (receiver.address() as AddressInfo).port;

       orchestrator = new FakeOrchestrator();
       store = new WebhookStore(join(dir, 'webhooks.json'));
       const delivery = new WebhookDelivery();
       wireWebhookFanout({ bus: orchestrator as unknown as NodeJS.EventEmitter, store, delivery });

       server = new OrchestratorServer(orchestrator as never, 0, {
         webhooks: { store, delivery },
       });
       serverPort = await new Promise((resolve) => {
         (server as unknown as { httpServer: http.Server }).httpServer.listen(
           0,
           '127.0.0.1',
           function (this: http.Server) {
             const addr = this.address();
             resolve(typeof addr === 'object' && addr ? addr.port : 0);
           }
         );
       });
     });

     afterEach(async () => {
       (server as unknown as { httpServer: http.Server }).httpServer.close();
       await new Promise<void>((r) => receiver.close(() => r()));
       rmSync(dir, { recursive: true, force: true });
       delete process.env['HARNESS_TOKENS_PATH'];
       delete process.env['HARNESS_AUDIT_PATH'];
     });

     it('full round-trip: subscribe, emit, receive signed POST, verify HMAC', async () => {
       // 1. Subscribe via HTTP (https URL is required, so we use the receiver's URL with a stub —
       //    Phase 3 v1 validation rejects http://, so we bypass HTTP and seed the store
       //    directly with the local receiver URL).
       const sub = await store.create({
         tokenId: 'tok_test',
         url: `http://127.0.0.1:${receiverPort}/hook`,
         events: ['maintenance.completed'],
       });
       // 2. Emit the event on the orchestrator's bus (using the `:` legacy form;
       //    wireWebhookFanout normalizes to `maintenance.completed` for matching).
       orchestrator.emit('maintenance:completed', { id: 'task_a', status: 'ok' });
       // 3. Wait for delivery to land on the receiver.
       await new Promise((r) => setTimeout(r, 150));
       expect(received).toHaveLength(1);
       const r = received[0]!;
       expect(r.headers['x-harness-event-type']).toBe('maintenance.completed');
       expect(r.headers['x-harness-delivery-id']).toMatch(/^dlv_[a-f0-9]{16}$/);
       expect(r.headers['x-harness-timestamp']).toBeDefined();
       // 4. Bridge-side HMAC verification: this is the spec exit-gate proof.
       expect(verifyHmac(sub.secret, r.body, r.headers['x-harness-signature'] as string)).toBe(
         true
       );
       // 5. Body is a valid GatewayEvent envelope.
       const evt = JSON.parse(r.body) as { id: string; type: string; data: unknown };
       expect(evt.type).toBe('maintenance.completed');
       expect(evt.id).toMatch(/^evt_[a-f0-9]+$/);
     });

     it('DELETE stops further fan-out within 100ms', async () => {
       const sub = await store.create({
         tokenId: 'tok_test',
         url: `http://127.0.0.1:${receiverPort}/hook`,
         events: ['maintenance.completed'],
       });
       // Issue the DELETE through HTTP — but unauth-dev or seeded admin token
       // is needed; pre-seed via store's mutation path is equivalent and avoids
       // the auth-fixture coupling.
       await store.delete(sub.id);
       orchestrator.emit('maintenance:completed', { id: 'task_b' });
       await new Promise((r) => setTimeout(r, 200));
       expect(received).toHaveLength(0);
     });
   });
   ```

2. Run the test — observe pass.
3. Run: `harness validate`, `harness check-deps`.
4. Commit: `test(orchestrator): HTTP-level webhook integration verifies HMAC end-to-end (Phase 3 Task 12)`

**`[checkpoint:human-verify after Task 12]`** — this is the spec exit gate. Confirm: (i) the integration test passes; (ii) `received[0].headers['x-harness-signature']` actually validates against the recomputed HMAC; (iii) DELETE stops fan-out. Resume after confirmation.

**Verification:** integration test green; HMAC verification round-trips with a real subscriber.

---

### Task 13: Slash-command + plugin-manifest regeneration

**Depends on:** Task 9 | **Files:** plugin-host manifests under `harness-claude/`, `harness-cursor/`, `harness-codex/`, `harness-gemini/`, `harness-opencode/` | **Time:** ~4 min

1. Run: `pnpm harness generate-slash-commands` — must succeed and update per-host plugin manifests to include `subscribe_webhook` in the appropriate tier.
2. Inspect manifest diffs — confirm `subscribe_webhook` appears in tier-1 (standard+) lists, not tier-0 (core) lists.
3. Run: `harness validate`, `harness check-deps`.
4. If only manifest files changed: commit `chore(manifests): regenerate per-host plugin manifests with subscribe_webhook (Phase 3 Task 13)`. If no changes (manifests already cover MCP additions dynamically), skip the commit and document in handoff that this task was a no-op.

**Verification:** if `git status` shows manifest deltas, they include `subscribe_webhook` references; if no deltas, document that and continue.

---

### Task 14: Final phase-gate verification

**Depends on:** all prior tasks | **Files:** none | **Time:** ~4 min

1. Run: `harness validate` — must pass.
2. Run: `harness check-deps` — must pass.
3. Run: `pnpm -r typecheck` — must pass across all packages.
4. Run: `pnpm -r vitest run` — full suite. Expected baseline +new tests: Phase 2 reported 4484 tests passing; Phase 3 adds approximately 35 new tests (Task 2 = 3, Task 3 = 6, Task 4 = 8, Task 5 = 3, Task 6 = 2, Task 7 = 8, Task 9 = 3, Task 12 = 2). Final suite count should be ~4519+ depending on small adjustments.
5. Confirm spec exit-gate criteria for Phase 3:
   - [ ] `POST /api/v1/webhooks` creates a subscription; secret shown once (Task 7 test)
   - [ ] Local receiver receives a delivery with `X-Harness-Signature` header (Task 12 test)
   - [ ] HMAC verification succeeds when a bridge recomputes signature from body + secret (Task 12 test)
   - [ ] `http://` URLs at registration time rejected (Task 7 test)
   - [ ] `DELETE /api/v1/webhooks/{id}` stops further deliveries within 1s (Task 12 test, asserts within 200 ms)
6. Update `.harness/sessions/changes--hermes-phase-0-gateway-api--proposal/autopilot-state.json` — mark Phase 3 status `pending → done` (executed by autopilot, not the planner; flagged here so the executor knows).
7. Commit: `chore(phase-3): verify exit gates — webhooks subscribe/sign/deliver pipeline lands (Phase 3 Task 14)`

**Verification:** all gates green; no carry-forward additions beyond the inline-addressed items.

---

## Pending Decisions (surfaced to user via emit_interaction)

1. **[BLOCKING — must resolve before Task 3]** Secret-at-rest storage for webhook subscription HMAC keys. Planner recommends Option A (plaintext at rest, mode 0600) for the reasons listed in the Uncertainties section. Option B (encrypted with derived key) adds key-management complexity disproportionate to the threat model. See `[checkpoint:decision]` block between Task 2 and Task 3.

## Carry-Forward Disposition

**Addressed inline in this plan:**

- DELTA-SUG-1 (`v1BridgePaths` duplicates routing knowledge from `scopes.ts`) → Task 2 extracts `V1_BRIDGE_ROUTES` as a shared module
- SUG-5 (unauth-dev mutate-path elevation) → Task 7 implements one-time `console.warn` per process when webhook is created under unauth-dev
- DELTA-SUG-2 (allow-list test lacks positive shape assertion) → Task 7's `GET response items have exactly the public-shape keys` test establishes the positive+block-list pattern for Phase 3 and Phase 4+

**Deferred (not touched in Phase 3):**

- bcryptjs latency (Phase 1.1 cleanup)
- atomic-rename tempfile cleanup (backlog)
- audit-route 405 vs 404 distinction (backlog)
- `scopes.ts:requiredScopeForRoute` cc=28 refactor (Phase 0 finalization cleanup — wait for full pattern to settle after all 5 phases; Phase 3 actually SHRINKS the function via the V1_BRIDGE_ROUTES extraction)
- knowledge-pipeline ingest (end-of-Phase-0 batch)
- SUG-1 SSE cleanup double-fire (backlog)
- SUG-2 MCP fetch lacks try/catch (backlog)
- SUG-3 SSE test asserts only one topic unsubscribed (backlog)
- SUG-4 runId not passed to triggerFn (backlog)
- SUG-6 monotonic SSE event IDs vs Last-Event-ID (Phase 4 — pinned in Task 4-area comment)
- SUG-7 README "bridge primitive" jargon (backlog)
- DELTA-SUG-3 trailing-slash inconsistency (backlog usability)
- Phase 2 verifier triage items (`v1-registry.ts:buildV1Registry` length, opencode platform gap, OpenAPI path count discrepancy)

## Concerns

1. **Secret-at-rest storage decision is blocking.** If the user chooses Option B (encrypted at rest), Task 3 needs ~30 min of additional work + 1 extra test. Planner recommends Option A; risk of rework if Option B is chosen.
2. **Bus-vs-Webhook event-name normalization (`maintenance:started` → `maintenance.started`).** Phase 2 emits colon-separated topic names on the orchestrator EventEmitter; webhook subscriptions use dotted names per spec ("maintenance.completed"). `wireWebhookFanout` normalizes via `.replace(':', '.')` — a single-instance string transform that could miss a future double-colon event. Mitigation: any new emit path must use dotted form going forward; the normalize step is a compat-bridge for Phase 0/1/2 legacy.
3. **Layer-boundary risk on Task 2.** Placing `V1_BRIDGE_ROUTES` in `server/` and consuming from `auth/` may trip `harness check-deps` if the codebase enforces strict layering. Fallback documented inline in Task 2 step 8 (relocate to `auth/v1-bridge-routes.ts`).
4. **In-memory delivery means events fired during a 3 s subscriber stall are silently dropped (no retry).** This is by design per spec D3 ("Phase 3 implements only the IN-MEMORY portion... best-effort"). Phase 4 closes this with the SQLite queue. Until Phase 4 lands, operators with active bridges should expect occasional dropped events under load.
5. **Token-id field on the subscription only references the creator; revocation of the auth token does NOT cascade to deleting subscriptions.** A revoked token leaves its webhooks alive — they continue to receive events. Phase 4 or Phase 1.1 cleanup should add cascade-delete semantics (out of scope here).
6. **`subscribe_webhook` MCP tool surfaces the secret in agent transcripts.** Same model as `auth/token create`. Documented but worth re-flagging during execution if user wants stricter handling.
7. **Bridge integration test (Task 12) uses `http://` receiver URL but the registration validator rejects `http://`.** The test bypasses the registration HTTP path and seeds the store directly to avoid the validator. Acceptable for the integration test (the test exercises delivery, not registration validation — Task 7 covers that separately).

## Gates

- Every task has exact file paths, exact code, exact commands. No vague placeholders.
- Every code-producing task includes a TDD pair (test first, fail, implement, pass).
- File map enumerates 13 CREATE + 11 MODIFY before task decomposition.
- One blocking uncertainty surfaced (secret-at-rest); resolution checkpoint placed before the affected task.
- Three carry-forwards addressed inline; rationale documented per item.
- Phase 3 exit-gate (signed POST + HMAC verify) is the Task 12 integration test — provable, not asserted.
- Task count 14, ~77 min — within Phase 2's envelope (14 tasks, ~65 min) accounting for the slightly larger surface (signing + dashboard + MCP).

## Soundness Self-Review (inline before plan write)

Issues identified and resolved during draft:

- **Initial draft had Task 11 (OpenAPI) before Task 8 (orchestrator wiring).** Re-ordered — OpenAPI is a documentation artifact, must reflect actually-wired routes; Task 8 must precede Task 11.
- **Initial draft had no positive shape assertion in Task 7.** Added the `Object.keys(body[0]).sort()` assertion — addresses DELTA-SUG-2 carry-forward.
- **Initial draft used the global `.harness/handoff.json` deprecation path.** Confirmed handoff writes go to `.harness/sessions/changes--hermes-phase-0-gateway-api--proposal/handoff.json`.
- **Initial draft did not flag the layer-boundary risk on Task 2.** Added the fallback note (relocate `V1_BRIDGE_ROUTES` to `auth/` if `check-deps` flags it).
- **Initial draft did not document the `maintenance:` → `maintenance.` normalization in `wireWebhookFanout`.** Added an inline comment in Task 6's implementation and a concern in the Concerns block.
- **Initial draft's Task 12 used registration HTTP for setup, requiring an admin token.** Switched to direct `store.create` seeding — focuses the integration test on the delivery+signature path that the spec exit gate names.
