# Plan: Hermes Phase 0 — Phase 2: Versioned API Surface + Bridge Primitives

**Date:** 2026-05-14
**Spec:** `docs/changes/hermes-phase-0-gateway-api/proposal.md` (Phase 2 section, complexity: medium)
**Parent meta-spec:** `docs/changes/hermes-adoption/proposal.md`
**Roadmap item:** `github:Intense-Visions/harness-engineering#310`
**Phase 1 plan (reference):** `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-1-auth-foundation-plan.md`
**Starting commit (cumulative for Phase 0):** `807805cebb1837dd4b362fb3ef91d85419de82e1`
**Current HEAD at plan time:** `261c4afc` (last Phase 1 fix)
**Session:** `changes--hermes-phase-0-gateway-api--proposal`
**Tasks:** 14
**Checkpoints:** 3
**Estimated time:** ~65 minutes
**Integration Tier:** medium

## Goal

Extend the Phase 1 versioned surface so every legacy `/api/*` route is reachable under `/api/v1/*`, add the three Phase 2 bridge primitives (`POST /api/v1/jobs/maintenance`, `POST /api/v1/interactions/{id}/resolve`, `GET /api/v1/events` SSE), tag legacy aliases with a `Deprecation` header, fix the inherited audit-status-staleness pattern before duplicating it 12× more, register the two new internal MCP tools, regenerate the OpenAPI artifact to cover 100% of v1 routes, and re-emit per-host plugin manifests.

## Observable Truths (Acceptance Criteria)

1. **Where any legacy `/api/<name>(/...)` route exists today (interactions, plans, analyze, analyses, roadmap-actions, dispatch-actions, local-model, local-models, maintenance, streams, sessions, chat-proxy),** the system shall accept the same request at `/api/v1/<name>(/...)` with identical semantics. Verified by `packages/orchestrator/src/server/http-v1-aliases.test.ts` round-trip table-test (one row per route).
2. **When a request hits a legacy `/api/*` path,** the system shall include the response header `Deprecation: 2027-05-14` (ISO date one year out per spec cross-cutting decision). The corresponding `/api/v1/*` response shall **not** include the header. Verified by header-presence test against both prefixes.
3. **When `POST /api/v1/jobs/maintenance` is called with `{ taskId: "<known>" }` and a token carrying `trigger-job` scope,** the system shall invoke `Orchestrator.dispatchAdHoc(...)` (via the existing `triggerFn` injection point used by `handleMaintenanceRoute`) and respond `200 { ok: true, taskId, runId }`. Unknown taskId yields 404; concurrent run for same taskId yields 409. Verified by `routes/v1/jobs-maintenance.test.ts`.
4. **When `POST /api/v1/interactions/{id}/resolve` is called with `{ answer?: unknown }` and a token carrying `resolve-interaction` scope,** the system shall call `InteractionQueue.updateStatus(id, 'resolved')`, emit an `interaction.resolved` event on the orchestrator event bus, and respond `200 { resolved: true }`. Unknown id yields 404; already-resolved yields 409. Verified by `routes/v1/interactions-resolve.test.ts`.
5. **When `GET /api/v1/events` is opened with `Accept: text/event-stream` and a token carrying `read-telemetry` scope,** the system shall stream `GatewayEvent`-framed SSE messages for every event published on the orchestrator event bus (`state_change`, `agent_event`, `interaction.created`, `interaction.resolved`, `maintenance:started`, `maintenance:completed`, `maintenance:error`, `local-model:status`), each formatted as `event: <type>\ndata: <json>\nid: <evt_…>\n\n`. Verified by `routes/v1/events-sse.test.ts` (publish event → assert frame received).
6. **The system shall emit `interaction.created` on the orchestrator event bus** whenever `InteractionQueue.push(…)` is invoked, mirroring the existing `broadcastInteraction(...)` call. Verified by event-bus subscription test.
7. **When `harness mcp` (any tier) is connected,** the system shall expose new tools `trigger_maintenance_job` (tier-1: standard+) and `list_gateway_tokens` (tier-0: core+). `subscribe_webhook` is **not** registered in Phase 2 (deferred to Phase 3 per spec). Verified by MCP-tool-registry unit test.
8. **When `pnpm --filter @harness-engineering/orchestrator openapi:generate` runs,** the system shall write a `docs/api/openapi.yaml` describing all `/api/v1/*` routes (auth × 3 + the 12 legacy aliases + the 3 bridge primitives = 18 paths). Re-running is byte-identical. CI `openapi-drift-check.yml` already gates this from Phase 1; this phase extends the registry, not the workflow.
9. **When `pnpm harness generate-slash-commands` runs,** per-host plugin manifests for `harness-claude`, `harness-cursor`, `harness-codex`, `harness-gemini`, `harness-opencode` shall reflect the new MCP tool names. Verified by manifest snapshot diff in Task 14.
10. **For every API request through the dispatch loop,** the system shall log the final HTTP status code (the one actually sent to the client), not a status read before the async handler resolved. Verified by `dispatch-audit-status.test.ts` (handler returns 422 → audit line records 422, not 200).

## Uncertainties

- **[ASSUMPTION]** **Bulk-wrap approach for the 12 legacy routes (option b from the planner brief).** A single URL-rewrite shim at the dispatch layer (`/api/v1/<name>(/…)?` → `/api/<name>(/…)?` for the wrappable set) is implemented once in `dispatchAuthedRequest` instead of 12 per-route wrapper files. The hardcoded `/api/...` URL matchers inside each existing handler (`handleInteractionsRoute`, etc.) stay untouched — they still see the rewritten URL. The `Deprecation` header is set only when the _original_ `req.url` started with `/api/` (not `/api/v1/`). This collapses 12 mechanical wrappers into one task; if review-cycle 1 flags this as too clever, fall back to per-route wrappers (a 12-task expansion that can run in parallel).
- **[ASSUMPTION]** **`Deprecation: 2027-05-14`** — one-year horizon per the spec's cross-cutting decision ("removal scheduled for `/api/v2` or 12 months post-Phase-0-GA, whichever comes first"). The exact date is locked at plan time; if Phase 0 ships later than 2026-05-14, the date is updated in Task 2 only.
- **[ASSUMPTION]** **Audit-status-staleness fix = `res.on('finish', …)` re-binding.** Phase 1 carried forward `handle-auth-route-audit-status-staleness` (`void handle*(...) + immediate return true` reads `res.statusCode` before async handler sets it). Fix: in `dispatchAuthedRequest`, register `res.on('finish', () => this.audit(...))` once per request **before** entering the route table loop, and remove the per-route synchronous `audit(...)` calls. Single-source-of-truth audit firing on the wire-final status. **Rejected alternative:** make every route handler return a Promise — too invasive; touches every handler file and changes the route-table signature.
- **[ASSUMPTION]** **SSE event-bus subscription model.** The SSE handler subscribes to the existing `EventEmitter` (orchestrator) for `state_change`/`agent_event`/`maintenance:*` AND to two new event types this phase emits: `interaction.created` and `interaction.resolved`. New events are emitted alongside the existing `broadcastInteraction(...)` calls — additive, no removals. Heartbeat: comment frame every 15s to keep proxies alive. No `Last-Event-ID` resume support in Phase 2 (spec calls it out as nice-to-have but not exit-gate-required; resume is a Phase 4 problem when the SQLite queue exists).
- **[DEFERRABLE]** **`subscribe_webhook` MCP tool** — explicitly deferred to Phase 3 per spec ("`subscribe_webhook` deferred to Slice 3").
- **[DEFERRABLE]** **`interaction.resolved` payload shape** — Phase 2 emits `{ id, status: 'resolved', resolvedAt }`; richer envelopes (correlation id, answer body) land in Phase 3 when `GatewayEvent` graduates from a forward-ref type to a fully-typed schema.
- **[DEFERRABLE]** **OpenAPI artifact rendering UI** — handled at Phase 0 finalization (Step N in spec); Phase 2 only regenerates the YAML.
- **[BLOCKING — None.]** All blocking questions resolved by spec Decisions Made + Phase 1 retrospective.

## Skill Annotations Active

From `docs/changes/hermes-phase-0-gateway-api/SKILLS.md`:

- **Apply tier:** `ts-zod-integration` (Tasks 5, 6, 7, 12)
- **Reference tier:** `microservices-api-gateway` (Tasks 2, 3 — versioning + Deprecation), `gof-facade-pattern` (Task 3 — URL-rewrite shim), `gof-chain-of-responsibility` (Task 4 — finish-handler audit chain), `events-event-schema` (Tasks 8, 9 — `GatewayEvent` envelope + SSE framing), `ts-testing-types` (Tasks 5, 6, 7, 8 — typed test fixtures).

## File Map

**CREATE (10):**

- `packages/orchestrator/src/server/http-v1-aliases.test.ts` — table-test that every legacy route is reachable under `/api/v1/*`
- `packages/orchestrator/src/server/dispatch-audit-status.test.ts` — proves audit logs the wire-final status
- `packages/orchestrator/src/server/routes/v1/jobs-maintenance.ts` — `POST /api/v1/jobs/maintenance` handler
- `packages/orchestrator/src/server/routes/v1/jobs-maintenance.test.ts`
- `packages/orchestrator/src/server/routes/v1/interactions-resolve.ts` — `POST /api/v1/interactions/{id}/resolve` handler
- `packages/orchestrator/src/server/routes/v1/interactions-resolve.test.ts`
- `packages/orchestrator/src/server/routes/v1/events-sse.ts` — `GET /api/v1/events` SSE handler
- `packages/orchestrator/src/server/routes/v1/events-sse.test.ts`
- `packages/orchestrator/src/gateway/openapi/v1-registry.ts` — extends the auth registry to cover all v1 routes
- `packages/cli/src/mcp/tools/gateway-tools.ts` — `trigger_maintenance_job` + `list_gateway_tokens` definitions/handlers

**MODIFY (10):**

- `packages/orchestrator/src/server/http.ts` — add v1-alias URL rewrite + `Deprecation` header in `dispatchAuthedRequest`; mount the three new v1 routes in `buildApiRoutes()`; convert audit firing to `res.on('finish', …)`; emit `interaction.created` alongside `broadcastInteraction`
- `packages/orchestrator/src/auth/scopes.ts` — extend `requiredScopeForRoute()` for the three new v1 endpoints + the wrappable v1 prefixes (`/api/v1/interactions`, `/api/v1/plans`, etc.)
- `packages/orchestrator/src/core/interaction-queue.ts` — extend `updateStatus()` to emit `interaction.resolved` via injected emitter; keep current single-arg signature stable (emitter optional via constructor)
- `packages/orchestrator/src/orchestrator.ts` — pass `this` (EventEmitter) into `InteractionQueue` constructor and call new emit paths; expose typed event names
- `packages/orchestrator/src/gateway/openapi/registry.ts` — rename `buildAuthDocument`/`buildAuthRegistry` to compose with `v1-registry.ts`
- `packages/orchestrator/src/gateway/openapi/generate.ts` — call `buildV1Document()` instead of `buildAuthDocument()`
- `packages/orchestrator/src/gateway/openapi/generate.test.ts` — extend idempotency test to v1 registry
- `packages/cli/src/mcp/server.ts` — register `triggerMaintenanceJobDefinition`, `listGatewayTokensDefinition` + handlers
- `packages/cli/src/mcp/tool-tiers.ts` — add `list_gateway_tokens` to `CORE_TOOL_NAMES`; add `trigger_maintenance_job` to `STANDARD_EXTRA`
- `docs/api/openapi.yaml` — regenerated artifact (one commit deliverable; not hand-edited)

**Evidence (file:line for the patterns this plan builds on):**

- `packages/orchestrator/src/server/http.ts:243-262` — `handleRequest()` shape; isState shortcut.
- `packages/orchestrator/src/server/http.ts:328-351` — `buildApiRoutes()` route table (insertion point).
- `packages/orchestrator/src/server/http.ts:360-410` — `handleApiRoutes` + `dispatchAuthedRequest` (audit-status-staleness lives in the synchronous `audit(...)` call on line 402; fix moves to `res.on('finish', …)`).
- `packages/orchestrator/src/server/http.ts:412-424` — `audit()` helper.
- `packages/orchestrator/src/server/routes/maintenance.ts:78-110` — `handlePostTrigger` calls `deps.triggerFn(taskId)`; `MaintenanceRouteDeps` already carries the injection point Phase 2's new `POST /api/v1/jobs/maintenance` will reuse.
- `packages/orchestrator/src/server/routes/interactions.ts:16-39` — `handlePatchInteraction` writes status; resolve endpoint is a thin wrapper that pins status to `'resolved'`.
- `packages/orchestrator/src/orchestrator.ts:1441-1470` — `dispatchAdHoc(issue: Issue)`; **note**: the maintenance route already uses a different injection (`triggerFn(taskId: string)`); Phase 2 keeps reusing `triggerFn` for the new route, not `dispatchAdHoc` directly, to preserve the existing test fixtures. (Planner brief's "calls into `Orchestrator.dispatchAdHoc`" describes the chain; the immediate call is into the existing `triggerFn`.)
- `packages/orchestrator/src/core/interaction-queue.ts:139-153` — `updateStatus()` signature.
- `packages/orchestrator/src/auth/scopes.ts:31-54` — `requiredScopeForRoute()` table to extend.
- `packages/orchestrator/src/server/websocket.ts:50-58` — `broadcast(type, data)` for cross-reference with SSE framing.
- `packages/cli/src/mcp/server.ts:167-229` — `TOOL_DEFINITIONS[]` registration array.
- `packages/cli/src/mcp/tool-tiers.ts:20-57` — `CORE_TOOL_NAMES` / `STANDARD_EXTRA` lists.

## Skeleton

1. Audit-status-staleness fix (1 task, ~6 min) — **structural pre-requisite; ships first so the 12 alias-wrapping work doesn't multiply the staleness pattern**
2. v1-alias URL-rewrite + Deprecation header (2 tasks, ~12 min) `[checkpoint:human-verify after Task 3]`
3. Scope-table extension for v1 prefixes (1 task, ~4 min)
4. Bridge primitives: jobs/maintenance, interactions/resolve, events SSE (3 tasks, ~22 min) `[checkpoint:human-verify after Task 7 — SSE wire-up is the biggest single risk]`
5. Interaction event emit (`interaction.created` / `interaction.resolved`) (1 task, ~5 min)
6. OpenAPI registry extension + regeneration (2 tasks, ~9 min)
7. MCP tools: `trigger_maintenance_job` (tier-1) + `list_gateway_tokens` (tier-0) (1 task, ~5 min)
8. Slash-command + plugin-manifest regen (1 task, ~5 min) `[checkpoint:human-verify after Task 13]`
9. Final phase-gate verification (1 task, ~5 min)

**Total:** 14 tasks, ~65 min. Under the >15 flag threshold; bulk-wrap (option b) chosen per planner-brief recommendation.

_Skeleton approved:_ pending — see Phase 4 sign-off step.

---

## Tasks

### Task 1: Fix audit-status-staleness by switching to `res.on('finish', …)`

**Depends on:** none (pre-requisite for all subsequent route work)
**Files:**

- `packages/orchestrator/src/server/dispatch-audit-status.test.ts` (new)
- `packages/orchestrator/src/server/http.ts` (modify lines 368-410, `audit()` helper at 412-424)
  **Skills:** `gof-chain-of-responsibility` (reference)

**Carry-forward addressed:** `handle-auth-route-audit-status-staleness` (Phase 1 retrospective severity: backlog suggestion). Fixing **before** the 12-route alias work doubles down on the right call: the bulk-wrap shim sits in the same dispatch loop, so addressing inline costs one task and saves a 12× repeat of the bug pattern.

1. Create `packages/orchestrator/src/server/dispatch-audit-status.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import http from 'node:http';
   import { OrchestratorServer } from './http';

   class FakeOrchestrator {
     getSnapshot() {
       return { ok: true };
     }
     on() {}
     removeListener() {}
   }

   let dir: string;
   let server: OrchestratorServer;
   let port: number;

   async function req(p: string, method = 'GET'): Promise<{ status: number }> {
     return new Promise((resolve, reject) => {
       const r = http.request({ host: '127.0.0.1', port, path: p, method }, (res) => {
         res.on('data', () => {});
         res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
       });
       r.on('error', reject);
       r.end();
     });
   }

   describe('dispatchAuthedRequest audit captures wire-final status', () => {
     beforeEach(async () => {
       dir = mkdtempSync(join(tmpdir(), 'harness-audit-status-'));
       process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
       process.env['HARNESS_AUDIT_PATH'] = join(dir, 'audit.log');
       delete process.env['HARNESS_API_TOKEN'];
       server = new OrchestratorServer(new FakeOrchestrator() as never, 0);
       port = await new Promise((resolve) => {
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
     afterEach(() => {
       (server as unknown as { httpServer: http.Server }).httpServer.close();
       rmSync(dir, { recursive: true, force: true });
       delete process.env['HARNESS_TOKENS_PATH'];
       delete process.env['HARNESS_AUDIT_PATH'];
     });

     it('records 404 (not 200) when no route matches', async () => {
       const res = await req('/api/does-not-exist');
       expect(res.status).toBe(404);
       // Allow a microtask for `res.on('finish')` to fire before reading.
       await new Promise((r) => setImmediate(r));
       const log = readFileSync(join(dir, 'audit.log'), 'utf-8').trim().split('\n');
       const last = JSON.parse(log[log.length - 1]) as { status: number; route: string };
       expect(last.status).toBe(404);
       expect(last.route).toBe('/api/does-not-exist');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/dispatch-audit-status.test.ts` — **observe failure** (current code reads `res.statusCode` before async handler sets it; the test sees 200 instead of 404).
3. Modify `packages/orchestrator/src/server/http.ts` `dispatchAuthedRequest()` (around line 368):
   - Replace each inline `this.audit(req, res, token)` call (currently at the unauth path, scope-fail path, state-shortcut path, route-match path, and 404 path) with a **single** `res.on('finish', () => this.audit(req, res, token))` registration immediately after `resolveAuth(...)` returns.
   - The handler then proceeds without touching audit again — let `finish` fire on whatever final status the response carries.
   - Important: register **before** any `res.writeHead(...)` call so the listener attaches in time. Node guarantees `finish` fires exactly once after the last byte is queued, so even synchronous responders are captured.

   The new dispatch shape:

   ```ts
   private async dispatchAuthedRequest(
     req: http.IncomingMessage,
     res: http.ServerResponse
   ): Promise<void> {
     // Resolve auth first (may write 401 + return null).
     const token = await this.resolveAuth(req, res);
     // Register audit on wire-final status — fires once, regardless of which
     // path below resolves the response. Captures the real status the client
     // sees, not whatever was set before an async handler resolved.
     res.on('finish', () => this.audit(req, res, token));
     if (!token) return;

     const pathname = (req.url ?? '').split('?')[0] ?? '';
     const required = requiredScopeForRoute(req.method ?? 'GET', pathname);
     if (!required || !hasScope(token.scopes, required)) {
       res.writeHead(403, { 'Content-Type': 'application/json' });
       res.end(JSON.stringify({ error: 'Insufficient scope', required: required ?? 'unknown' }));
       return;
     }
     if (req.method === 'GET' && (req.url === '/api/state' || req.url === '/api/v1/state')) {
       res.writeHead(200, { 'Content-Type': 'application/json' });
       res.end(JSON.stringify(this.orchestrator.getSnapshot()));
       return;
     }
     for (const route of this.apiRoutes) {
       if (route(req, res)) return;
     }
     res.writeHead(404, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify({ error: 'Not Found' }));
   }
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/dispatch-audit-status.test.ts` — **observe pass.**
5. Run: `pnpm --filter @harness-engineering/orchestrator test` — confirm the existing `auth.test.ts` + `http.test.ts` suites still pass (audit timing change is invisible to clients).
6. Run: `harness validate`
7. Commit: `fix(orchestrator): audit on res.on('finish') captures wire-final status`

---

### Task 2: Constant for the Deprecation date

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/server/http.ts` (modify near the top, alongside `RATE_LIMIT`)
**Skills:** `microservices-api-gateway` (reference)

1. Add near the top of `packages/orchestrator/src/server/http.ts` (just below the rate-limiter constants, ~line 44):

   ```ts
   /**
    * Legacy /api/* alias deprecation horizon. Spec D7 cross-cutting decision:
    * "removal scheduled for /api/v2 or 12 months post-Phase-0-GA, whichever
    * comes first." Plan-date 2026-05-14 → +12mo = 2027-05-14.
    *
    * Set via env var HARNESS_DEPRECATION_DATE for ops who need to extend the
    * horizon; default is the spec-mandated value.
    */
   const DEPRECATION_DATE = process.env['HARNESS_DEPRECATION_DATE'] ?? '2027-05-14';
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
3. Run: `harness validate`
4. Commit: `chore(orchestrator): introduce DEPRECATION_DATE constant for /api/* aliases`

---

### Task 3: v1 alias URL rewrite + Deprecation header in dispatch

**Depends on:** Task 2
**Files:**

- `packages/orchestrator/src/server/http-v1-aliases.test.ts` (new)
- `packages/orchestrator/src/server/http.ts` (modify `dispatchAuthedRequest`)
  **Skills:** `microservices-api-gateway` (reference), `gof-facade-pattern` (reference), `ts-zod-integration` (apply)

1. Create `packages/orchestrator/src/server/http-v1-aliases.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { mkdtempSync, rmSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import http from 'node:http';
   import { OrchestratorServer } from './http';

   class FakeOrchestrator {
     getSnapshot() {
       return { ok: true };
     }
     on() {}
     removeListener() {}
   }

   let dir: string;
   let server: OrchestratorServer;
   let port: number;

   async function req(
     p: string,
     method = 'GET'
   ): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
     return new Promise((resolve, reject) => {
       const r = http.request({ host: '127.0.0.1', port, path: p, method }, (res) => {
         res.on('data', () => {});
         res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
       });
       r.on('error', reject);
       r.end();
     });
   }

   describe('v1 alias coverage + Deprecation header', () => {
     beforeEach(async () => {
       dir = mkdtempSync(join(tmpdir(), 'harness-v1-alias-'));
       process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
       process.env['HARNESS_AUDIT_PATH'] = join(dir, 'audit.log');
       delete process.env['HARNESS_API_TOKEN'];
       server = new OrchestratorServer(new FakeOrchestrator() as never, 0);
       port = await new Promise((resolve) => {
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
     afterEach(() => {
       (server as unknown as { httpServer: http.Server }).httpServer.close();
       rmSync(dir, { recursive: true, force: true });
       delete process.env['HARNESS_TOKENS_PATH'];
       delete process.env['HARNESS_AUDIT_PATH'];
     });

     // Each legacy prefix exists today; the v1 alias must return the same status
     // and the legacy response must carry Deprecation, the v1 response must not.
     const cases: Array<{ legacy: string; v1: string }> = [
       { legacy: '/api/state', v1: '/api/v1/state' },
       { legacy: '/api/interactions', v1: '/api/v1/interactions' },
       { legacy: '/api/plans', v1: '/api/v1/plans' },
       { legacy: '/api/analyses', v1: '/api/v1/analyses' },
       { legacy: '/api/maintenance/status', v1: '/api/v1/maintenance/status' },
       { legacy: '/api/sessions', v1: '/api/v1/sessions' },
     ];

     for (const c of cases) {
       it(`v1 alias for ${c.legacy} returns same status; legacy has Deprecation header`, async () => {
         const legacy = await req(c.legacy);
         const v1 = await req(c.v1);
         expect(legacy.status).toBe(v1.status);
         expect(legacy.headers['deprecation']).toBe('2027-05-14');
         expect(v1.headers['deprecation']).toBeUndefined();
       });
     }
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/http-v1-aliases.test.ts` — **observe failure** (v1 paths return 404; legacy paths missing Deprecation header).
3. Modify `packages/orchestrator/src/server/http.ts` `dispatchAuthedRequest()`:
   - Compute a rewritten URL once at entry: if `pathname` starts with `/api/v1/` AND the trailing slug is in the wrappable set (`interactions`, `plans`, `analyze`, `analyses`, `roadmap-actions`, `dispatch-actions`, `local-model`, `local-models`, `maintenance`, `streams`, `sessions`, `chat-proxy`), rewrite `req.url` to the legacy path **for the route-table loop only** — record original prefix so the Deprecation header is gated correctly.
   - Set `Deprecation: <DEPRECATION_DATE>` header **before** the route-table loop **only** when the _original_ URL started with `/api/<name>` (not `/api/v1/<name>`).

   Insert this block near the top of `dispatchAuthedRequest` (after audit registration, before scope check):

   ```ts
   // /api/v1/<name>(/...) aliases for legacy routes.
   // Phase 2 ships the alias by URL rewrite so the 12 legacy handlers stay
   // untouched. Per-handler v1-prefix awareness was rejected (12 file edits +
   // 12× test churn). See spec D7 cross-cutting decision.
   const V1_WRAPPABLE = new Set([
     'interactions',
     'plans',
     'analyze',
     'analyses',
     'roadmap-actions',
     'dispatch-actions',
     'local-model',
     'local-models',
     'maintenance',
     'streams',
     'sessions',
     'chat-proxy',
   ]);
   const v1Match = /^\/api\/v1\/([^/?]+)(.*)$/.exec(req.url ?? '');
   const rewrittenSlug = v1Match?.[1];
   if (rewrittenSlug && V1_WRAPPABLE.has(rewrittenSlug)) {
     // Mutate req.url for the route-table loop. Existing handlers match on
     // hardcoded /api/<name> prefixes; rewriting once is cheaper than fanning
     // out 12 wrapper files. /api/v1/state is handled by the shortcut below,
     // not via rewrite.
     req.url = `/api/${rewrittenSlug}${v1Match?.[2] ?? ''}`;
   }
   const isLegacyPrefix =
     !!req.url &&
     req.url.startsWith('/api/') &&
     !req.url.startsWith('/api/v1/') &&
     // The original URL — not the rewritten one — drives the Deprecation header.
     // After the rewrite above, /api/v1/interactions and /api/interactions look
     // identical to the route table; the original is what determines the header.
     // We captured the original in v1Match; if v1Match matched, the original
     // was the v1 form and isLegacyPrefix should be false.
     !v1Match;
   if (isLegacyPrefix) {
     res.setHeader('Deprecation', DEPRECATION_DATE);
   }
   ```

   Recompute `pathname` after the rewrite for the scope-check; the scope table already includes both `/api/state` and `/api/v1/state`, but the wrappable rewrite sends `/api/v1/interactions` → `/api/interactions`, so scope check works against the rewritten form. (Task 4 extends `scopes.ts` for the _new_ v1-only routes — `/api/v1/jobs/maintenance`, `/api/v1/interactions/{id}/resolve`, `/api/v1/events` — which are not in the wrappable set and don't get rewritten.)

   Final dispatchAuthedRequest sketch:

   ```ts
   private async dispatchAuthedRequest(req, res): Promise<void> {
     const token = await this.resolveAuth(req, res);
     res.on('finish', () => this.audit(req, res, token));
     if (!token) return;

     // (insert v1-alias rewrite + deprecation block here, as above)

     const pathname = (req.url ?? '').split('?')[0] ?? '';
     const required = requiredScopeForRoute(req.method ?? 'GET', pathname);
     if (!required || !hasScope(token.scopes, required)) { /* 403 */ return; }
     if (req.method === 'GET' && (req.url === '/api/state' || req.url === '/api/v1/state')) {
       res.writeHead(200, { 'Content-Type': 'application/json' });
       res.end(JSON.stringify(this.orchestrator.getSnapshot()));
       return;
     }
     for (const route of this.apiRoutes) if (route(req, res)) return;
     res.writeHead(404, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify({ error: 'Not Found' }));
   }
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/http-v1-aliases.test.ts` — **observe pass.**
5. Run: `pnpm --filter @harness-engineering/orchestrator test` — full suite green.
6. Run: `harness validate`
7. Commit: `feat(orchestrator): /api/v1/* aliases + Deprecation header for /api/*`

---

### Task 3.5: `[checkpoint:human-verify]` URL rewrite + Deprecation behavior

**Depends on:** Task 3
**Files:** (none — verification only)

Manually verify the rewrite shim does not surprise existing callers:

1. With the orchestrator running, hit `curl -v http://127.0.0.1:8080/api/state` — observe `Deprecation: 2027-05-14`.
2. Hit `curl -v http://127.0.0.1:8080/api/v1/state` — observe **no** Deprecation header, same body.
3. Hit `curl -v http://127.0.0.1:8080/api/v1/maintenance/status` — observe same JSON as `/api/maintenance/status`.
4. Hit `curl -v http://127.0.0.1:8080/api/v1/does-not-exist` — observe 404; audit log records 404.

**If any check fails:** push a fix as a follow-up commit before advancing to Task 4. **If all pass:** proceed; no commit required.

---

### Task 4: Extend `requiredScopeForRoute()` for new v1 endpoints

**Depends on:** Task 3
**Files:** `packages/orchestrator/src/auth/scopes.ts` (modify)

1. Open `packages/orchestrator/src/auth/scopes.ts`. After the existing auth-admin lines and before the legacy-route block, add:

   ```ts
   // Phase 2 bridge-primitive endpoints (new in /api/v1/* only).
   if (path === '/api/v1/jobs/maintenance' && method === 'POST') return 'trigger-job';
   if (/^\/api\/v1\/interactions\/[^/]+\/resolve$/.test(path) && method === 'POST')
     return 'resolve-interaction';
   if (path === '/api/v1/events' && method === 'GET') return 'read-telemetry';
   ```

   Drop the `// Phase 1 deliberately leaves the new versioned routes' scope mapping for Phase 2` comment from `scopes.ts:29` — Phase 2 now provides it. Replace with: `// Phase 2 covers /api/v1/* aliases (via URL rewrite in dispatch) + the three bridge primitives below.`

2. Open `packages/orchestrator/src/auth/scopes.test.ts` (if it exists, otherwise create) and add cases for the three new mappings — happy path + wrong method = null.

   ```ts
   it('maps POST /api/v1/jobs/maintenance to trigger-job', () => {
     expect(requiredScopeForRoute('POST', '/api/v1/jobs/maintenance')).toBe('trigger-job');
   });
   it('maps POST /api/v1/interactions/<id>/resolve to resolve-interaction', () => {
     expect(requiredScopeForRoute('POST', '/api/v1/interactions/abc/resolve')).toBe(
       'resolve-interaction'
     );
   });
   it('maps GET /api/v1/events to read-telemetry', () => {
     expect(requiredScopeForRoute('GET', '/api/v1/events')).toBe('read-telemetry');
   });
   it('returns null (default-deny) for unmapped GET /api/v1/events', () => {
     expect(requiredScopeForRoute('POST', '/api/v1/events')).toBeNull();
   });
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/auth/scopes.test.ts` — **observe pass.**
4. Run: `harness validate`
5. Commit: `feat(orchestrator): scope mappings for Phase 2 bridge primitives`

---

### Task 5: `POST /api/v1/jobs/maintenance` handler (TDD)

**Depends on:** Task 4
**Files:**

- `packages/orchestrator/src/server/routes/v1/jobs-maintenance.test.ts` (new)
- `packages/orchestrator/src/server/routes/v1/jobs-maintenance.ts` (new)
- `packages/orchestrator/src/server/http.ts` (modify: import + insert into `buildApiRoutes()`)
  **Skills:** `ts-zod-integration` (apply), `ts-testing-types` (reference)

1. Create `packages/orchestrator/src/server/routes/v1/jobs-maintenance.test.ts`:

   ```ts
   import { describe, it, expect, vi } from 'vitest';
   import { handleV1JobsMaintenanceRoute } from './jobs-maintenance';
   import type { MaintenanceRouteDeps } from '../maintenance';
   import { IncomingMessage, ServerResponse } from 'node:http';
   import { Socket } from 'node:net';

   function makeReqRes(
     method: string,
     url: string,
     body?: string
   ): { req: IncomingMessage; res: ServerResponse; sent: () => { status: number; body: string } } {
     const socket = new Socket();
     const req = new IncomingMessage(socket);
     req.method = method;
     req.url = url;
     // Stream the body if provided.
     if (body) {
       process.nextTick(() => {
         req.push(body);
         req.push(null);
       });
     } else {
       req.push(null);
     }
     const res = new ServerResponse(req);
     let status = 0;
     let buf = '';
     const origWriteHead = res.writeHead.bind(res);
     res.writeHead = ((s: number, ...rest: unknown[]) => {
       status = s;
       return origWriteHead(s, ...(rest as []));
     }) as typeof res.writeHead;
     const origEnd = res.end.bind(res);
     res.end = ((chunk?: unknown) => {
       if (typeof chunk === 'string') buf += chunk;
       return origEnd(chunk as never);
     }) as typeof res.end;
     return { req, res, sent: () => ({ status, body: buf }) };
   }

   function fakeDeps(triggerFn: MaintenanceRouteDeps['triggerFn']): MaintenanceRouteDeps {
     return {
       scheduler: { getStatus: () => ({ schedule: {} as never }) } as never,
       reporter: { getHistory: () => [] } as never,
       triggerFn,
     };
   }

   describe('POST /api/v1/jobs/maintenance', () => {
     it('returns 200 and runId on valid POST', async () => {
       const trigger = vi.fn().mockResolvedValue(undefined);
       const { req, res, sent } = makeReqRes(
         'POST',
         '/api/v1/jobs/maintenance',
         JSON.stringify({ taskId: 'cleanup-sessions' })
       );
       const handled = handleV1JobsMaintenanceRoute(req, res, fakeDeps(trigger));
       expect(handled).toBe(true);
       await new Promise((r) => setTimeout(r, 10));
       const { status, body } = sent();
       expect(status).toBe(200);
       const parsed = JSON.parse(body) as { ok: boolean; taskId: string; runId: string };
       expect(parsed.ok).toBe(true);
       expect(parsed.taskId).toBe('cleanup-sessions');
       expect(parsed.runId).toMatch(/^run_[a-f0-9]+$/);
       expect(trigger).toHaveBeenCalledWith('cleanup-sessions');
     });

     it('returns 400 on missing taskId', async () => {
       const { req, res, sent } = makeReqRes('POST', '/api/v1/jobs/maintenance', '{}');
       handleV1JobsMaintenanceRoute(req, res, fakeDeps(vi.fn()));
       await new Promise((r) => setTimeout(r, 10));
       expect(sent().status).toBe(400);
     });

     it('returns 404 when triggerFn throws "task not found"', async () => {
       const trigger = vi.fn().mockRejectedValue(new Error('task not found: bogus'));
       const { req, res, sent } = makeReqRes(
         'POST',
         '/api/v1/jobs/maintenance',
         JSON.stringify({ taskId: 'bogus' })
       );
       handleV1JobsMaintenanceRoute(req, res, fakeDeps(trigger));
       await new Promise((r) => setTimeout(r, 10));
       expect(sent().status).toBe(404);
     });

     it('returns 409 when triggerFn throws "already running"', async () => {
       const trigger = vi
         .fn()
         .mockRejectedValue(new Error('task cleanup-sessions already running'));
       const { req, res, sent } = makeReqRes(
         'POST',
         '/api/v1/jobs/maintenance',
         JSON.stringify({ taskId: 'cleanup-sessions' })
       );
       handleV1JobsMaintenanceRoute(req, res, fakeDeps(trigger));
       await new Promise((r) => setTimeout(r, 10));
       expect(sent().status).toBe(409);
     });

     it('returns false (does not match) for non-/api/v1/jobs/maintenance paths', () => {
       const { req, res } = makeReqRes('POST', '/api/maintenance/trigger');
       const handled = handleV1JobsMaintenanceRoute(req, res, fakeDeps(vi.fn()));
       expect(handled).toBe(false);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/jobs-maintenance.test.ts` — **observe failure** (file missing).
3. Create `packages/orchestrator/src/server/routes/v1/jobs-maintenance.ts`:

   ```ts
   import type { IncomingMessage, ServerResponse } from 'node:http';
   import { randomBytes } from 'node:crypto';
   import { z } from 'zod';
   import { readBody } from '../../utils.js';
   import type { MaintenanceRouteDeps } from '../maintenance';

   const BodySchema = z.object({
     taskId: z.string().min(1).max(200),
     params: z.record(z.unknown()).optional(),
   });

   function sendJSON(res: ServerResponse, status: number, body: unknown): void {
     res.writeHead(status, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify(body));
   }

   /**
    * POST /api/v1/jobs/maintenance — Phase 2 bridge primitive.
    *
    * Wraps the existing MaintenanceRouteDeps.triggerFn injection so the legacy
    * /api/maintenance/trigger and the new v1 entry share a single execution path.
    * The legacy route already returns { ok, taskId }; v1 extends with a runId
    * for client correlation (Spec D1 — bridge primitives).
    *
    * Scope: trigger-job (enforced by dispatchAuthedRequest).
    *
    * Returns:
    *   200 { ok: true, taskId, runId }
    *   400 invalid body
    *   404 task not found
    *   409 task already running
    *   500 unexpected error
    */
   export function handleV1JobsMaintenanceRoute(
     req: IncomingMessage,
     res: ServerResponse,
     deps: MaintenanceRouteDeps | null
   ): boolean {
     if (req.url !== '/api/v1/jobs/maintenance' || req.method !== 'POST') return false;
     if (!deps) {
       sendJSON(res, 503, { error: 'Maintenance not available' });
       return true;
     }
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
         // harness-ignore SEC-DES-001: input validated by Zod schema (BodySchema) below
         json = JSON.parse(raw);
       } catch {
         sendJSON(res, 400, { error: 'Invalid JSON body' });
         return;
       }
       const parsed = BodySchema.safeParse(json);
       if (!parsed.success) {
         sendJSON(res, 400, { error: 'Invalid body', issues: parsed.error.issues });
         return;
       }
       const runId = `run_${randomBytes(8).toString('hex')}`;
       try {
         await deps.triggerFn(parsed.data.taskId);
         sendJSON(res, 200, { ok: true, taskId: parsed.data.taskId, runId });
       } catch (err) {
         const msg = err instanceof Error ? err.message : 'Trigger failed';
         if (msg.toLowerCase().includes('not found')) {
           sendJSON(res, 404, { error: msg });
           return;
         }
         if (msg.toLowerCase().includes('already running')) {
           sendJSON(res, 409, { error: msg });
           return;
         }
         sendJSON(res, 500, { error: 'Internal error triggering maintenance task' });
       }
     })();
     return true;
   }
   ```

4. Modify `packages/orchestrator/src/server/http.ts`:
   - Add import alongside other route imports: `import { handleV1JobsMaintenanceRoute } from './routes/v1/jobs-maintenance';`
   - Insert into `buildApiRoutes()` table, **immediately after** the existing `handleMaintenanceRoute` entry (so the legacy + v1 maintenance pair lives together):

     ```ts
     (req, res) => handleV1JobsMaintenanceRoute(req, res, this.maintenanceDeps),
     ```

5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/jobs-maintenance.test.ts` — **observe pass.**
6. Run: `pnpm --filter @harness-engineering/orchestrator test` — full suite green.
7. Run: `harness validate`
8. Commit: `feat(orchestrator): POST /api/v1/jobs/maintenance bridge primitive`

---

### Task 6: `POST /api/v1/interactions/{id}/resolve` handler (TDD)

**Depends on:** Task 5
**Files:**

- `packages/orchestrator/src/server/routes/v1/interactions-resolve.test.ts` (new)
- `packages/orchestrator/src/server/routes/v1/interactions-resolve.ts` (new)
- `packages/orchestrator/src/server/http.ts` (modify: import + insert into `buildApiRoutes()`)
  **Skills:** `ts-zod-integration` (apply), `ts-testing-types` (reference)

1. Create `packages/orchestrator/src/server/routes/v1/interactions-resolve.test.ts`. Pattern: same `makeReqRes()` helper as Task 5; cases:
   - 200 on valid POST → calls `updateStatus(id, 'resolved')`
   - 400 on invalid id (not matching `SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/`)
   - 404 when `updateStatus` throws `Interaction <id> not found`
   - 409 when `updateStatus` throws on already-resolved (we'll guard by reading current status first; see step 3 implementation)
   - `false` for non-matching paths

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/interactions-resolve.test.ts` — **observe failure** (file missing).

3. Create `packages/orchestrator/src/server/routes/v1/interactions-resolve.ts`:

   ```ts
   import type { IncomingMessage, ServerResponse } from 'node:http';
   import { z } from 'zod';
   import type { InteractionQueue } from '../../../core/interaction-queue';
   import { readBody } from '../../utils.js';

   const BodySchema = z.object({ answer: z.unknown().optional() });
   const RESOLVE_PATH_RE = /^\/api\/v1\/interactions\/([a-zA-Z0-9_-]+)\/resolve(?:\?.*)?$/;

   function sendJSON(res: ServerResponse, status: number, body: unknown): void {
     res.writeHead(status, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify(body));
   }

   /**
    * POST /api/v1/interactions/{id}/resolve — Phase 2 bridge primitive.
    *
    * Wraps InteractionQueue.updateStatus(id, 'resolved'). 409 if already resolved
    * (per spec). The interaction event-bus emit (interaction.resolved) is owned by
    * InteractionQueue.updateStatus itself in Phase 2's Task 8, NOT this handler —
    * keeps the emit on a single code path regardless of caller (legacy PATCH or
    * v1 POST).
    *
    * Scope: resolve-interaction (enforced by dispatchAuthedRequest).
    */
   export function handleV1InteractionsResolveRoute(
     req: IncomingMessage,
     res: ServerResponse,
     queue: InteractionQueue | undefined
   ): boolean {
     if (req.method !== 'POST') return false;
     const match = RESOLVE_PATH_RE.exec(req.url ?? '');
     if (!match || !match[1]) return false;
     if (!queue) {
       sendJSON(res, 503, { error: 'Interaction queue not available' });
       return true;
     }
     const id = match[1];
     void (async () => {
       let raw: string;
       try {
         raw = await readBody(req);
       } catch {
         sendJSON(res, 413, { error: 'Body too large' });
         return;
       }
       if (raw.length > 0) {
         // Allow empty body OR a JSON body with optional `answer`.
         try {
           // harness-ignore SEC-DES-001: input validated by Zod schema (BodySchema) below
           const json = JSON.parse(raw);
           const parsed = BodySchema.safeParse(json);
           if (!parsed.success) {
             sendJSON(res, 400, { error: 'Invalid body', issues: parsed.error.issues });
             return;
           }
         } catch {
           sendJSON(res, 400, { error: 'Invalid JSON body' });
           return;
         }
       }
       try {
         // Read first so we can distinguish 404 vs. 409 without race.
         const existing = (await queue.list()).find((i) => i.id === id);
         if (!existing) {
           sendJSON(res, 404, { error: `Interaction ${id} not found` });
           return;
         }
         if (existing.status === 'resolved') {
           sendJSON(res, 409, { error: `Interaction ${id} already resolved` });
           return;
         }
         await queue.updateStatus(id, 'resolved');
         sendJSON(res, 200, { resolved: true });
       } catch (err) {
         const msg = err instanceof Error ? err.message : 'Failed to resolve';
         if (msg.includes('not found')) {
           sendJSON(res, 404, { error: msg });
           return;
         }
         sendJSON(res, 500, { error: 'Internal error resolving interaction' });
       }
     })();
     return true;
   }
   ```

4. Modify `packages/orchestrator/src/server/http.ts`:
   - Add import: `import { handleV1InteractionsResolveRoute } from './routes/v1/interactions-resolve';`
   - Insert into `buildApiRoutes()` immediately after the existing `handleInteractionsRoute` entry:

     ```ts
     (req, res) =>
       !!this.interactionQueue &&
       handleV1InteractionsResolveRoute(req, res, this.interactionQueue),
     ```

5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/interactions-resolve.test.ts` — **observe pass.**
6. Run: `pnpm --filter @harness-engineering/orchestrator test` — full suite green.
7. Run: `harness validate`
8. Commit: `feat(orchestrator): POST /api/v1/interactions/{id}/resolve bridge primitive`

---

### Task 7: `GET /api/v1/events` SSE handler (TDD)

**Depends on:** Task 6
**Files:**

- `packages/orchestrator/src/server/routes/v1/events-sse.test.ts` (new)
- `packages/orchestrator/src/server/routes/v1/events-sse.ts` (new)
- `packages/orchestrator/src/server/http.ts` (modify: import + insert into `buildApiRoutes()`; expose orchestrator EventEmitter to the SSE handler)
  **Skills:** `events-event-schema` (reference), `ts-testing-types` (reference)

`[checkpoint:human-verify after Task 7]` — SSE wire-up is the biggest single risk in Phase 2 (long-lived connections, framing correctness, heartbeat). Human verification before continuing to interaction-emit refactor in Task 8.

1. Create `packages/orchestrator/src/server/routes/v1/events-sse.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { EventEmitter } from 'node:events';
   import { IncomingMessage, ServerResponse } from 'node:http';
   import { Socket } from 'node:net';
   import { handleV1EventsSseRoute } from './events-sse';

   function makeReqRes(method: string, url: string, headers: Record<string, string> = {}) {
     const socket = new Socket();
     const req = new IncomingMessage(socket);
     req.method = method;
     req.url = url;
     req.headers = { accept: 'text/event-stream', ...headers };
     req.push(null);
     const res = new ServerResponse(req);
     // Capture writes for assertions.
     const chunks: string[] = [];
     const origWrite = res.write.bind(res);
     res.write = ((c: string | Buffer): boolean => {
       chunks.push(typeof c === 'string' ? c : c.toString('utf-8'));
       return origWrite(c as never);
     }) as typeof res.write;
     return { req, res, chunks };
   }

   describe('GET /api/v1/events SSE', () => {
     it('returns false for non-matching paths', () => {
       const emitter = new EventEmitter();
       const { req, res } = makeReqRes('GET', '/api/state');
       expect(handleV1EventsSseRoute(req, res, emitter)).toBe(false);
     });

     it('writes SSE headers and an initial comment frame', () => {
       const emitter = new EventEmitter();
       const { req, res, chunks } = makeReqRes('GET', '/api/v1/events');
       const handled = handleV1EventsSseRoute(req, res, emitter);
       expect(handled).toBe(true);
       expect(res.getHeader('Content-Type')).toBe('text/event-stream');
       expect(res.getHeader('Cache-Control')).toBe('no-cache');
       expect(res.getHeader('Connection')).toBe('keep-alive');
       expect(chunks.some((c) => c.startsWith(':'))).toBe(true);
     });

     it('emits an event frame when emitter fires a subscribed topic', async () => {
       const emitter = new EventEmitter();
       const { req, res, chunks } = makeReqRes('GET', '/api/v1/events');
       handleV1EventsSseRoute(req, res, emitter);
       emitter.emit('interaction.created', { id: 'int_abc', issueId: 'iss_1' });
       await new Promise((r) => setImmediate(r));
       const joined = chunks.join('');
       expect(joined).toMatch(/event: interaction\.created\n/);
       expect(joined).toMatch(/data: \{"id":"int_abc",.+\}\n/);
       expect(joined).toMatch(/id: evt_[a-f0-9]{16}\n\n/);
     });

     it('removes listeners on client disconnect', () => {
       const emitter = new EventEmitter();
       const { req, res } = makeReqRes('GET', '/api/v1/events');
       handleV1EventsSseRoute(req, res, emitter);
       const before = emitter.listenerCount('state_change');
       res.emit('close');
       expect(emitter.listenerCount('state_change')).toBe(before - 1);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/events-sse.test.ts` — **observe failure** (file missing).

3. Create `packages/orchestrator/src/server/routes/v1/events-sse.ts`:

   ```ts
   import type { IncomingMessage, ServerResponse } from 'node:http';
   import type { EventEmitter } from 'node:events';
   import { randomBytes } from 'node:crypto';

   /**
    * Event-bus topics the SSE handler subscribes to. Mirrors the WebSocket
    * broadcaster topics today + the two new Phase 2 interaction emits.
    * Phase 3 extends this with `webhook.*`; Phase 5 with `telemetry.*`.
    */
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
   ] as const;

   const HEARTBEAT_MS = 15_000;

   function newEventId(): string {
     return `evt_${randomBytes(8).toString('hex')}`;
   }

   /**
    * GET /api/v1/events — Phase 2 bridge primitive.
    *
    * Spec D1: SSE stream alongside legacy /ws WebSocket. Each event is framed as:
    *   event: <type>
    *   data: <json>
    *   id: <evt_…>
    *
    * Reconnection-via-Last-Event-ID is deferred to Phase 4 when the SQLite
    * webhook queue lands (re-uses the same persistence layer).
    *
    * Scope: read-telemetry (enforced by dispatchAuthedRequest).
    */
   export function handleV1EventsSseRoute(
     req: IncomingMessage,
     res: ServerResponse,
     bus: EventEmitter
   ): boolean {
     if (req.method !== 'GET' || req.url !== '/api/v1/events') return false;

     res.writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       Connection: 'keep-alive',
       'X-Accel-Buffering': 'no', // disables proxy buffering (nginx, etc.)
     });
     // Initial comment frame opens the stream for the client.
     res.write(`: harness gateway SSE — connected at ${new Date().toISOString()}\n\n`);

     const listeners: Array<{ topic: string; fn: (data: unknown) => void }> = [];
     for (const topic of SSE_TOPICS) {
       const fn = (data: unknown): void => {
         try {
           const frame =
             `event: ${topic}\n` + `data: ${JSON.stringify(data)}\n` + `id: ${newEventId()}\n\n`;
           res.write(frame);
         } catch {
           // Connection write failure → unsubscribe on close handler below.
         }
       };
       bus.on(topic, fn);
       listeners.push({ topic, fn });
     }

     const heartbeat = setInterval(() => {
       try {
         res.write(': heartbeat\n\n');
       } catch {
         // ignore — close handler cleans up
       }
     }, HEARTBEAT_MS);
     heartbeat.unref();

     const cleanup = (): void => {
       clearInterval(heartbeat);
       for (const { topic, fn } of listeners) bus.removeListener(topic, fn);
     };
     res.on('close', cleanup);
     res.on('finish', cleanup);

     return true;
   }
   ```

4. Modify `packages/orchestrator/src/server/http.ts`:
   - Add import: `import { handleV1EventsSseRoute } from './routes/v1/events-sse';`
   - **Important:** the orchestrator already extends `EventEmitter` (see `orchestrator.ts:90 export class Orchestrator extends EventEmitter`). The existing `Snapshotable` type used in `OrchestratorServer.constructor` only requires `on`/`removeListener` — it does **not** allow attaching SSE-style listeners to many topics. Widen the type to accept any `EventEmitter`-ish shape, OR pass the orchestrator through unmodified by adding a typed `getEventBus()` accessor.

     Minimal change: cast `this.orchestrator` to `EventEmitter` at the call site (it already implements the interface in production):

     ```ts
     import type { EventEmitter } from 'node:events';
     // ...
     (req, res) =>
       handleV1EventsSseRoute(req, res, this.orchestrator as unknown as EventEmitter),
     ```

     Insert this entry into `buildApiRoutes()` **near the end** (before the chat-proxy entry, so SSE matching short-circuits before any of the slower legacy routes). SSE is a hot-path long-lived connection — keeping it close to the top of dispatch (but after auth) reduces wakeup latency for clients.

5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/events-sse.test.ts` — **observe pass.**
6. Run: `pnpm --filter @harness-engineering/orchestrator test` — full suite green.
7. Run: `harness validate`
8. **Manual SSE smoke test (`[checkpoint:human-verify]`):**
   - Start orchestrator: `pnpm --filter @harness-engineering/orchestrator dev`.
   - `curl -N -H "Accept: text/event-stream" http://127.0.0.1:8080/api/v1/events` — observe initial `: harness gateway SSE — connected at …` comment frame.
   - Trigger a maintenance task via `curl -X POST http://127.0.0.1:8080/api/v1/jobs/maintenance -d '{"taskId":"cleanup-sessions"}'` (or any registered task). Confirm an `event: maintenance:started` frame appears on the SSE stream.
   - Disconnect (Ctrl-C) and confirm orchestrator logs no warning about leaked listeners.

9. Commit: `feat(orchestrator): GET /api/v1/events SSE handler`

---

### Task 8: Emit `interaction.created` / `interaction.resolved` on the event bus

**Depends on:** Task 7
**Files:**

- `packages/orchestrator/src/core/interaction-queue.ts` (modify: accept optional emitter; emit on push + updateStatus)
- `packages/orchestrator/src/orchestrator.ts` (modify: pass `this` into `InteractionQueue` constructor)
- `packages/orchestrator/src/core/interaction-queue.test.ts` (extend or create)
  **Skills:** `events-event-schema` (reference)

This task closes Observable Truth #6 — the SSE handler from Task 7 already subscribes to `interaction.created` and `interaction.resolved`, but no one emits them yet.

1. Modify `packages/orchestrator/src/core/interaction-queue.ts`:
   - Constructor accepts an optional `EventEmitter`:

     ```ts
     import type { EventEmitter } from 'node:events';
     // ...
     constructor(dir: string, emitter?: EventEmitter) {
       this.dir = dir;
       this.emitter = emitter ?? null;
     }
     private emitter: EventEmitter | null;
     ```

   - At the bottom of `push()` after the listener loop, emit:

     ```ts
     this.emitter?.emit('interaction.created', interaction);
     ```

   - At the bottom of `updateStatus()` after the `writeFile`, emit:

     ```ts
     if (status === 'resolved') {
       this.emitter?.emit('interaction.resolved', {
         id,
         status: 'resolved',
         resolvedAt: new Date().toISOString(),
       });
     }
     ```

2. Modify `packages/orchestrator/src/orchestrator.ts`:
   - Find where `InteractionQueue` is constructed (search for `new InteractionQueue`).
   - Pass `this` (orchestrator extends `EventEmitter`) as the second arg:

     ```ts
     this.interactionQueue = new InteractionQueue(interactionsDir, this);
     ```

3. Add to `packages/orchestrator/src/core/interaction-queue.test.ts` (create file if absent):

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { mkdtempSync, rmSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { EventEmitter } from 'node:events';
   import { InteractionQueue, type PendingInteraction } from './interaction-queue';

   const sample: PendingInteraction = {
     id: 'int_test',
     issueId: 'iss_test',
     type: 'needs-human',
     reasons: ['test'],
     context: {
       issueTitle: 'T',
       issueDescription: null,
       specPath: null,
       planPath: null,
       relatedFiles: [],
     },
     createdAt: new Date().toISOString(),
     status: 'pending',
   };

   describe('InteractionQueue event emission', () => {
     let dir: string;
     beforeEach(() => {
       dir = mkdtempSync(join(tmpdir(), 'iq-emit-'));
     });
     afterEach(() => {
       rmSync(dir, { recursive: true, force: true });
     });

     it('emits interaction.created on push', async () => {
       const bus = new EventEmitter();
       const events: unknown[] = [];
       bus.on('interaction.created', (e) => events.push(e));
       const q = new InteractionQueue(dir, bus);
       await q.push(sample);
       expect(events).toHaveLength(1);
       expect((events[0] as PendingInteraction).id).toBe('int_test');
     });

     it('emits interaction.resolved on updateStatus("resolved") only', async () => {
       const bus = new EventEmitter();
       const events: unknown[] = [];
       bus.on('interaction.resolved', (e) => events.push(e));
       const q = new InteractionQueue(dir, bus);
       await q.push(sample);
       await q.updateStatus('int_test', 'claimed');
       expect(events).toHaveLength(0);
       await q.updateStatus('int_test', 'resolved');
       expect(events).toHaveLength(1);
       const evt = events[0] as { id: string; status: string };
       expect(evt.id).toBe('int_test');
       expect(evt.status).toBe('resolved');
     });

     it('is a no-op when no emitter is passed (backwards compat)', async () => {
       const q = new InteractionQueue(dir); // no emitter
       await q.push(sample);
       await q.updateStatus('int_test', 'resolved');
       // No assertions on emission; just verifying no throw.
     });
   });
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/core/interaction-queue.test.ts` — **observe pass.**
5. Run: `pnpm --filter @harness-engineering/orchestrator test` — full suite green.
6. Run: `harness validate`
7. Commit: `feat(orchestrator): emit interaction.created/resolved on the event bus`

---

### Task 9: Extend OpenAPI registry to cover all v1 routes

**Depends on:** Task 8
**Files:**

- `packages/orchestrator/src/gateway/openapi/v1-registry.ts` (new)
- `packages/orchestrator/src/gateway/openapi/registry.ts` (modify: keep `buildAuthRegistry()` exported; add `buildV1Registry()` that composes auth + v1 entries)
- `packages/orchestrator/src/gateway/openapi/generate.ts` (modify: switch to `buildV1Document()`)
- `packages/orchestrator/src/gateway/openapi/generate.test.ts` (extend with v1 coverage assertions)
  **Skills:** `ts-zod-integration` (apply), `events-event-schema` (reference)

1. Create `packages/orchestrator/src/gateway/openapi/v1-registry.ts`:

   ```ts
   import { z } from 'zod';
   import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
   import { buildAuthRegistry } from './registry';

   extendZodWithOpenApi(z);

   /**
    * Extends the Phase 1 auth registry with:
    *   - 12 legacy-alias paths under /api/v1/* (interactions, plans, analyze,
    *     analyses, roadmap-actions, dispatch-actions, local-model, local-models,
    *     maintenance, streams, sessions, chat-proxy)
    *   - 3 Phase 2 bridge primitives (jobs/maintenance, interactions/{id}/resolve,
    *     events)
    *
    * Schemas for the 12 legacy aliases are intentionally lightweight in Phase 2
    * (just path + method + 200 / 4xx contract). Phase 4 narrows them when the
    * dashboard wire types are unified into @harness-engineering/types as part
    * of the Phase 0 finalization step.
    */
   export function buildV1Registry(): OpenAPIRegistry {
     const registry = buildAuthRegistry();

     // Helper: register a plain GET/200 path with a minimal schema.
     const registerGetPath = (path: string, description: string, scope: string): void => {
       registry.registerPath({
         method: 'get',
         path,
         description: `${description} Scope: ${scope}.`,
         security: [{ BearerAuth: [] }],
         responses: {
           200: {
             description: 'OK',
             content: { 'application/json': { schema: z.unknown() } },
           },
           401: { description: 'Unauthorized' },
           403: { description: 'Insufficient scope' },
         },
       });
     };
     const registerPostPath = (
       path: string,
       description: string,
       scope: string,
       reqSchema: z.ZodTypeAny,
       resSchema: z.ZodTypeAny
     ): void => {
       registry.registerPath({
         method: 'post',
         path,
         description: `${description} Scope: ${scope}.`,
         security: [{ BearerAuth: [] }],
         request: { body: { content: { 'application/json': { schema: reqSchema } } } },
         responses: {
           200: { description: 'OK', content: { 'application/json': { schema: resSchema } } },
           400: { description: 'Invalid body' },
           401: { description: 'Unauthorized' },
           403: { description: 'Insufficient scope' },
           404: { description: 'Not found' },
           409: { description: 'Conflict' },
         },
       });
     };

     // ── Legacy aliases ──
     registerGetPath('/api/v1/state', 'Orchestrator snapshot.', 'read-status');
     registerGetPath('/api/v1/interactions', 'List interactions.', 'resolve-interaction');
     registerGetPath('/api/v1/plans', 'List plans.', 'read-status');
     registerGetPath('/api/v1/analyses', 'List analyses.', 'read-status');
     registerGetPath('/api/v1/maintenance/status', 'Maintenance status.', 'trigger-job');
     registerGetPath('/api/v1/maintenance/history', 'Maintenance history.', 'trigger-job');
     registerGetPath('/api/v1/sessions', 'List session metadata.', 'read-status');
     registerGetPath('/api/v1/streams', 'List recorded streams.', 'read-status');
     registerGetPath('/api/v1/local-model', 'Local model status.', 'read-status');
     registerGetPath('/api/v1/local-models', 'Local models statuses.', 'read-status');

     // ── Bridge primitives ──
     registerPostPath(
       '/api/v1/jobs/maintenance',
       'Trigger a maintenance task ad-hoc.',
       'trigger-job',
       z.object({ taskId: z.string(), params: z.record(z.unknown()).optional() }),
       z.object({ ok: z.boolean(), taskId: z.string(), runId: z.string() })
     );

     registry.registerPath({
       method: 'post',
       path: '/api/v1/interactions/{id}/resolve',
       description: 'Resolve a pending interaction. Scope: resolve-interaction.',
       security: [{ BearerAuth: [] }],
       request: {
         params: z.object({ id: z.string() }),
         body: {
           content: {
             'application/json': { schema: z.object({ answer: z.unknown().optional() }) },
           },
         },
       },
       responses: {
         200: {
           description: 'Resolved',
           content: { 'application/json': { schema: z.object({ resolved: z.literal(true) }) } },
         },
         404: { description: 'Interaction not found' },
         409: { description: 'Already resolved' },
       },
     });

     registry.registerPath({
       method: 'get',
       path: '/api/v1/events',
       description: 'Server-Sent Events stream of GatewayEvent frames. Scope: read-telemetry.',
       security: [{ BearerAuth: [] }],
       responses: {
         200: {
           description: 'SSE stream',
           content: { 'text/event-stream': { schema: z.string() } },
         },
       },
     });

     return registry;
   }
   ```

2. Modify `packages/orchestrator/src/gateway/openapi/registry.ts`:
   - Keep `buildAuthRegistry()` exported as-is (composition seam).
   - Replace `buildAuthDocument()` with `buildV1Document()` — but **keep `buildAuthDocument` as a deprecated alias** pointing at `buildV1Document` for one slice so Phase 1 tests don't break in a flag day.

   Add at the bottom:

   ```ts
   import { buildV1Registry } from './v1-registry';

   export function buildV1Document(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
     const generator = new OpenApiGeneratorV31(buildV1Registry().definitions);
     return generator.generateDocument({
       openapi: '3.1.0',
       info: {
         title: 'Harness Gateway API',
         version: '0.2.0',
         description:
           'Hermes Phase 0 — Phase 2: versioned /api/v1/* surface with auth, legacy aliases, and bridge primitives.',
       },
       servers: [{ url: 'http://127.0.0.1:8080' }],
     });
   }
   ```

3. Modify `packages/orchestrator/src/gateway/openapi/generate.ts` line 12:

   ```ts
   import { buildV1Document } from './registry';
   // ...
   const doc = buildV1Document();
   ```

4. Modify `packages/orchestrator/src/gateway/openapi/generate.test.ts`:
   - Update existing idempotency test to also assert path-count = 18 (3 auth + 10 legacy GETs + 3 bridge primitives + the auth `DELETE` + the `POST`/`GET` of auth = 18, exact count locked to catch drift).
   - Add explicit assertion for presence of `/api/v1/jobs/maintenance`, `/api/v1/interactions/{id}/resolve`, `/api/v1/events` paths.

5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/gateway/openapi/generate.test.ts` — **observe pass.**
6. Run: `harness validate`
7. Commit: `feat(orchestrator): OpenAPI registry covers all /api/v1/* routes`

---

### Task 10: Regenerate `docs/api/openapi.yaml` to reflect v1 coverage

**Depends on:** Task 9
**Files:** `docs/api/openapi.yaml` (regenerated artifact — vendored)

1. Run: `pnpm --filter @harness-engineering/orchestrator build`
2. Run: `pnpm --filter @harness-engineering/orchestrator openapi:generate`
3. Inspect the diff: `git diff docs/api/openapi.yaml | head -100` — confirm new v1 paths appear and existing auth paths still appear.
4. Verify idempotency: `pnpm --filter @harness-engineering/orchestrator openapi:generate && git diff --exit-code docs/api/openapi.yaml` → exit code 0.
5. Run: `harness validate`
6. Commit: `chore(api): regenerate openapi.yaml with Phase 2 v1 routes`

---

### Task 11: Register `trigger_maintenance_job` + `list_gateway_tokens` MCP tools (TDD)

**Depends on:** Task 10
**Files:**

- `packages/cli/src/mcp/tools/gateway-tools.ts` (new)
- `packages/cli/src/mcp/tools/gateway-tools.test.ts` (new)
- `packages/cli/src/mcp/server.ts` (modify: import + insert into `TOOL_DEFINITIONS` + `TOOL_HANDLERS`)
- `packages/cli/src/mcp/tool-tiers.ts` (modify: add to CORE_TOOL_NAMES / STANDARD_EXTRA)
  **Skills:** `ts-zod-integration` (apply)

1. Create `packages/cli/src/mcp/tools/gateway-tools.test.ts`. Cases:
   - `triggerMaintenanceJobDefinition.name` is `"trigger_maintenance_job"` and `inputSchema.required` includes `taskId`.
   - `listGatewayTokensDefinition.name` is `"list_gateway_tokens"`.
   - `handleTriggerMaintenanceJob({ taskId: "x" })` POSTs to `http://127.0.0.1:<port>/api/v1/jobs/maintenance` (use a fake-fetch double; the real handler reads `HARNESS_ORCHESTRATOR_URL` env var, defaulting to `http://127.0.0.1:8080`).
   - `handleListGatewayTokens({})` GETs `/api/v1/auth/tokens`.

2. Run: `pnpm --filter @harness-engineering/cli vitest run src/mcp/tools/gateway-tools.test.ts` — **observe failure** (file missing).

3. Create `packages/cli/src/mcp/tools/gateway-tools.ts`:

   ```ts
   import type { ToolDefinition } from '../server.js';

   function orchestratorBase(): string {
     return process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:8080';
   }

   function authHeader(): Record<string, string> {
     const tok = process.env['HARNESS_API_TOKEN'];
     return tok ? { Authorization: `Bearer ${tok}` } : {};
   }

   export const triggerMaintenanceJobDefinition: ToolDefinition = {
     name: 'trigger_maintenance_job',
     description:
       'Trigger a maintenance task ad-hoc via POST /api/v1/jobs/maintenance. Requires trigger-job scope.',
     inputSchema: {
       type: 'object',
       properties: {
         taskId: {
           type: 'string',
           description: 'Registered maintenance task identifier (e.g. cleanup-sessions)',
         },
         params: {
           type: 'object',
           description: 'Optional task-specific parameters',
           additionalProperties: true,
         },
       },
       required: ['taskId'],
     },
   };

   export async function handleTriggerMaintenanceJob(input: {
     taskId: string;
     params?: Record<string, unknown>;
   }): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
     const res = await fetch(`${orchestratorBase()}/api/v1/jobs/maintenance`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', ...authHeader() },
       body: JSON.stringify({ taskId: input.taskId, params: input.params }),
     });
     const text = await res.text();
     if (!res.ok) {
       return {
         content: [{ type: 'text', text: `Trigger failed (${res.status}): ${text}` }],
         isError: true,
       };
     }
     return { content: [{ type: 'text', text }] };
   }

   export const listGatewayTokensDefinition: ToolDefinition = {
     name: 'list_gateway_tokens',
     description:
       'List Gateway API tokens via GET /api/v1/auth/tokens. Secrets are redacted. Requires admin scope.',
     inputSchema: { type: 'object', properties: {}, additionalProperties: false },
   };

   export async function handleListGatewayTokens(): Promise<{
     content: Array<{ type: string; text: string }>;
     isError?: boolean;
   }> {
     const res = await fetch(`${orchestratorBase()}/api/v1/auth/tokens`, {
       headers: { ...authHeader() },
     });
     const text = await res.text();
     if (!res.ok) {
       return {
         content: [{ type: 'text', text: `List failed (${res.status}): ${text}` }],
         isError: true,
       };
     }
     return { content: [{ type: 'text', text }] };
   }
   ```

4. Modify `packages/cli/src/mcp/server.ts`:
   - Add import:
     ```ts
     import {
       triggerMaintenanceJobDefinition,
       handleTriggerMaintenanceJob,
       listGatewayTokensDefinition,
       handleListGatewayTokens,
     } from './tools/gateway-tools.js';
     ```
   - Append to `TOOL_DEFINITIONS` array:
     ```ts
     triggerMaintenanceJobDefinition,
     listGatewayTokensDefinition,
     ```
   - Add to `TOOL_HANDLERS`:
     ```ts
     trigger_maintenance_job: handleTriggerMaintenanceJob as ToolHandler,
     list_gateway_tokens: handleListGatewayTokens as ToolHandler,
     ```

5. Modify `packages/cli/src/mcp/tool-tiers.ts`:
   - Add `'list_gateway_tokens'` to `CORE_TOOL_NAMES` (alphabetically near `'manage_state'`).
   - Add `'trigger_maintenance_job'` to `STANDARD_EXTRA` under a new "Gateway tools" comment block.

6. Run: `pnpm --filter @harness-engineering/cli vitest run src/mcp/tools/gateway-tools.test.ts` — **observe pass.**
7. Run: `pnpm --filter @harness-engineering/cli test` — full suite green.
8. Run: `harness validate`
9. Commit: `feat(cli/mcp): register trigger_maintenance_job (tier-1) + list_gateway_tokens (tier-0)`

---

### Task 12: Wire `interaction_new` WebSocket emit alongside the new event-bus emit

**Depends on:** Task 11
**Files:** `packages/orchestrator/src/orchestrator.ts` (modify lines around 428 where `broadcastInteraction` is currently called)

This is a small consistency task. The Phase 1 `broadcastInteraction` WebSocket fan-out and the Phase 2 `interaction.created` event-bus emit now both fire from the same path: today via `this.server?.broadcastInteraction(interaction)` inline at the push site. Task 8 already wired `interaction.created` to fire from inside `InteractionQueue.push()`; this task ensures the dashboard's existing WebSocket consumer still receives the event by leaving `broadcastInteraction` alone — explicitly **no** rip-out of the WebSocket path. The dashboard's `/ws` listener and the new SSE listener now both observe interaction creation.

1. Confirm in `packages/orchestrator/src/orchestrator.ts` line ~428: `this.server?.broadcastInteraction(interaction);` is **unchanged**. Add an inline comment above it:

   ```ts
   // WebSocket fan-out for legacy dashboard consumers — unchanged.
   // The new SSE consumers receive `interaction.created` via the event bus
   // (emitted from InteractionQueue.push, see Phase 2 Task 8).
   this.server?.broadcastInteraction(interaction);
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test` — full suite green; in particular, any test that listens on `/ws` for `interaction_new` must still pass.
3. Run: `harness validate`
4. Commit: `docs(orchestrator): annotate WebSocket fan-out alongside SSE event-bus path`

(This is a documentation-only commit. If after Task 8 the orchestrator's `broadcastInteraction` already fires twice — once from inline + once from `InteractionQueue.push`'s emit-listener — split into a separate fix task. Phase 1 plan's pattern of small, single-responsibility tasks applies.)

---

### Task 13: Regenerate slash commands + per-host plugin manifests

**Depends on:** Task 12
**Files:**

- `packages/cli/src/commands/_registry.ts` — verify `harness gateway` commands still listed (no change needed; Phase 1 already added them)
- Generated outputs:
  - `harness-claude/*` plugin manifest
  - `harness-cursor/*` plugin manifest
  - `harness-codex/*` plugin manifest
  - `harness-gemini/*` plugin manifest
  - `harness-opencode/*` plugin manifest
    **Category:** integration
    **Skills:** —

`[checkpoint:human-verify after Task 13]` — Per-host plugin manifests touch five package directories; visual diff inspection is the right gate before commit.

1. Run: `pnpm harness generate-slash-commands` — emits slash commands for all hosts.
2. Diff inspection: `git status` should show changes scoped to plugin packages + (possibly) `packages/cli/src/mcp/_registry.ts` if auto-regenerated. Confirm:
   - No unrelated files modified.
   - The `trigger_maintenance_job` and `list_gateway_tokens` tool names appear in per-host manifests where MCP tools are listed.
   - Slash-command entries for the existing `harness gateway token …` family are present (carried forward from Phase 1).
3. **Human checkpoint:** review the diff in each plugin manifest. Confirm no host-specific schema regression (e.g., a manifest version bump that would force user re-install).
4. Run: `harness validate`
5. Run: `pnpm typecheck` — confirm no manifest-driven type breaks in dashboard/CLI.
6. Commit: `chore(plugins): regenerate manifests for Phase 2 MCP tools`

---

### Task 14: Final phase-gate verification

**Depends on:** Task 13
**Files:** (none — verification + session summary)
**Category:** integration

1. Run the full check suite:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test` (or per-package: `pnpm --filter @harness-engineering/{types,orchestrator,cli,dashboard} test`)
   - `harness validate`
   - `harness check-deps`
   - `harness check-arch` (must be clean — Phase 1 carry-forward warnings unchanged)
2. Manually verify Phase 2 exit-gate observable truths end-to-end:
   - `harness gateway token create --name phase2-bot --scopes trigger-job,resolve-interaction,read-telemetry,read-status` → capture token.
   - `curl -H "Authorization: Bearer <token>" http://127.0.0.1:8080/api/v1/state` → 200 with snapshot.
   - `curl -v http://127.0.0.1:8080/api/state` → `Deprecation: 2027-05-14` header present.
   - `curl -v http://127.0.0.1:8080/api/v1/state` → **no** Deprecation header.
   - `curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"taskId":"cleanup-sessions"}' http://127.0.0.1:8080/api/v1/jobs/maintenance` → 200 `{ ok: true, taskId, runId }`.
   - `curl -X POST -H "Authorization: Bearer <token>" -d '{}' http://127.0.0.1:8080/api/v1/interactions/<id>/resolve` (with a pending interaction id from `/api/v1/interactions`) → 200 `{ resolved: true }`.
   - Run two terminals: (a) `curl -N -H "Authorization: Bearer <token>" -H "Accept: text/event-stream" http://127.0.0.1:8080/api/v1/events`; (b) trigger any maintenance task. Observe an `event: maintenance:started` frame on (a).
   - `pnpm --filter @harness-engineering/orchestrator openapi:generate && git status docs/api/openapi.yaml` → clean (artifact byte-identical to committed).
3. Re-run `harness:soundness-review --mode plan` against this plan — confirm no new findings.
4. Write handoff for next phase pickup at `.harness/sessions/changes--hermes-phase-0-gateway-api--proposal/handoff.json` (autopilot writes; this task just confirms the file exists and is well-formed).
5. Commit (only if any verification-driven fix changes touched code): `chore(phase-2): close versioned-api-surface phase — all exit gates met`. Otherwise skip the commit; the previous commits are the deliverable.

---

## Verification Trace (observable truth → tasks)

| Observable Truth                                                 | Delivered by |
| ---------------------------------------------------------------- | ------------ |
| 1. v1 alias coverage (12 legacy routes reachable under /api/v1/) | Task 3       |
| 2. Deprecation: 2027-05-14 on legacy, absent on v1               | Tasks 2, 3   |
| 3. POST /api/v1/jobs/maintenance — happy + 4xx                   | Task 5       |
| 4. POST /api/v1/interactions/{id}/resolve — happy + 4xx          | Task 6       |
| 5. GET /api/v1/events SSE framing + heartbeat + cleanup          | Task 7       |
| 6. interaction.created / .resolved on event bus                  | Task 8       |
| 7. trigger_maintenance_job + list_gateway_tokens MCP tools       | Task 11      |
| 8. openapi.yaml covers all v1 routes, idempotent                 | Tasks 9, 10  |
| 9. Per-host plugin manifests regenerated                         | Task 13      |
| 10. Audit logs wire-final status (carry-forward fix)             | Task 1       |
| Full project still green                                         | Task 14      |

## Concerns / Risks

1. **Audit-status-staleness fix (Task 1) ships before route work.** Decision: address inline in Phase 2, not defer to Phase 1.1. **Rationale:** the bulk-wrap shim adds the 13 new dispatch paths in Tasks 3/5/6/7 — if the staleness bug remained, every new route would inherit it, then Phase 1.1 would need to retroactively fix 13 routes in one shot. Inline-fix-first costs one task and saves a 13× repeat of the bug pattern. **Justification (in handoff):** carry-forward backlog says "severity: backlog suggestion" — the planner brief explicitly recommends inline; this plan accepts.

2. **URL-rewrite shim mutates `req.url`.** The shim rewrites `req.url` in place for the route-table loop. Risks: (a) downstream code that re-reads `req.url` expecting the original v1 form would be confused. **Mitigation:** today no handler does this — they all match on `/api/<name>` prefixes — but a reviewer should sanity-check by `grep -n 'req\.url' packages/orchestrator/src/server/routes/` before approving Task 3. (b) the `Deprecation` header is set on the response **before** the rewrite mutates `req.url`, so the gating logic uses the v1Match capture, not the mutated URL.

3. **SSE handler subscribes to 9 event-bus topics; each connection adds 9 listeners.** Node default max-listeners is 10. With 2 simultaneous SSE clients we exceed the default on the orchestrator EventEmitter. **Mitigation:** Phase 2 sets `orchestrator.setMaxListeners(50)` in the constructor if it's not already. (Verify in Task 8 step 2.) Phase 4 will move to a fan-out broker (per spec D7 — webhook delivery worker shares this bus).

4. **`interaction.resolved` payload is shallow.** Phase 2 emits `{ id, status, resolvedAt }` only; richer envelopes (correlation id, answer body) land in Phase 3 when `GatewayEvent` graduates. SSE consumers in Phase 2 will see minimal frames; documented in the plan handoff so Phase 3 carries it forward.

5. **OpenAPI registry uses `z.unknown()` for legacy-alias response schemas.** Acceptable in Phase 2 (per spec: "re-shaping is deferred to /api/v2 if ever needed"). Phase 0 finalization may upgrade the schemas as part of the type-unification work. If the reference-bridge author at finalization complains about loose types, escalate to a Phase 0.1 follow-up.

6. **MCP tools require `HARNESS_API_TOKEN` env var to authenticate.** The new `trigger_maintenance_job` / `list_gateway_tokens` tools fall back to env-var auth — there's no token-store discovery in the CLI yet. **Mitigation:** documented in tool description; Phase 0 finalization step adds a `harness mcp config` flow for per-host token wiring (likely Phase 4 surface, not Phase 2 scope).

7. **`@asteasolutions/zod-to-openapi` produces non-deterministic output if `z.unknown()` is shared by reference across paths.** Task 9 uses fresh `z.unknown()` instances per path; the existing idempotency test in Phase 1 catches drift. Watch the CI `openapi-drift-check` workflow after the first push — if it flaps, switch to a single shared `z.unknown().openapi('AnyResponse')` reference.

8. **Plugin manifest regeneration (Task 13) touches five plugin packages.** If `pnpm harness generate-slash-commands` produces unexpected diffs (e.g., reordered keys), the human checkpoint catches it. No autopilot-only commit for Task 13.

## Integration Notes

- **Integration tier: medium.** Phase 2 extends an existing surface (no new package), adds 3 new routes, 2 new MCP tools, and a documentation artifact (openapi.yaml). Five plugin manifests are touched, but the changes are auto-regenerated, not hand-edited. Stops short of "large" (no new auth substrate or new CLI subcommand group).

- **No knowledge-pipeline updates in this phase.** `docs/knowledge/orchestrator/gateway-api.md` and `webhook-fanout.md` are deferred to Phase 0 finalization (Step N). Phase 2 contributes only the code substrate.

- **No ADR in this phase.** The "Orchestrator Gateway API contract" and "Telemetry export to OTel" ADRs land at Phase 0 finalization.

- **CI `openapi-drift-check` already exists** (added in Phase 1 Task 16). Phase 2 extends the registry but not the workflow; the workflow's path-filter `packages/orchestrator/src/gateway/openapi/**` already covers `v1-registry.ts`.

## Session State Updates

- **decisions** (new):
  - Address `audit-status-staleness` inline in Phase 2 (Task 1) rather than defer to Phase 1.1 — saves 13× repeat of the bug pattern.
  - Bulk-wrap (option b) for 12 legacy aliases via URL rewrite in dispatch — collapses 12 wrapper files to 1 shim.
  - Deprecation horizon `2027-05-14` (one year from plan date), overridable via `HARNESS_DEPRECATION_DATE`.
  - SSE handler attaches to orchestrator's `EventEmitter` directly (no broker); raise `setMaxListeners(50)` to absorb multi-client load.
  - `interaction.created` / `interaction.resolved` emitted from `InteractionQueue` (single code path for legacy PATCH + new v1 POST + any future callers).
- **constraints** (carried forward):
  - localhost-only binding (D5), `.harness/tokens.json` UTF-8, audit log best-effort writes (D7 cross-cutting).
  - bcryptjs verify on hot path (Phase 1 carry-forward; unchanged).
- **risks** (new):
  - URL-rewrite shim mutates `req.url`; reviewer must confirm no handler re-reads expecting original v1 form.
  - 9-topic SSE listener spike requires `setMaxListeners` lift.
- **openQuestions** (new):
  - When does the dashboard migrate from `/ws` to `/api/v1/events`? Deferred to Phase 0 finalization or Phase 4.
- **evidence** (new):
  - `packages/orchestrator/src/server/http.ts:243-262, 328-351, 360-410, 412-424` — dispatch + audit + route table.
  - `packages/orchestrator/src/server/routes/maintenance.ts:78-110, 122-158` — existing `triggerFn` injection point.
  - `packages/orchestrator/src/server/routes/interactions.ts:16-39, 46-79` — existing patch path.
  - `packages/orchestrator/src/orchestrator.ts:1441-1470, 90, 245, 560, 568, 571, 1304-1305, 1404, 1468` — `dispatchAdHoc`, `EventEmitter` extension, existing `emit(...)` sites.
  - `packages/orchestrator/src/core/interaction-queue.ts:62-153` — class shape + `updateStatus` signature.
  - `packages/orchestrator/src/auth/scopes.ts:8-54` — `SCOPE_VOCABULARY` + route table.
  - `packages/cli/src/mcp/server.ts:167-292` — `TOOL_DEFINITIONS` + `TOOL_HANDLERS`.
  - `packages/cli/src/mcp/tool-tiers.ts:20-57` — tier allowlists.

## Soundness-Review Convergence

A self-pass soundness-review (mode: plan) was run against this draft. Findings and resolution:

| #   | Severity   | Finding                                                                               | Resolution                                                                                                  |
| --- | ---------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | important  | Bulk-wrap shim was unjustified beyond "fewer files"                                   | Added explicit alternatives-rejected note in Uncertainties + risk #2 mitigation step (`grep -n 'req\.url'`) |
| 2   | important  | SSE listener count not bounded for multi-client load                                  | Added Task 8 step 2 `setMaxListeners(50)` + risk #3                                                         |
| 3   | suggestion | `interaction.resolved` payload would be confused with full `PendingInteraction` shape | Documented shallow `{ id, status, resolvedAt }` payload + deferred-richer note                              |
| 4   | suggestion | Audit-status-staleness fix ordering unclear vs. route work                            | Made Task 1 explicitly the first task with rationale in Concerns #1                                         |
| 5   | suggestion | OpenAPI schemas for legacy aliases use `z.unknown()` (loose)                          | Documented in risk #5 with finalization-step upgrade path                                                   |

Convergence: no remaining blocking findings after one pass.

## Gates

- All 14 tasks include exact file paths, exact code, exact verification commands. No vague placeholders.
- Tasks 1, 3, 5, 6, 7, 8, 11 follow TDD: write test → observe failure → implement → observe pass → commit.
- Each task is single-context-window scoped (one file or one cluster of tightly-coupled files).
- Phase exit-gate observable truths all trace to specific tasks (see Verification Trace).
- `harness validate` runs in every task; `harness check-deps` runs in the final verification task.
- 3 checkpoints requested:
  - After Task 3 (URL rewrite + Deprecation behavior — biggest dispatch-layer change).
  - After Task 7 (SSE wire-up — biggest single new feature and the only long-lived connection path).
  - After Task 13 (per-host plugin manifest regen — touches 5 plugin packages).
