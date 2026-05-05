# Plan: Spec 1 Phase 4 — Dashboard Surface (server + client)

**Date:** 2026-04-30 | **Spec:** `docs/changes/local-model-fallback/proposal.md` (Phase 4 only) | **Tasks:** 8 | **Time:** ~38 min | **Integration Tier:** medium | **Session:** `changes--local-model-fallback--proposal`

## Goal

Surface `LocalModelStatus` end-to-end so a dashboard user observes a clear warning whenever no configured local model is loaded, and that warning self-clears within one probe interval after a model is loaded — without restarting the orchestrator. Phase 4 wires (a) a new orchestrator HTTP route `GET /api/v1/local-model/status`, (b) a real WebSocket-broadcast path for topic `local-model:status` (replacing the Phase 3 stub semantics with full SC18 instrumentation), (c) a typed `useLocalModelStatus()` React hook with HTTP-fallback initial load, and (d) a warning banner on the existing Orchestrator page (`packages/dashboard/src/client/pages/Orchestrator.tsx`).

## Phase 4 Scope (from spec §Implementation Order)

Phase 4 delivers:

1. **HTTP route** — `GET /api/v1/local-model/status` on the orchestrator HTTP server. Returns `LocalModelStatus` JSON (or 503 when local backend not configured). Wired through a new `handleLocalModelRoute(req, res, getStatus)` handler at `packages/orchestrator/src/server/routes/local-model.ts` (NEW).
2. **WebSocket topic registration** — keep `OrchestratorServer.broadcastLocalModelStatus()` exactly as Phase 3 left it (it already calls `broadcaster.broadcast('local-model:status', status)`). Phase 4 verifies SC18 with a dedicated server test that asserts a connected WebSocket client receives the `local-model:status` payload when the resolver fires `onStatusChange`.
3. **Client WebSocketMessage extension** — extend the dashboard's `WebSocketMessage` discriminated union with the `local-model:status` variant so `useOrchestratorSocket` and the new hook share the same typed channel.
4. **React hook** — `useLocalModelStatus()` at `packages/dashboard/src/client/hooks/useLocalModelStatus.ts` (NEW). Subscribes to the orchestrator WebSocket for `local-model:status` events with an HTTP `GET /api/v1/local-model/status` fallback for initial load. Exposes `{ status, loading, error }`.
5. **Warning banner** — `LocalModelBanner` rendered inside `Orchestrator.tsx` at the top of the dashboard. Visible only when `status.available === false`. Shows configured list, detected list, endpoint, last error, last probe time. Clears automatically when the next status update flips `available` to `true`.
6. **Tests** —
   - SC17: server route returns the resolver's status JSON; returns 503 when no resolver.
   - SC18: WebSocket client receives `{ type: 'local-model:status', data: <LocalModelStatus> }` when `broadcastLocalModelStatus` is called.
   - SC19: banner component test renders correctly when `available === false` and is hidden when `available === true`.
   - SC20: scripted hook test that simulates a status flip from `available: false` → `available: true` and asserts the banner disappears (component-level proxy for the manual smoke test in Phase 6).
7. **Phase exit gate** — `pnpm typecheck`, `pnpm lint`, `pnpm test` (full repo), `harness validate`, `harness check-deps`.

Phase 4 explicitly excludes:

- ADRs and knowledge-doc materialization (Phase 5).
- Documentation updates to `docs/guides/hybrid-orchestrator-quickstart.md`, `docs/guides/intelligence-pipeline.md`, `harness.orchestrator.md`, etc. (Phase 5).
- Any change to `LocalModelResolver` or its lifecycle wiring (Phases 1–3).
- The proxy registration in `packages/dashboard/src/server/orchestrator-proxy.ts` — `/api/v1` is already on the prefix list (line 20), so no change needed.
- The Vite dev proxy in `packages/dashboard/vite.config.ts` — `/api/v1` already routes to the orchestrator, so no change needed.

## Observable Truths (Acceptance Criteria — Phase 4 only)

1. **OT1 (SC17 — HTTP route shape):** When the system is in a state where the resolver is initialized, `GET /api/v1/local-model/status` shall return HTTP 200 with a JSON body whose shape matches `LocalModelStatus` exactly: keys `available`, `resolved`, `configured`, `detected`, `lastProbeAt`, `lastError`, `warnings` are all present and have the correct primitive types per the type definition.
2. **OT2 (SC17 — 503 when local not configured):** When the system has no `localModelResolver` (cloud-only config), `GET /api/v1/local-model/status` shall return HTTP 503 with body `{ "error": "Local backend not configured" }` and the orchestrator shall not crash.
3. **OT3 (SC18 — WebSocket broadcast):** When `OrchestratorServer.broadcastLocalModelStatus(status)` is called with any `LocalModelStatus` payload, all connected WebSocket clients on `/ws` shall receive a single message whose `type` is `'local-model:status'` and whose `data` deeply equals the supplied status.
4. **OT4 (SC18 — broadcast triggered by resolver onStatusChange):** Verified at the server-test layer (not orchestrator integration — that is Phase 3's job): a unit test that constructs `OrchestratorServer`, opens a real `ws` client, and calls `server.broadcastLocalModelStatus(fakeStatus)` shall observe the message arrive within 100ms.
5. **OT5 (SC19 — banner visible when unavailable):** When `useLocalModelStatus()` returns `status.available === false`, the Orchestrator page shall render an element with the role `alert` (or visually-equivalent banner) that contains the substrings (a) the endpoint URL, (b) every configured candidate ID, (c) every detected model ID (or "none detected" when empty), (d) the `lastError` string when non-null, and (e) a human-formatted `lastProbeAt` (or "never" when null).
6. **OT6 (SC19 — banner hidden when available):** When `useLocalModelStatus()` returns `status.available === true`, the banner element shall not be present in the rendered DOM (queried via `screen.queryByRole('alert')` returning null).
7. **OT7 (SC20 — banner self-clears on flip):** A component-level test using a controllable mock of `useLocalModelStatus()` shall, when the hook's return value transitions from `{ status: { available: false, ... } }` to `{ status: { available: true, ... } }`, observe the banner unmount within one React render cycle (no manual refresh, no explicit unmount call).
8. **OT8 (HTTP fallback for initial load):** On hook mount when the WebSocket has not yet delivered a `local-model:status` event, the hook shall issue exactly one `GET /api/v1/local-model/status` request and seed `status` from the response. If the WebSocket later delivers an event, the WebSocket value shall replace the HTTP-fallback value.
9. **OT9 (mechanical):** `pnpm typecheck`, `pnpm lint`, `pnpm test` (full repo), `harness validate`, and `harness check-deps` all pass at end of phase.
10. **OT10 (no proxy regressions):** `/api/v1/local-model/status` is reachable through the dashboard's reverse proxy (`packages/dashboard/src/server/orchestrator-proxy.ts`) and Vite dev proxy (`packages/dashboard/vite.config.ts`) without any change to those files. Verified by a grep that confirms `/api/v1` is in `ORCHESTRATOR_PREFIXES` at `orchestrator-proxy.ts:18-32`.

## Skill Recommendations

From `docs/changes/local-model-fallback/SKILLS.md`:

- `ts-testing-types` (reference) — relevant for Tasks 5–7 (typed test fixtures for the WebSocket message variant and `LocalModelStatus` payloads).
- `ts-type-guards` (reference) — relevant for Task 3 (extending the `WebSocketMessage` discriminated union and narrowing in the new hook).

Other recommended skills from SKILLS.md (`gof-*`, `ts-zod-integration`, etc.) are not applied — Phase 4 is wiring a known-shape route and a known-shape React hook, not introducing new architectural patterns.

## File Map

- CREATE `packages/orchestrator/src/server/routes/local-model.ts` — `handleLocalModelRoute(req, res, getStatus)` route handler. 503 when `getStatus` is null; 200 with `LocalModelStatus` JSON otherwise.
- MODIFY `packages/orchestrator/src/server/http.ts` — extend `ServerDependencies` with `getLocalModelStatus?: () => import('@harness-engineering/types').LocalModelStatus | null`; store on the server; route through `handleLocalModelRoute` inside `handleApiRoutes`.
- MODIFY `packages/orchestrator/src/orchestrator.ts` — pass `getLocalModelStatus: () => this.localModelResolver?.getStatus() ?? null` into the `OrchestratorServer` constructor at `orchestrator.ts:236`.
- CREATE `packages/orchestrator/tests/server/routes/local-model.test.ts` — covers OT1, OT2, plus a malformed-getStatus guard.
- CREATE `packages/orchestrator/tests/server/local-model-broadcast.test.ts` — covers OT3, OT4 (real `ws` client connection).
- MODIFY `packages/dashboard/src/client/types/orchestrator.ts` — add `LocalModelStatus` import (already exported from `@harness-engineering/types`); extend `WebSocketMessage` with `{ type: 'local-model:status'; data: LocalModelStatus }`.
- CREATE `packages/dashboard/src/client/hooks/useLocalModelStatus.ts` — typed hook with WebSocket-subscribe + HTTP-fallback initial load.
- CREATE `packages/dashboard/tests/client/hooks/useLocalModelStatus.test.ts` — covers OT7 (flip), OT8 (HTTP fallback).
- MODIFY `packages/dashboard/src/client/pages/Orchestrator.tsx` — add `LocalModelBanner` component (file-local) + render at top of returned tree. Reads `useLocalModelStatus()`. Hidden when `status.available === true` or `status === null`.
- MODIFY `packages/dashboard/tests/client/pages/Orchestrator.test.tsx` — add tests for OT5, OT6 (banner visible/hidden) using a mock of `useLocalModelStatus()`.

No type changes in `packages/types` (Phase 1 already added `LocalModelStatus`). No backend file changes. No test file modifications outside the new test files.

## Skeleton

1. Server route handler + DI plumbing — new `local-model.ts`, extend `ServerDependencies`, register in `handleApiRoutes`, wire from orchestrator (~1 task, ~7 min)
2. Server route test (SC17) — OT1, OT2 via direct route handler + lightweight `http.createServer` (~1 task, ~5 min)
3. Server WebSocket broadcast test (SC18) — OT3, OT4 with real `ws` client (~1 task, ~5 min)
4. Client `WebSocketMessage` extension — add `local-model:status` variant (~1 task, ~3 min)
5. Client hook `useLocalModelStatus()` — WebSocket subscribe + HTTP fallback (~1 task, ~6 min)
6. Client hook test (OT7, OT8) — flip + HTTP fallback (~1 task, ~5 min)
7. Banner component in `Orchestrator.tsx` + tests (OT5, OT6) (~1 task, ~5 min)
8. Phase exit gate — typecheck, lint, full repo test, validate, check-deps (~1 task, ~2 min)

**Estimated total:** 8 tasks, ~38 min. Skeleton inline (autopilot non-interactive); per Rigor Levels table, `standard` mode at 8 tasks meets the >= 8 threshold so the skeleton is recorded but expansion proceeds without an interactive approval gate.

## Uncertainties

- **[ASSUMPTION]** Phase 3's `OrchestratorServer.broadcastLocalModelStatus()` (`packages/orchestrator/src/server/http.ts:171-184`) already routes through `broadcaster.broadcast('local-model:status', status)` and is wired in `Orchestrator.initLocalModelAndPipeline()` via `localModelResolver.onStatusChange` (`orchestrator.ts:1450-1459`). Phase 4 does **not** modify that method's body — Phase 3's "stub" comment notwithstanding, the broadcast is already correct. The only Phase 4 work on the server is the new HTTP route + tests. (If, during Task 1, the broadcast is found to be a no-op or wrong, escalate — this would be a Phase 3 regression, not Phase 4 scope.)
- **[ASSUMPTION]** The dashboard's existing reverse proxy already forwards `/api/v1/*` (`packages/dashboard/src/server/orchestrator-proxy.ts:18-32`). Phase 4 verifies this with a grep in OT10 but does not modify the proxy. Same for `vite.config.ts` (line 11-15, `'/api/v1'` proxy entry).
- **[ASSUMPTION]** The hook can use the existing `WebSocket` connection from `useOrchestratorSocket` indirectly by listening to a parallel `WebSocket` instance, OR by subscribing to events fed through a shared store. To avoid introducing a global store in Phase 4, the new hook will open its **own** WebSocket connection (matching the `useOrchestratorSocket` pattern), filter for `type: 'local-model:status'` messages, and ignore others. This is consistent with the existing per-feature hook pattern (each hook owns its own connection). The cost (a second WS connection per page) is acceptable for Phase 4 scope; consolidation is a separate refactor.
- **[ASSUMPTION]** The HTTP fallback uses native `fetch` (browser-global), no `useApi` because `useApi` is POST-only (`packages/dashboard/src/client/hooks/useApi.ts:16`). The new hook does its own GET with `fetch(url, { signal })` and AbortController, mirroring the pattern in `useRecentSessions`.
- **[ASSUMPTION]** Banner location: top of the rendered Orchestrator tree, **above** the "Agent Monitor" header so the warning is the first thing the user sees. Banner uses the same Tailwind palette already used for `OutcomeBadge` errors (red-900/50 background, red-400 text) for visual consistency.
- **[DEFERRABLE]** Banner copy: exact wording for the warning header. Phase 4 uses `"Local model unavailable"` as the heading and a body listing the four facts (configured, detected, endpoint, last error, last probe). Phase 5 (documentation) may revise wording during the guide-update pass.
- **[DEFERRABLE]** Real-orchestrator manual smoke for SC20 (start orchestrator with bogus list, load real model, see banner clear) is in spec §Phase 6, not Phase 4. Phase 4's component-level test (OT7) is the planning-time proxy.

No blocking uncertainties. Proceed to decomposition.

## Tasks

### Task 1: Add HTTP route handler + DI plumbing for `GET /api/v1/local-model/status`

**Depends on:** none | **Files:** `packages/orchestrator/src/server/routes/local-model.ts` (NEW), `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/src/orchestrator.ts`

**Skills:** `ts-type-guards` (reference)

This task wires the HTTP route end-to-end: a new route module, server-side dependency injection of a `getLocalModelStatus` callback, and the orchestrator's wiring of that callback to `this.localModelResolver?.getStatus() ?? null`. The route returns the status JSON or 503 when no resolver is configured.

1. Create `packages/orchestrator/src/server/routes/local-model.ts` with this exact content:

   ```typescript
   import type { IncomingMessage, ServerResponse } from 'node:http';
   import type { LocalModelStatus } from '@harness-engineering/types';

   /**
    * Callback returning the latest LocalModelStatus snapshot, or null when
    * no local backend is configured (cloud-only orchestrator). The route
    * returns 503 in the latter case so the dashboard banner renders an
    * informational state rather than failing silently.
    */
   export type GetLocalModelStatusFn = () => LocalModelStatus | null;

   function sendJSON(res: ServerResponse, status: number, body: unknown): void {
     res.writeHead(status, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify(body));
   }

   /**
    * Handles GET /api/v1/local-model/status.
    *
    * - Returns 200 with the LocalModelStatus snapshot when the orchestrator
    *   has an active LocalModelResolver.
    * - Returns 503 with { error: 'Local backend not configured' } when the
    *   getStatus callback is null or returns null.
    * - Returns 405 for non-GET methods.
    *
    * Returns true if the route matched, false otherwise.
    */
   export function handleLocalModelRoute(
     req: IncomingMessage,
     res: ServerResponse,
     getStatus: GetLocalModelStatusFn | null
   ): boolean {
     const { method, url } = req;
     if (url !== '/api/v1/local-model/status') return false;

     if (method !== 'GET') {
       sendJSON(res, 405, { error: 'Method not allowed' });
       return true;
     }

     if (!getStatus) {
       sendJSON(res, 503, { error: 'Local backend not configured' });
       return true;
     }

     const status = getStatus();
     if (!status) {
       sendJSON(res, 503, { error: 'Local backend not configured' });
       return true;
     }

     sendJSON(res, 200, status);
     return true;
   }
   ```

2. Open `packages/orchestrator/src/server/http.ts`. Add the new route import after the existing `import { handleSessionsRoute } from './routes/sessions';` line (~line 15):

   ```typescript
   import { handleLocalModelRoute } from './routes/local-model';
   import type { GetLocalModelStatusFn } from './routes/local-model';
   ```

3. Extend the `ServerDependencies` interface (~lines 78-96) with a new optional field. Add directly before the closing `}`:

   ```typescript
     /** Callback returning the current LocalModelStatus, or null when no local backend is configured. */
     getLocalModelStatus?: GetLocalModelStatusFn;
   ```

4. Add a new private field on the `OrchestratorServer` class (~line 113, after `private maintenanceDeps: MaintenanceRouteDeps | null = null;`):

   ```typescript
     private getLocalModelStatus: GetLocalModelStatusFn | null = null;
   ```

5. In `initDependencies()` (~lines 129-141), add at the end:

   ```typescript
   this.getLocalModelStatus = deps?.getLocalModelStatus ?? null;
   ```

6. In `handleApiRoutes()` (~lines 268-321), add a new branch immediately **before** the maintenance route check:

   ```typescript
   // Local-model status route
   if (handleLocalModelRoute(req, res, this.getLocalModelStatus)) {
     return true;
   }
   ```

7. Open `packages/orchestrator/src/orchestrator.ts`. Locate the `new OrchestratorServer(...)` call at line 236. Add a new option to the dependencies object:

   ```typescript
   this.server = new OrchestratorServer(this, config.server.port, {
     interactionQueue: this.interactionQueue,
     plansDir: path.resolve(config.workspace.root, '..', 'docs', 'plans'),
     pipeline: this.pipeline,
     analysisArchive: this.analysisArchive,
     roadmapPath: config.tracker.filePath ?? null,
     dispatchAdHoc: this.dispatchAdHoc.bind(this),
     getLocalModelStatus: () => this.localModelResolver?.getStatus() ?? null,
   });
   ```

8. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`. Expect zero errors.

9. Run: `harness validate`. Expect "validation passed".

10. Commit with message:

    ```
    feat(orchestrator): expose GET /api/v1/local-model/status route

    Wires LocalModelResolver.getStatus() through the orchestrator HTTP
    server via a new ServerDependencies callback. Returns 503 when no
    local backend is configured. SC17 acceptance test follows in Task 2.
    ```

---

### Task 2: Server route test — OT1, OT2 (SC17)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/server/routes/local-model.test.ts` (NEW)

**Skills:** `ts-testing-types` (reference)

This task adds the SC17 acceptance test by exercising the route handler directly through a one-off `http.createServer` (matching the pattern at `packages/orchestrator/tests/server/routes/sessions.test.ts:1-54`).

1. Create `packages/orchestrator/tests/server/routes/local-model.test.ts` with this exact content:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as http from 'node:http';
   import type { LocalModelStatus } from '@harness-engineering/types';
   import { handleLocalModelRoute } from '../../../src/server/routes/local-model';

   function createServer(getStatus: (() => LocalModelStatus | null) | null): http.Server {
     return http.createServer((req, res) => {
       if (!handleLocalModelRoute(req, res, getStatus)) {
         res.writeHead(404);
         res.end();
       }
     });
   }

   function request(
     server: http.Server,
     port: number,
     method: string,
     urlPath: string
   ): Promise<{ statusCode: number; body: unknown }> {
     return new Promise((resolve, reject) => {
       const req = http.request({ hostname: '127.0.0.1', port, path: urlPath, method }, (res) => {
         let data = '';
         res.on('data', (chunk) => (data += chunk));
         res.on('end', () => {
           let parsed: unknown;
           try {
             parsed = JSON.parse(data);
           } catch {
             parsed = data;
           }
           resolve({ statusCode: res.statusCode ?? 500, body: parsed });
         });
       });
       req.on('error', reject);
       req.end();
     });
   }

   const HEALTHY_STATUS: LocalModelStatus = {
     available: true,
     resolved: 'gemma-4-e4b',
     configured: ['gemma-4-e4b', 'qwen3:8b'],
     detected: ['gemma-4-e4b', 'qwen3:8b'],
     lastProbeAt: '2026-04-30T12:00:00.000Z',
     lastError: null,
     warnings: [],
   };

   const UNHEALTHY_STATUS: LocalModelStatus = {
     available: false,
     resolved: null,
     configured: ['bogus'],
     detected: [],
     lastProbeAt: '2026-04-30T12:00:00.000Z',
     lastError: 'fetch failed',
     warnings: ['No configured candidate is loaded.'],
   };

   describe('handleLocalModelRoute', () => {
     let server: http.Server;
     let port: number;

     async function listen(getStatus: (() => LocalModelStatus | null) | null): Promise<void> {
       server = createServer(getStatus);
       await new Promise<void>((resolve) => {
         server.listen(0, '127.0.0.1', () => {
           const addr = server.address();
           if (addr && typeof addr === 'object') port = addr.port;
           resolve();
         });
       });
     }

     afterEach(() => {
       server?.close();
     });

     it('returns 200 with LocalModelStatus when resolver has a snapshot (SC17 / OT1)', async () => {
       await listen(() => HEALTHY_STATUS);
       const res = await request(server, port, 'GET', '/api/v1/local-model/status');
       expect(res.statusCode).toBe(200);
       expect(res.body).toEqual(HEALTHY_STATUS);
     });

     it('returns 200 with unhealthy status (banner data) when not available', async () => {
       await listen(() => UNHEALTHY_STATUS);
       const res = await request(server, port, 'GET', '/api/v1/local-model/status');
       expect(res.statusCode).toBe(200);
       expect(res.body).toEqual(UNHEALTHY_STATUS);
     });

     it('returns 503 when getStatus is null (no local backend) (SC17 / OT2)', async () => {
       await listen(null);
       const res = await request(server, port, 'GET', '/api/v1/local-model/status');
       expect(res.statusCode).toBe(503);
       expect(res.body).toEqual({ error: 'Local backend not configured' });
     });

     it('returns 503 when getStatus returns null', async () => {
       await listen(() => null);
       const res = await request(server, port, 'GET', '/api/v1/local-model/status');
       expect(res.statusCode).toBe(503);
       expect(res.body).toEqual({ error: 'Local backend not configured' });
     });

     it('returns 405 for POST /api/v1/local-model/status', async () => {
       await listen(() => HEALTHY_STATUS);
       const res = await request(server, port, 'POST', '/api/v1/local-model/status');
       expect(res.statusCode).toBe(405);
       expect(res.body).toEqual({ error: 'Method not allowed' });
     });

     it('returns false (does not match) for unrelated paths', async () => {
       await listen(() => HEALTHY_STATUS);
       const res = await request(server, port, 'GET', '/api/v1/some-other-path');
       expect(res.statusCode).toBe(404);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run tests/server/routes/local-model.test.ts`. Expect 6/6 passing.

3. Run: `harness validate`. Expect pass.

4. Commit with message:

   ```
   test(orchestrator): cover GET /api/v1/local-model/status route (SC17)

   Verifies 200/503/405 responses and exact LocalModelStatus payload
   shape. Covers OT1, OT2 of Spec 1 Phase 4.
   ```

---

### Task 3: Server WebSocket broadcast test — OT3, OT4 (SC18)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/tests/server/local-model-broadcast.test.ts` (NEW)

**Skills:** `ts-testing-types` (reference)

This task asserts that `OrchestratorServer.broadcastLocalModelStatus()` actually delivers the payload over WebSocket to a connected client on `/ws`. Phase 3 wired this method to `broadcaster.broadcast('local-model:status', status)` (`packages/orchestrator/src/server/http.ts:180-184`); Phase 4 covers it with a real `ws` client end-to-end. The pattern matches `tests/server/http.test.ts:62-82`.

1. Create `packages/orchestrator/tests/server/local-model-broadcast.test.ts` with this exact content:

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach, type TestOptions } from 'vitest';
   import { EventEmitter } from 'node:events';
   import { WebSocket } from 'ws';
   import type { LocalModelStatus } from '@harness-engineering/types';
   import { OrchestratorServer } from '../../src/server/http';

   const RETRY: TestOptions = { retry: 2 };

   const STATUS_UNHEALTHY: LocalModelStatus = {
     available: false,
     resolved: null,
     configured: ['gemma-4-e4b'],
     detected: [],
     lastProbeAt: '2026-04-30T12:00:00.000Z',
     lastError: 'fetch failed',
     warnings: ['No configured candidate is loaded.'],
   };

   const STATUS_HEALTHY: LocalModelStatus = {
     ...STATUS_UNHEALTHY,
     available: true,
     resolved: 'gemma-4-e4b',
     detected: ['gemma-4-e4b'],
     lastError: null,
     warnings: [],
   };

   describe('OrchestratorServer.broadcastLocalModelStatus (SC18)', () => {
     let server: OrchestratorServer;
     let mockOrchestrator: EventEmitter & { getSnapshot: ReturnType<typeof vi.fn> };
     let port: number;

     beforeEach(() => {
       port = Math.floor(Math.random() * 10000) + 10000;
       mockOrchestrator = Object.assign(new EventEmitter(), {
         getSnapshot: vi.fn().mockReturnValue({ running: [], retryAttempts: [], claimed: [] }),
       });
       server = new OrchestratorServer(mockOrchestrator, port);
     });

     afterEach(async () => {
       server.stop();
       await new Promise((r) => setTimeout(r, 50));
     });

     it(
       'delivers a single local-model:status message to connected clients (OT3)',
       RETRY,
       async () => {
         await server.start();

         const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
         await new Promise<void>((r) => ws.on('open', r));

         const messages: string[] = [];
         ws.on('message', (data) => messages.push(data.toString()));

         // Drain the initial snapshot the broadcaster sends on connect.
         await new Promise((r) => setTimeout(r, 50));
         messages.length = 0;

         server.broadcastLocalModelStatus(STATUS_UNHEALTHY);
         await new Promise((r) => setTimeout(r, 100));

         expect(messages).toHaveLength(1);
         const parsed = JSON.parse(messages[0]) as { type: string; data: LocalModelStatus };
         expect(parsed.type).toBe('local-model:status');
         expect(parsed.data).toEqual(STATUS_UNHEALTHY);

         ws.close();
       }
     );

     it('delivers status flips as separate messages (OT4 — recovery)', RETRY, async () => {
       await server.start();

       const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
       await new Promise<void>((r) => ws.on('open', r));

       const messages: string[] = [];
       ws.on('message', (data) => messages.push(data.toString()));

       // Drain the initial snapshot.
       await new Promise((r) => setTimeout(r, 50));
       messages.length = 0;

       server.broadcastLocalModelStatus(STATUS_UNHEALTHY);
       server.broadcastLocalModelStatus(STATUS_HEALTHY);
       await new Promise((r) => setTimeout(r, 100));

       expect(messages).toHaveLength(2);
       const parsed = messages.map(
         (m) => JSON.parse(m) as { type: string; data: LocalModelStatus }
       );
       expect(parsed[0].type).toBe('local-model:status');
       expect(parsed[0].data.available).toBe(false);
       expect(parsed[1].type).toBe('local-model:status');
       expect(parsed[1].data.available).toBe(true);
       expect(parsed[1].data.resolved).toBe('gemma-4-e4b');

       ws.close();
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run tests/server/local-model-broadcast.test.ts`. Expect 2/2 passing.

3. Run: `harness validate`. Expect pass.

4. Commit with message:

   ```
   test(orchestrator): cover local-model:status WebSocket broadcast (SC18)

   Asserts OrchestratorServer.broadcastLocalModelStatus delivers the
   typed payload to connected /ws clients. Verifies both initial
   unavailable broadcast and the subsequent healthy flip. Covers OT3,
   OT4 of Spec 1 Phase 4.
   ```

---

### Task 4: Extend dashboard `WebSocketMessage` union with `local-model:status` variant

**Depends on:** Task 3 | **Files:** `packages/dashboard/src/client/types/orchestrator.ts`

**Skills:** `ts-type-guards` (reference)

This task widens the dashboard's discriminated union so `useOrchestratorSocket` and the new `useLocalModelStatus` hook both share a typed channel. No runtime behavior changes — `useOrchestratorSocket`'s switch statement already ignores unrecognized types via the implicit default branch (`packages/dashboard/src/client/hooks/useOrchestratorSocket.ts:79-99`).

1. Open `packages/dashboard/src/client/types/orchestrator.ts`. At the top of the file, add a new import alongside the existing imports (placement: after the file's existing imports, or at the top if there are none):

   ```typescript
   import type { LocalModelStatus } from '@harness-engineering/types';
   ```

2. Locate the `WebSocketMessage` discriminated union at lines 183-189. Add a new variant immediately before the closing `;`:

   ```typescript
   export type WebSocketMessage =
     | { type: 'state_change'; data: OrchestratorSnapshot }
     | { type: 'interaction_new'; data: PendingInteraction }
     | { type: 'agent_event'; data: AgentEventMessage }
     | { type: 'maintenance:started'; data: MaintenanceStartedPayload }
     | { type: 'maintenance:error'; data: MaintenanceErrorPayload }
     | { type: 'maintenance:completed'; data: MaintenanceCompletedPayload }
     | { type: 'local-model:status'; data: LocalModelStatus };
   ```

3. Re-export `LocalModelStatus` from this file for hook consumers (placement: directly under the new import):

   ```typescript
   export type { LocalModelStatus };
   ```

4. Run: `pnpm --filter @harness-engineering/dashboard typecheck`. Expect zero errors.

5. Run: `harness validate`. Expect pass.

6. Commit with message:

   ```
   feat(dashboard): extend WebSocketMessage with local-model:status variant

   Adds the discriminated-union variant for the orchestrator's
   local-model:status broadcast topic and re-exports LocalModelStatus
   for hook consumers. Phase 4 step 3 of local-model-fallback spec.
   ```

---

### Task 5: Implement `useLocalModelStatus()` hook

**Depends on:** Task 4 | **Files:** `packages/dashboard/src/client/hooks/useLocalModelStatus.ts` (NEW)

**Skills:** `ts-type-guards` (reference)

This task adds the React hook that powers the warning banner. The hook opens its own WebSocket connection (consistent with `useOrchestratorSocket`'s pattern) and filters for `type: 'local-model:status'` messages. On mount, it issues an HTTP `GET /api/v1/local-model/status` to seed the initial value before the WebSocket delivers its first event — this avoids a flash of "no banner" on page load when the resolver is already in an unhealthy state.

1. Create `packages/dashboard/src/client/hooks/useLocalModelStatus.ts` with this exact content:

   ```typescript
   import { useEffect, useRef, useState } from 'react';
   import type { LocalModelStatus, WebSocketMessage } from '../types/orchestrator';

   const RECONNECT_BASE_MS = 1_000;
   const RECONNECT_MAX_MS = 30_000;

   export interface UseLocalModelStatusResult {
     /** Latest LocalModelStatus snapshot, or null when not yet loaded. */
     status: LocalModelStatus | null;
     /** True until the first HTTP fallback resolves OR the first WebSocket event arrives. */
     loading: boolean;
     /** HTTP fallback error message, null when healthy. WebSocket errors do not surface here (the hook auto-reconnects). */
     error: string | null;
   }

   function getWsUrl(): string {
     const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
     return `${proto}//${window.location.host}/ws`;
   }

   /**
    * Subscribe to the orchestrator's `local-model:status` WebSocket topic.
    *
    * On mount, issues a single GET to /api/v1/local-model/status to seed the
    * initial value, then opens a WebSocket on /ws and listens for status
    * events. WebSocket-delivered values always supersede the HTTP fallback.
    *
    * The hook owns its own WebSocket; if the dashboard later consolidates
    * onto a shared connection store, this hook can be refactored to read
    * from that store instead.
    */
   export function useLocalModelStatus(): UseLocalModelStatusResult {
     const [status, setStatus] = useState<LocalModelStatus | null>(null);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState<string | null>(null);
     const wsRef = useRef<WebSocket | null>(null);
     const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
     const reconnectAttempt = useRef(0);

     // HTTP fallback for initial load.
     useEffect(() => {
       const controller = new AbortController();
       (async () => {
         try {
           const res = await fetch('/api/v1/local-model/status', { signal: controller.signal });
           if (res.status === 503) {
             // No local backend configured — leave status as null; banner will not render.
             setLoading(false);
             return;
           }
           if (!res.ok) {
             setError(`HTTP ${res.status}`);
             setLoading(false);
             return;
           }
           const json = (await res.json()) as LocalModelStatus;
           // Only seed if the WebSocket hasn't already populated state.
           setStatus((prev) => prev ?? json);
           setLoading(false);
         } catch (err) {
           if (controller.signal.aborted) return;
           setError(err instanceof Error ? err.message : 'Network error');
           setLoading(false);
         }
       })();
       return () => controller.abort();
     }, []);

     // WebSocket subscription.
     useEffect(() => {
       const mounted = { current: true };

       function connect(): void {
         const ws = new WebSocket(getWsUrl());
         wsRef.current = ws;

         ws.onopen = () => {
           if (mounted.current) reconnectAttempt.current = 0;
         };

         ws.onmessage = (event: MessageEvent<string>) => {
           if (!mounted.current) return;
           try {
             const raw: unknown = JSON.parse(event.data);
             if (typeof raw !== 'object' || raw === null || !('type' in raw)) return;
             const msg = raw as WebSocketMessage;
             if (msg.type === 'local-model:status') {
               setStatus(msg.data);
               setLoading(false);
             }
           } catch {
             // ignore malformed messages
           }
         };

         ws.onclose = () => {
           if (!mounted.current) return;
           const delay = Math.min(
             RECONNECT_BASE_MS * 2 ** reconnectAttempt.current,
             RECONNECT_MAX_MS
           );
           reconnectAttempt.current += 1;
           reconnectTimer.current = setTimeout(connect, delay);
         };

         ws.onerror = () => {
           // onclose fires after onerror; reconnect handled there.
         };
       }

       connect();

       return () => {
         mounted.current = false;
         wsRef.current?.close();
         if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
       };
     }, []);

     return { status, loading, error };
   }
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`. Expect zero errors.

3. Run: `harness validate`. Expect pass.

4. Commit with message:

   ```
   feat(dashboard): add useLocalModelStatus hook with HTTP fallback

   Subscribes to the orchestrator's local-model:status WebSocket topic
   and seeds initial state via GET /api/v1/local-model/status. Returns
   { status, loading, error } for banner consumers. Phase 4 step 4 of
   local-model-fallback spec.
   ```

---

### Task 6: Hook test — OT7 (banner self-clears on flip), OT8 (HTTP fallback)

**Depends on:** Task 5 | **Files:** `packages/dashboard/tests/client/hooks/useLocalModelStatus.test.ts` (NEW)

**Skills:** `ts-testing-types` (reference)

This task verifies the hook's two key behaviors: (a) the initial HTTP fallback populates `status` when the WebSocket has not yet delivered an event, and (b) a subsequent WebSocket event supersedes the fallback value. The flip test (OT7) is a pure hook-level assertion — the banner-level rendering test lives in Task 7.

1. Create `packages/dashboard/tests/client/hooks/useLocalModelStatus.test.ts` with this exact content:

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { renderHook, act, waitFor } from '@testing-library/react';
   import { useLocalModelStatus } from '../../../src/client/hooks/useLocalModelStatus';
   import type { LocalModelStatus } from '../../../src/client/types/orchestrator';

   class FakeWebSocket {
     static instance: FakeWebSocket | null = null;
     static OPEN = 1;
     static CLOSED = 3;

     url: string;
     readyState = FakeWebSocket.OPEN;
     onopen: (() => void) | null = null;
     onmessage: ((e: { data: string }) => void) | null = null;
     onclose: (() => void) | null = null;
     onerror: (() => void) | null = null;

     constructor(url: string) {
       this.url = url;
       FakeWebSocket.instance = this;
       setTimeout(() => this.onopen?.(), 0);
     }

     close(): void {
       this.readyState = FakeWebSocket.CLOSED;
     }

     simulateMessage(data: unknown): void {
       this.onmessage?.({ data: JSON.stringify(data) });
     }
   }

   const STATUS_UNHEALTHY: LocalModelStatus = {
     available: false,
     resolved: null,
     configured: ['gemma-4-e4b'],
     detected: [],
     lastProbeAt: '2026-04-30T12:00:00.000Z',
     lastError: 'fetch failed',
     warnings: ['No configured candidate is loaded.'],
   };

   const STATUS_HEALTHY: LocalModelStatus = {
     ...STATUS_UNHEALTHY,
     available: true,
     resolved: 'gemma-4-e4b',
     detected: ['gemma-4-e4b'],
     lastError: null,
     warnings: [],
   };

   beforeEach(() => {
     FakeWebSocket.instance = null;
     vi.stubGlobal('WebSocket', FakeWebSocket);
     vi.stubGlobal('window', {
       location: { protocol: 'http:', host: 'localhost:3700' },
     });
   });

   afterEach(() => {
     vi.unstubAllGlobals();
     vi.restoreAllMocks();
   });

   describe('useLocalModelStatus', () => {
     it('seeds initial status from HTTP GET when WebSocket has not delivered yet (OT8)', async () => {
       const fetchMock = vi.fn().mockResolvedValue({
         ok: true,
         status: 200,
         json: async () => STATUS_UNHEALTHY,
       });
       vi.stubGlobal('fetch', fetchMock);

       const { result } = renderHook(() => useLocalModelStatus());

       await waitFor(() => {
         expect(result.current.status).toEqual(STATUS_UNHEALTHY);
       });
       expect(fetchMock).toHaveBeenCalledWith(
         '/api/v1/local-model/status',
         expect.objectContaining({ signal: expect.anything() })
       );
       expect(fetchMock).toHaveBeenCalledTimes(1);
       expect(result.current.loading).toBe(false);
     });

     it('returns null status and clears loading when HTTP returns 503 (no local backend)', async () => {
       const fetchMock = vi.fn().mockResolvedValue({
         ok: false,
         status: 503,
         json: async () => ({ error: 'Local backend not configured' }),
       });
       vi.stubGlobal('fetch', fetchMock);

       const { result } = renderHook(() => useLocalModelStatus());

       await waitFor(() => {
         expect(result.current.loading).toBe(false);
       });
       expect(result.current.status).toBeNull();
       expect(result.current.error).toBeNull();
     });

     it('replaces HTTP-fallback value with the WebSocket-delivered value (OT7)', async () => {
       const fetchMock = vi.fn().mockResolvedValue({
         ok: true,
         status: 200,
         json: async () => STATUS_UNHEALTHY,
       });
       vi.stubGlobal('fetch', fetchMock);

       const { result } = renderHook(() => useLocalModelStatus());

       await waitFor(() => {
         expect(result.current.status?.available).toBe(false);
       });

       // Simulate a WebSocket flip to healthy.
       await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());
       act(() => {
         FakeWebSocket.instance!.simulateMessage({
           type: 'local-model:status',
           data: STATUS_HEALTHY,
         });
       });

       await waitFor(() => {
         expect(result.current.status?.available).toBe(true);
         expect(result.current.status?.resolved).toBe('gemma-4-e4b');
       });
     });

     it('ignores WebSocket messages of other types', async () => {
       const fetchMock = vi.fn().mockResolvedValue({
         ok: true,
         status: 200,
         json: async () => STATUS_UNHEALTHY,
       });
       vi.stubGlobal('fetch', fetchMock);

       const { result } = renderHook(() => useLocalModelStatus());
       await waitFor(() => expect(result.current.status?.available).toBe(false));
       await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());

       act(() => {
         FakeWebSocket.instance!.simulateMessage({ type: 'state_change', data: { running: [] } });
       });

       expect(result.current.status?.available).toBe(false); // unchanged
     });

     it('surfaces fetch errors via the error field', async () => {
       const fetchMock = vi.fn().mockRejectedValue(new Error('Network down'));
       vi.stubGlobal('fetch', fetchMock);

       const { result } = renderHook(() => useLocalModelStatus());

       await waitFor(() => {
         expect(result.current.error).toBe('Network down');
         expect(result.current.loading).toBe(false);
       });
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard vitest run tests/client/hooks/useLocalModelStatus.test.ts`. Expect 5/5 passing.

3. Run: `harness validate`. Expect pass.

4. Commit with message:

   ```
   test(dashboard): cover useLocalModelStatus hook (OT7, OT8)

   Verifies HTTP fallback seeds initial status, WebSocket events
   supersede the fallback, 503 responses leave status null, unrelated
   WebSocket messages are ignored, and fetch errors surface via the
   error field.
   ```

---

### Task 7: Banner component in `Orchestrator.tsx` + tests (OT5, OT6)

**Depends on:** Task 6 | **Files:** `packages/dashboard/src/client/pages/Orchestrator.tsx`, `packages/dashboard/tests/client/pages/Orchestrator.test.tsx`

This task adds the visible warning banner. Banner is rendered above the "Agent Monitor" header and reads `useLocalModelStatus()`. Visible only when `status.available === false`. Phase 4 component test mocks the hook directly (matches the existing `vi.mock('../../../src/client/hooks/useOrchestratorSocket', ...)` pattern in the same test file).

1. Open `packages/dashboard/src/client/pages/Orchestrator.tsx`. Add a new import after the existing `import { useRecentSessions } from '../hooks/useRecentSessions';` line (~line 4):

   ```typescript
   import { useLocalModelStatus } from '../hooks/useLocalModelStatus';
   import type { LocalModelStatus } from '../types/orchestrator';
   ```

2. Add a new component above the existing `function SectionHeader(...)` (~line 12), with this exact content:

   ```typescript
   function formatProbeTime(iso: string | null): string {
     if (!iso) return 'never';
     const date = new Date(iso);
     if (Number.isNaN(date.getTime())) return iso;
     return date.toLocaleString();
   }

   function LocalModelBanner({ status }: { status: LocalModelStatus }) {
     const detectedLabel =
       status.detected.length > 0 ? status.detected.join(', ') : 'none detected';
     return (
       <div
         role="alert"
         className="mb-6 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm"
       >
         <div className="flex items-start gap-3">
           <span className="mt-0.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full bg-red-500" />
           <div className="min-w-0 flex-1">
             <p className="font-semibold text-red-300">Local model unavailable</p>
             <p className="mt-1 text-red-200">
               No configured candidate is currently loaded on the local server. The intelligence
               pipeline and local agent dispatch are disabled until a candidate is loaded.
             </p>
             <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-red-200 sm:grid-cols-2">
               <div className="flex gap-2">
                 <dt className="text-red-400">Configured:</dt>
                 <dd className="font-mono">{status.configured.join(', ') || '(none)'}</dd>
               </div>
               <div className="flex gap-2">
                 <dt className="text-red-400">Detected:</dt>
                 <dd className="font-mono">{detectedLabel}</dd>
               </div>
               <div className="flex gap-2">
                 <dt className="text-red-400">Last probe:</dt>
                 <dd className="font-mono">{formatProbeTime(status.lastProbeAt)}</dd>
               </div>
               {status.lastError && (
                 <div className="flex gap-2">
                   <dt className="text-red-400">Last error:</dt>
                   <dd className="font-mono">{status.lastError}</dd>
                 </div>
               )}
             </dl>
           </div>
         </div>
       </div>
     );
   }
   ```

3. Locate the `Orchestrator` component (~line 561). Inside the function body, add a new line immediately after `const { snapshot, agentEvents, connected } = useOrchestratorSocket();`:

   ```typescript
   const { status: localModelStatus } = useLocalModelStatus();
   ```

4. In the early-return "no snapshot" branch (~lines 619-629), add the banner immediately after the `<h1>` (or above it, at the very top of the returned `<div>`):

   ```tsx
   if (!snapshot) {
     return (
       <div>
         {localModelStatus && !localModelStatus.available && (
           <LocalModelBanner status={localModelStatus} />
         )}
         <h1 className="mb-6 text-2xl font-bold">Agent Monitor</h1>
         {/* ...rest unchanged... */}
   ```

5. In the main return (~line 634, the `<div>` after the early return), add the banner at the very top of the returned tree, above the existing `<div className="mb-6 flex items-center justify-between">`:

   ```tsx
   return (
     <div>
       {localModelStatus && !localModelStatus.available && (
         <LocalModelBanner status={localModelStatus} />
       )}
       <div className="mb-6 flex items-center justify-between">
         {/* ...existing content unchanged... */}
   ```

6. Open `packages/dashboard/tests/client/pages/Orchestrator.test.tsx`. Add a new top-level mock immediately after the existing `vi.mock(...)` call (~line 19):

   ```typescript
   const mockLocalModelHook = {
     status: null as import('../../../src/client/types/orchestrator').LocalModelStatus | null,
     loading: false,
     error: null as string | null,
   };

   vi.mock('../../../src/client/hooks/useLocalModelStatus', () => ({
     useLocalModelStatus: () => mockLocalModelHook,
   }));
   ```

7. Extend the `beforeEach` block (~line 21) to reset the new mock state:

   ```typescript
   beforeEach(() => {
     mockHook.snapshot = null;
     mockHook.connected = false;
     mockLocalModelHook.status = null;
     mockLocalModelHook.loading = false;
     mockLocalModelHook.error = null;
   });
   ```

8. Add three new tests at the end of the `describe('Orchestrator (Agent Monitor) page', ...)` block (immediately before the final closing `});`):

   ```typescript
   it('renders LocalModelBanner when local model is unavailable (OT5 / SC19)', () => {
     mockHook.snapshot = makeSnapshot();
     mockHook.connected = true;
     mockLocalModelHook.status = {
       available: false,
       resolved: null,
       configured: ['gemma-4-e4b', 'qwen3:8b'],
       detected: [],
       lastProbeAt: '2026-04-30T12:00:00.000Z',
       lastError: 'fetch failed',
       warnings: ['No configured candidate is loaded.'],
     };
     render(
       <MemoryRouter>
         <Orchestrator />
       </MemoryRouter>
     );
     const banner = screen.getByRole('alert');
     expect(banner).toBeDefined();
     expect(banner.textContent).toContain('Local model unavailable');
     expect(banner.textContent).toContain('gemma-4-e4b');
     expect(banner.textContent).toContain('qwen3:8b');
     expect(banner.textContent).toContain('none detected');
     expect(banner.textContent).toContain('fetch failed');
   });

   it('does not render LocalModelBanner when status.available is true (OT6)', () => {
     mockHook.snapshot = makeSnapshot();
     mockHook.connected = true;
     mockLocalModelHook.status = {
       available: true,
       resolved: 'gemma-4-e4b',
       configured: ['gemma-4-e4b'],
       detected: ['gemma-4-e4b'],
       lastProbeAt: '2026-04-30T12:00:00.000Z',
       lastError: null,
       warnings: [],
     };
     render(
       <MemoryRouter>
         <Orchestrator />
       </MemoryRouter>
     );
     expect(screen.queryByRole('alert')).toBeNull();
   });

   it('does not render LocalModelBanner when status is null (no local backend)', () => {
     mockHook.snapshot = makeSnapshot();
     mockHook.connected = true;
     mockLocalModelHook.status = null;
     render(
       <MemoryRouter>
         <Orchestrator />
       </MemoryRouter>
     );
     expect(screen.queryByRole('alert')).toBeNull();
   });
   ```

9. Run: `pnpm --filter @harness-engineering/dashboard vitest run tests/client/pages/Orchestrator.test.tsx`. Expect all tests passing (existing + 3 new).

10. Run: `pnpm --filter @harness-engineering/dashboard typecheck`. Expect zero errors.

11. Run: `harness validate`. Expect pass.

12. Commit with message:

    ```
    feat(dashboard): add LocalModelBanner to Orchestrator page (SC19)

    Renders a warning banner above the Agent Monitor header when
    useLocalModelStatus reports available: false. Banner shows
    configured candidates, detected models, last probe time, and last
    error. Tests cover OT5, OT6 and the null-status (cloud-only) case.
    ```

---

### Task 8: Phase 4 exit gate — typecheck, lint, full test suite, validate, check-deps

**Depends on:** Task 7 | **Files:** none (verification only)

**Skills:** none

This task is the Phase 4 exit gate. Run all mechanical gates and confirm zero regressions before handing off to Phase 5 (documentation).

1. Run: `pnpm typecheck`. Expect zero errors across all packages.

2. Run: `pnpm lint`. Expect zero new errors. Pre-existing lint errors (if any) should be unchanged from the Phase 3 baseline.

3. Run: `pnpm test`. Expect the full repo test suite to pass, including the four new test files added in Phase 4 (`local-model.test.ts`, `local-model-broadcast.test.ts`, `useLocalModelStatus.test.ts`, the augmented `Orchestrator.test.tsx`).

4. Run: `harness validate`. Expect "validation passed".

5. Run: `harness check-deps`. Expect "validation passed".

6. Manual verification (proxy reachability — OT10):

   ```bash
   grep -n "/api/v1" packages/dashboard/src/server/orchestrator-proxy.ts
   grep -n "/api/v1" packages/dashboard/vite.config.ts
   ```

   Expect both files to already list `/api/v1` in their proxy tables. No file modifications needed.

7. Commit with message (only if any minor fixes were applied during the gate; if all gates passed cleanly with no follow-up edits, no commit is needed for this task — the previous commits stand):

   ```
   chore(spec1-phase4): confirm Phase 4 exit gates

   typecheck, lint, full test suite, harness validate, harness
   check-deps all pass. Proxy registrations confirmed unchanged
   (OT10). Ready for Phase 5 (documentation, ADRs, knowledge).
   ```

---

## Validation

**Phase 4 acceptance:**

- All 10 observable truths (OT1–OT10) pass.
- Spec 1 success criteria SC17, SC18, SC19, SC20 are observably met.
- Eight tasks committed (or seven, if Task 8 needed no follow-up commit).
- Phase 5 (documentation, ADRs, knowledge) and Phase 6 (validation gate, manual smoke) remain to deliver SC23, SC24–SC27.

**Concerns / known limitations (carry forward to handoff):**

- The new hook owns its own WebSocket connection rather than reusing `useOrchestratorSocket`'s. This is documented as a Phase 4 ASSUMPTION; consolidation onto a shared connection store is a separate refactor.
- The component-level test for OT7 (banner self-clears on flip) is a planning-time proxy for the spec's manual smoke test (SC20 manual validation in Phase 6). The manual smoke remains in Phase 6 scope.
- Banner copy is provisional and may be revised during Phase 5's documentation pass.
- Phase 3's `broadcastLocalModelStatus()` Phase-3-stub comment (`packages/orchestrator/src/server/http.ts:171-184`) can be updated in Phase 5 to remove the "stub" wording since Phase 4 now exercises it end-to-end with SC18 tests.
