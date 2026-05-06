# Plan: Spec 2 Phase 5 — Dashboard Surface (Multi-Local) (SC38–SC40)

**Date:** 2026-05-04 | **Spec:** `docs/changes/multi-backend-routing/proposal.md` (Phase 5 — autopilot index 4) | **Tasks:** 16 | **Time:** ~70 min | **Integration Tier:** medium | **Session:** `changes--multi-backend-routing--proposal`

## Goal

The dashboard sees per-backend local-model status. The orchestrator broadcasts and exposes one `NamedLocalModelStatus` entry per `local`/`pi` resolver via a new `GET /api/v1/local-models/status` array endpoint and a widened SSE `local-model:status` payload. The Orchestrator page renders one banner per unhealthy backend, each labeled with `backendName` and `endpoint`. The legacy singular endpoint `/api/v1/local-model/status` stays as a deprecated alias for one minor release (Spec 1 already shipped, so its consumers must keep working).

## Observable Truths (Acceptance Criteria)

1. **SC38** — `GET /api/v1/local-models/status` returns HTTP 200 with `NamedLocalModelStatus[]` (one entry per `type: 'local'|'pi'` backend in `agent.backends`). Each element has `backendName`, `endpoint`, plus the existing `LocalModelStatus` fields. With zero local backends configured the response is `200` with body `[]` (not 503; multi-status is "list of zero" rather than "no backend").
2. **SC39** — When any resolver's status changes, the orchestrator broadcasts on WebSocket topic `local-model:status` with payload `NamedLocalModelStatus` (single entry, the one that changed) carrying `backendName` and `endpoint`. Each resolver's listener emits independently (no fan-in / no aggregation).
3. **SC40** — Given a multi-local config with two unhealthy backends, the Orchestrator page (`packages/dashboard/src/client/pages/Orchestrator.tsx`) renders **two** `LocalModelBanner` components, one per `NamedLocalModelStatus` whose `available === false`, each banner labeled with the backend's `backendName` and `endpoint`.
4. **Legacy alias preserved** — `GET /api/v1/local-model/status` continues to work, returning the **first** resolver's `LocalModelStatus` (singular shape, no `backendName`/`endpoint`) for backwards compatibility with Spec 1 consumers. The existing `getLocalModelStatus` server callback (orchestrator.ts:377-383, "First-resolver compat" comment) is retained for this path.
5. **Hook rename** — `useLocalModelStatus()` is replaced by `useLocalModelStatuses()` returning `{ statuses: NamedLocalModelStatus[]; loading; error }` (plural). Standalone callers migrate; `useOrchestratorSocket` exposes `localModelStatuses: NamedLocalModelStatus[]` (an array, replacing today's single `localModelStatus`).
6. **Multi-status merge** — `useOrchestratorSocket`'s `localModelStatuses` reducer merges incoming `NamedLocalModelStatus` events by `backendName`: an event for `backendName: 'local'` replaces the existing `'local'` entry (if any) and preserves all other entries. New backend names append to the array.
7. **Dashboard test coverage** — `packages/dashboard/tests/client/pages/Orchestrator.test.tsx` covers (a) multi-banner rendering, (b) banner labels include `backendName` + `endpoint`, (c) zero-banner case when all backends healthy, (d) zero-banner case when `localModelStatuses` is empty.
8. **Server test coverage** — `packages/orchestrator/tests/server/routes/local-model.test.ts` covers (a) `/local-models/status` 200 + array shape, (b) empty array when zero local backends, (c) legacy `/local-model/status` still 200 with first-resolver `LocalModelStatus`, (d) 405 for non-GET on the new path.
9. **Mechanical** — `pnpm --filter @harness-engineering/orchestrator typecheck`, `pnpm --filter @harness-engineering/dashboard typecheck`, full test suite (~817 + dashboard suite + new tests below) all green; `harness validate` and `harness check-deps` pass. SC30 grep stays clean (Phase 2 invariant). SC41 state-machine.test.ts diff stays empty. The Phase 4 SC31–SC36 invariants remain green.

## Skills (from `docs/changes/multi-backend-routing/SKILLS.md`)

- `node-http-server` (reference) — Tasks 3–5 (route handler reuse and registration patterns).
- `ts-testing-types` (reference) — Tasks 1, 6, 11 (`NamedLocalModelStatus` shape assertions; React renderHook + DOM queries).
- `ts-type-guards` (reference) — Task 9 (discriminated WebSocket message narrowing in the dashboard hook).
- `astro-routing-pattern` (reference) — Tasks 3, 4 (HTTP path-and-method dispatch within the orchestrator's existing route table).

## Uncertainties

- **[ASSUMPTION]** Spec 1 has shipped (verified via `git log` — commit `ef9a0787` "docs(roadmap): mark local-model-fallback done"), so the singular `/api/v1/local-model/status` endpoint is in production. Per spec lines 35 and 498, "if release ordering shifts and Spec 1 ships standalone, the singular endpoint stays as a deprecated alias for one release" — that branch applies. Plan **keeps** the singular endpoint as a deprecated alias rather than removing it. The deprecation timeline (warn for one minor release, remove the next) follows D13.
- **[ASSUMPTION]** The SSE `local-model:status` topic is actually a WebSocket broadcast on the existing `/ws` channel (per the Phase 3 comment at `http.ts:182-184`, "the spec's 'SSE topic' wording is approximate"). Plan widens the WebSocket payload, not an SSE channel; no SSE dedicated infrastructure is added. Verified by reading `WebSocketBroadcaster.broadcast()` and the message-type union at `dashboard/src/client/types/orchestrator.ts:194`.
- **[ASSUMPTION]** Per-resolver broadcasts are already 1-per-resolver-event, not aggregated. The reducer in `useOrchestratorSocket` for `localModelStatuses` therefore merges by `backendName` (incoming → upsert by name). No "snapshot of all backends" event is needed; the dashboard reconstructs the full state from the seed HTTP GET plus delta-style WebSocket events. Matches today's single-backend pattern.
- **[ASSUMPTION]** The orchestrator's `NamedLocalModelStatus` shape (already declared at `packages/types/src/orchestrator.ts:512-517`) is the canonical contract — it extends `LocalModelStatus` with `backendName: string` and `endpoint: string`. No further type changes needed in `packages/types/`.
- **[ASSUMPTION]** `LocalModelResolver` does not currently expose its endpoint as a public getter (verified at `packages/orchestrator/src/agent/local-model-resolver.ts:101` — `private readonly endpoint`). The orchestrator threads endpoint into broadcast/HTTP payloads by reading from `this.config.agent.backends[name].endpoint` at call time, not by adding a getter on the resolver. Keeps the resolver API surface unchanged.
- **[ASSUMPTION]** The two-call site `getLocalModelStatus` in `orchestrator.ts:377-383` (server constructor option) stays for the legacy alias. A **new** server constructor option `getLocalModelStatuses: () => NamedLocalModelStatus[]` is added in parallel for the multi endpoint. Both callbacks are kept until the legacy alias is removed (out-of-scope: a follow-up spec will drop the singular path).
- **[ASSUMPTION]** The dashboard does not currently use SSE for status (verified — only WebSocket). Therefore "SSE topic" wording in the spec maps to the WebSocket broadcast topic; the plan does not add new SSE infrastructure.
- **[ASSUMPTION]** The Phase 3 stub broadcasting one resolver's status (orchestrator.ts:1565-1588) is the **only** producer of `local-model:status` events. Verified by `grep broadcastLocalModelStatus packages/orchestrator/src/`. So replacing that block fully migrates the broadcast path.
- **[DEFERRABLE]** Phase 5+ (post-this-phase) will likely remove the legacy singular endpoint; this phase keeps it. The spec's Phase 4 INTEGRATE notes flagged this; reading "this phase" as Phase 5 in spec section §5.
- **[DEFERRABLE]** P2-S1 (synthesized routing default `Object.keys(backends)[0]` non-obvious; emit info log) — does **not** intersect dashboard work and is not surfaced in the multi-status UI. Defer to Phase 6+.
- **[DEFERRABLE]** `docs/knowledge/orchestrator/issue-routing.md` describes single-backend dispatch — defer to Phase 6 (docs phase) per the carry-forward.
- **[DEFERRABLE]** P2-S5 (SC42 dispatch test asserts factory spy useCases, not session start) — does not intersect dashboard work; defer.

## File Map

```
MODIFY  packages/types/src/orchestrator.ts                                              (NamedLocalModelStatus already declared at 512-517; verify and re-export from index if not already)
MODIFY  packages/orchestrator/src/server/routes/local-model.ts                          (add handleLocalModelsRoute; keep handleLocalModelRoute as deprecated alias)
MODIFY  packages/orchestrator/tests/server/routes/local-model.test.ts                   (extend with /local-models/status SC38 + empty-array tests)
MODIFY  packages/orchestrator/src/server/http.ts                                        (add getLocalModelStatuses callback; widen broadcastLocalModelStatus signature; register new route)
MODIFY  packages/orchestrator/tests/server/local-model-broadcast.test.ts                (assert NamedLocalModelStatus payload SC39)
MODIFY  packages/orchestrator/src/orchestrator.ts                                       (subscribe per-resolver listeners; build NamedLocalModelStatus from each; supply getLocalModelStatuses callback; keep singular getLocalModelStatus for alias)
MODIFY  packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts     (extend OT-multi: 2 backends => 2 broadcasts each labeled w/ backendName+endpoint; OT existing single-backend path stays green)
MODIFY  packages/dashboard/src/client/types/orchestrator.ts                             (re-export NamedLocalModelStatus; widen WebSocketMessage local-model:status payload)
MODIFY  packages/dashboard/src/client/hooks/useOrchestratorSocket.ts                    (state localModelStatuses: NamedLocalModelStatus[]; merge-by-backendName reducer; replace localModelStatus exposure)
MODIFY  packages/dashboard/tests/client/hooks/useOrchestratorSocket.test.ts             (cover merge-by-backendName + multi-message coalesce SC39)
RENAME  packages/dashboard/src/client/hooks/useLocalModelStatus.ts -> useLocalModelStatuses.ts  (plural; HTTP GET /local-models/status; WebSocket merge-by-backendName)
RENAME  packages/dashboard/tests/client/hooks/useLocalModelStatus.test.ts -> useLocalModelStatuses.test.ts (plural; SC38 HTTP-seed + SC39 WebSocket)
MODIFY  packages/dashboard/src/client/pages/Orchestrator.tsx                            (render N banners; LocalModelBanner accepts NamedLocalModelStatus; banner label shows backendName+endpoint)
MODIFY  packages/dashboard/tests/client/pages/Orchestrator.test.tsx                     (multi-banner render SC40; backendName+endpoint label; zero-banner cases)
```

14 files (0 new, 12 modify, 2 rename). The new HTTP endpoint reuses the existing `local-model.ts` module (adds a sibling handler function rather than creating a new file). The dashboard hook rename is a 2-file move (source + test) with import-site updates.

**Integration tier: medium** — server-side public API surface change (new `/api/v1/local-models/status` endpoint), 14 files modified, public-export delta in `@harness-engineering/types` (re-export verification only — type already declared) and dashboard hook rename. No new package, no new skill, no new ADR — but the wiring + project updates trigger medium tier (per harness-planning Integration Tier Heuristics).

## Skeleton (proposed — pending APPROVE_PLAN)

1. Server: new `/api/v1/local-models/status` array endpoint + legacy alias preserved (~3 tasks, ~15 min) — _proposed_
2. Orchestrator: per-resolver broadcast (`NamedLocalModelStatus`) + multi-status callback (~3 tasks, ~14 min) — _proposed_
3. Dashboard hook: rename to `useLocalModelStatuses()`; merge-by-backendName reducer (~3 tasks, ~14 min) — _proposed_
4. Dashboard page: render N banners; label by `backendName` + `endpoint` (~2 tasks, ~10 min) — _proposed_
5. Integration tests: end-to-end SC38–SC40 multi-local broadcast (~2 tasks, ~10 min) — _proposed_
6. Verification gate: typecheck both packages, full test suite, harness validate, SC30 grep clean, SC41 diff empty (~1 task, ~3 min) — _proposed_
7. Phase exit: chore commit summarizing SC38–SC40 closure (~1 task, ~2 min) — _proposed_
8. Optional fallback: Re-export `NamedLocalModelStatus` from `packages/types/src/index.ts` if it's not already barrelled (folded into Task 1) — _proposed_

**Estimated total:** 16 tasks, ~70 min (close to but below the 20-task complexity-override threshold). Confirms **complexity: medium** per the spec annotation. 4 checkpoints (Tasks 3, 6, 12, 15) — well under the >6 threshold.

---

## Tasks

### Task 1: Verify `NamedLocalModelStatus` re-export from `@harness-engineering/types`

**Depends on:** none | **Files:** `packages/types/src/index.ts`, `packages/types/src/orchestrator.ts`

The `NamedLocalModelStatus` interface already exists at `packages/types/src/orchestrator.ts:512-517` (declared in Phase 0 alongside `BackendDef`, `RoutingConfig`). This task verifies it is barrelled out via `packages/types/src/index.ts` so `@harness-engineering/types` consumers can import it.

1. Run: `git grep -n "NamedLocalModelStatus" packages/types/src/`
2. If `packages/types/src/index.ts` exports `NamedLocalModelStatus`: skip to step 5.
3. If NOT exported, edit `packages/types/src/index.ts` to add a `NamedLocalModelStatus` re-export (alongside `LocalModelStatus`).
4. Run: `pnpm run generate:barrels` (per spec line 506, "Type barrel: `packages/types/src/index.ts` re-exports the new types. `pnpm run generate:barrels` regenerates").
5. Run: `pnpm --filter @harness-engineering/types typecheck`
6. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` and `pnpm --filter @harness-engineering/dashboard typecheck`
7. Run: `harness validate`
8. If any file changed (steps 3–4), commit: `chore(types): barrel NamedLocalModelStatus for downstream consumers (Spec 2 Phase 5)`. If steps 3–4 made no changes (already barrelled), no commit.

### Task 2: TDD — Server tests for `/api/v1/local-models/status` array endpoint (SC38)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/server/routes/local-model.test.ts`

Add a new `describe('handleLocalModelsRoute (plural — SC38)')` block alongside the existing `handleLocalModelRoute` block. Don't delete the existing tests — they cover the deprecated alias.

1. Read existing test patterns (the file uses `createServer(getStatus)`, `request(server, port, method, urlPath)`, and `HEALTHY_STATUS`/`UNHEALTHY_STATUS` fixtures).
2. Add at the top of the test file alongside the existing fixtures:

   ```typescript
   import type { NamedLocalModelStatus } from '@harness-engineering/types';
   import { handleLocalModelsRoute } from '../../../src/server/routes/local-model';

   const NAMED_HEALTHY: NamedLocalModelStatus = {
     ...HEALTHY_STATUS,
     backendName: 'local',
     endpoint: 'http://localhost:1234/v1',
   };
   const NAMED_UNHEALTHY: NamedLocalModelStatus = {
     ...UNHEALTHY_STATUS,
     backendName: 'pi-2',
     endpoint: 'http://192.168.1.50:1234/v1',
   };
   ```

3. Add a `createMultiServer(getStatuses)` helper mirroring `createServer` but wired to `handleLocalModelsRoute`:
   ```typescript
   function createMultiServer(getStatuses: (() => NamedLocalModelStatus[]) | null): http.Server {
     return http.createServer((req, res) => {
       if (!handleLocalModelsRoute(req, res, getStatuses)) {
         res.writeHead(404);
         res.end();
       }
     });
   }
   ```
4. Add test cases:

   ```typescript
   describe('handleLocalModelsRoute (plural — SC38)', () => {
     let server: http.Server;
     let port: number;

     async function listen(getStatuses: (() => NamedLocalModelStatus[]) | null): Promise<void> {
       server = createMultiServer(getStatuses);
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

     it('returns 200 with NamedLocalModelStatus[] when resolvers exist (SC38)', async () => {
       await listen(() => [NAMED_HEALTHY, NAMED_UNHEALTHY]);
       const res = await request(server, port, 'GET', '/api/v1/local-models/status');
       expect(res.statusCode).toBe(200);
       expect(res.body).toEqual([NAMED_HEALTHY, NAMED_UNHEALTHY]);
     });

     it('returns 200 with empty array when zero local backends configured', async () => {
       await listen(() => []);
       const res = await request(server, port, 'GET', '/api/v1/local-models/status');
       expect(res.statusCode).toBe(200);
       expect(res.body).toEqual([]);
     });

     it('returns 200 with empty array when getStatuses callback is null (no local backends path)', async () => {
       await listen(null);
       const res = await request(server, port, 'GET', '/api/v1/local-models/status');
       expect(res.statusCode).toBe(200);
       expect(res.body).toEqual([]);
     });

     it('returns 405 for POST /api/v1/local-models/status', async () => {
       await listen(() => [NAMED_HEALTHY]);
       const res = await request(server, port, 'POST', '/api/v1/local-models/status');
       expect(res.statusCode).toBe(405);
       expect(res.body).toEqual({ error: 'Method not allowed' });
     });

     it('returns false (does not match) for unrelated paths', async () => {
       await listen(() => [NAMED_HEALTHY]);
       const res = await request(server, port, 'GET', '/api/v1/some-other-path');
       expect(res.statusCode).toBe(404);
     });
   });
   ```

5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run packages/orchestrator/tests/server/routes/local-model.test.ts`
6. Observe **failure** — `handleLocalModelsRoute` does not yet exist (typecheck fail expected). Confirm the test file reads the import error as proof of TDD red phase.
7. Run: `harness validate`
8. Commit: `test(orchestrator): cover /api/v1/local-models/status array endpoint (Spec 2 SC38)`

### Task 3: Implement `handleLocalModelsRoute` (SC38) [checkpoint:human-verify]

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/server/routes/local-model.ts`

Add a sibling handler function next to `handleLocalModelRoute`. Keep the existing function unchanged (it remains the deprecated alias).

1. Edit `packages/orchestrator/src/server/routes/local-model.ts`. Add at the top with existing imports:
   ```typescript
   import type { LocalModelStatus, NamedLocalModelStatus } from '@harness-engineering/types';
   ```
2. After the existing `handleLocalModelRoute` function, append:

   ```typescript
   /**
    * Callback returning the latest NamedLocalModelStatus[] snapshot — one entry
    * per `local`/`pi` backend in `agent.backends`. Returns `[]` when no local
    * backends are configured (cloud-only orchestrator). Spec 2 SC38 — the
    * multi-local replacement for `getLocalModelStatus` (singular, retained as
    * deprecated alias).
    */
   export type GetLocalModelStatusesFn = () => NamedLocalModelStatus[];

   /**
    * Handles GET /api/v1/local-models/status (plural).
    *
    * - Returns 200 with NamedLocalModelStatus[] (possibly empty) when the
    *   orchestrator has registered the multi-status callback.
    * - Returns 200 with [] when getStatuses is null (no local backends — same
    *   shape as zero-resolver output, so dashboards render no banners).
    * - Returns 405 for non-GET methods.
    *
    * Returns true if the route matched, false otherwise.
    */
   export function handleLocalModelsRoute(
     req: IncomingMessage,
     res: ServerResponse,
     getStatuses: GetLocalModelStatusesFn | null
   ): boolean {
     const { method, url } = req;
     if (url !== '/api/v1/local-models/status') return false;

     if (method !== 'GET') {
       sendJSON(res, 405, { error: 'Method not allowed' });
       return true;
     }

     const statuses = getStatuses ? getStatuses() : [];
     sendJSON(res, 200, statuses);
     return true;
   }
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator vitest run packages/orchestrator/tests/server/routes/local-model.test.ts`
4. Observe **pass** for both `handleLocalModelRoute` (existing — unchanged behavior) and the new `handleLocalModelsRoute` block.
5. Verify the legacy singular endpoint test cases still pass — that's the deprecated-alias guarantee.
6. Run: `harness validate`
7. **[checkpoint:human-verify]** — pause for review. Show the diff to the operator: confirm the legacy `handleLocalModelRoute` was untouched and the new `handleLocalModelsRoute` reads `[]` when callback is null (matches the empty-config path).
8. Commit: `feat(orchestrator): add /api/v1/local-models/status array endpoint (Spec 2 SC38)`

### Task 4: TDD — Server `local-model-broadcast.test.ts` extension for `NamedLocalModelStatus` (SC39)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/tests/server/local-model-broadcast.test.ts`

The existing tests (lines 28–97) assert `LocalModelStatus` payloads. SC39 widens the broadcast payload to `NamedLocalModelStatus`. Update fixtures and add a multi-event test.

1. Add at the top of the file alongside existing imports:
   ```typescript
   import type { NamedLocalModelStatus } from '@harness-engineering/types';
   ```
2. Add new fixtures alongside `STATUS_HEALTHY`/`STATUS_UNHEALTHY`:
   ```typescript
   const NAMED_UNHEALTHY: NamedLocalModelStatus = {
     ...STATUS_UNHEALTHY,
     backendName: 'local',
     endpoint: 'http://localhost:1234/v1',
   };
   const NAMED_UNHEALTHY_PI2: NamedLocalModelStatus = {
     ...STATUS_UNHEALTHY,
     backendName: 'pi-2',
     endpoint: 'http://192.168.1.50:1234/v1',
   };
   ```
3. Update both existing tests' assertions: change `expect(parsed.data).toEqual(STATUS_UNHEALTHY)` to `expect(parsed.data).toEqual(NAMED_UNHEALTHY)` and pass `NAMED_UNHEALTHY` to `broadcastLocalModelStatus`. The existing `STATUS_HEALTHY` flip becomes `{ ...NAMED_UNHEALTHY, available: true, resolved: 'gemma-4-e4b', detected: ['gemma-4-e4b'], lastError: null, warnings: [] }`.
4. Add a third test:

   ```typescript
   it(
     'delivers per-resolver events tagged with backendName+endpoint (SC39 multi-local)',
     RETRY,
     async () => {
       await server.start();
       const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
       await new Promise<void>((r) => ws.on('open', r));
       const messages: string[] = [];
       ws.on('message', (data) => messages.push(data.toString()));
       await new Promise((r) => setTimeout(r, 50));
       messages.length = 0;

       server.broadcastLocalModelStatus(NAMED_UNHEALTHY);
       server.broadcastLocalModelStatus(NAMED_UNHEALTHY_PI2);
       await new Promise((r) => setTimeout(r, 100));

       expect(messages).toHaveLength(2);
       const parsed = messages.map(
         (m) => JSON.parse(m) as { type: string; data: NamedLocalModelStatus }
       );
       expect(parsed[0].data.backendName).toBe('local');
       expect(parsed[0].data.endpoint).toBe('http://localhost:1234/v1');
       expect(parsed[1].data.backendName).toBe('pi-2');
       expect(parsed[1].data.endpoint).toBe('http://192.168.1.50:1234/v1');
       ws.close();
     }
   );
   ```

5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run packages/orchestrator/tests/server/local-model-broadcast.test.ts`
6. Observe **failure** — `broadcastLocalModelStatus` signature still accepts only `LocalModelStatus`, so passing `NamedLocalModelStatus` either typechecks via subtype (likely passes typecheck) but fails the assertion that the message data has `backendName` (because the stub broadcaster passes through the full payload — actually let me re-check). The actual failure mode: the **payload assertion** that `data.backendName === 'local'` fails because the test passes `NAMED_UNHEALTHY` but the current broadcast accepts `LocalModelStatus`-typed param — TypeScript widens `data` to whatever was passed. So the failure is the typecheck on the function signature import + the `parsed.data.backendName` runtime assertion. Confirm both fail before proceeding to Task 5.
7. Run: `harness validate`
8. Commit: `test(orchestrator): extend broadcast tests to NamedLocalModelStatus (Spec 2 SC39)`

### Task 5: Widen `broadcastLocalModelStatus` signature; update server callback shape (SC39)

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/server/http.ts`

1. Edit `packages/orchestrator/src/server/http.ts`. Update imports:
   ```typescript
   import { handleLocalModelRoute, handleLocalModelsRoute } from './routes/local-model';
   import type { GetLocalModelStatusFn, GetLocalModelStatusesFn } from './routes/local-model';
   ```
2. In `ServerDependencies` interface, add a sibling field after `getLocalModelStatus`:
   ```typescript
   /** Callback returning all local backends' statuses, one entry per resolver. Spec 2 SC38. */
   getLocalModelStatuses?: GetLocalModelStatusesFn;
   ```
3. In the `OrchestratorServer` class, add a sibling field next to `getLocalModelStatus`:
   ```typescript
   private getLocalModelStatuses: GetLocalModelStatusesFn | null = null;
   ```
4. In `initDependencies`, wire up the new callback:
   ```typescript
   this.getLocalModelStatuses = deps?.getLocalModelStatuses ?? null;
   ```
5. Replace the `broadcastLocalModelStatus` method signature and body:
   ```typescript
   public broadcastLocalModelStatus(
     status: import('@harness-engineering/types').NamedLocalModelStatus
   ): void {
     this.broadcaster.broadcast('local-model:status', status);
   }
   ```
   Update the JSDoc: replace the "Phase 4 widens the payload for multi-local backends" sentence with "Phase 5 widens the payload to `NamedLocalModelStatus` (with `backendName` + `endpoint`); the channel and bind-before-probe ordering are unchanged."
6. In `handleApiRoutes`, register the new route immediately after the existing local-model route block:
   ```typescript
   // Local-models multi-status route (Spec 2 SC38)
   if (handleLocalModelsRoute(req, res, this.getLocalModelStatuses)) {
     return true;
   }
   ```
7. Run: `pnpm --filter @harness-engineering/orchestrator vitest run packages/orchestrator/tests/server/local-model-broadcast.test.ts packages/orchestrator/tests/server/routes/local-model.test.ts`
8. Observe **pass** for all assertions, including the new SC39 multi-event test.
9. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
10. Run: `harness validate`
11. Commit: `feat(orchestrator): widen broadcast payload to NamedLocalModelStatus + register /local-models/status (Spec 2 SC38, SC39)`

### Task 6: TDD — Orchestrator integration test for per-resolver multi-broadcast (SC39, SC40 server-side)

**Depends on:** Task 5 | **Files:** `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`

The existing test file covers single-resolver lifecycle. Extend it (don't replace) with a multi-resolver test that exercises the orchestrator's per-resolver broadcast wiring.

1. Read the existing single-resolver test pattern to mirror: stub `LocalModelResolver` via `fetchModels` injection, observe `broadcastLocalModelStatus` calls via a server stub.
2. Add a new `describe('multi-resolver broadcast (SC39, SC40 server-side)')` block:

   ```typescript
   describe('multi-resolver broadcast (Spec 2 Phase 5 — SC39, SC40 server-side)', () => {
     it('broadcasts NamedLocalModelStatus per-resolver, each tagged with backendName+endpoint', async () => {
       // Build a config with two local backends. Stub fetchModels so resolver
       // 'local-a' is unhealthy (returns []) and 'local-b' is healthy
       // (returns ['gemma-4-e4b']).
       // Spy on server.broadcastLocalModelStatus.
       // Start orchestrator; assert two broadcasts, one per backend, with
       // distinct backendName+endpoint payloads.
     });

     it('exposes /api/v1/local-models/status callback returning both backends', async () => {
       // Build the same 2-backend config. Hit the registered
       // getLocalModelStatuses callback (via server constructor option spy
       // or via HTTP request). Assert the array has 2 entries with the
       // right backendName+endpoint pairs.
     });
   });
   ```

3. Implement the test bodies using the existing test helpers (the file already has WorkflowConfig builders; reuse them — pattern-match how the single-resolver test injects backends).
4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`
5. Observe **failure** — the orchestrator currently subscribes only the first resolver's listener (orchestrator.ts:1571–1580) and only supplies `getLocalModelStatus` (singular). Both broadcast count and the `/local-models/status` callback fail.
6. Run: `harness validate`
7. Commit: `test(orchestrator): integration tests for per-resolver multi-broadcast (Spec 2 SC39, SC40)`

### Task 7: Subscribe per-resolver listeners; build `NamedLocalModelStatus` (SC39 producer side)

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/orchestrator.ts`

Replace the first-resolver-only subscription stub at orchestrator.ts:1565-1588 with per-resolver subscription. Each listener attaches `backendName` + `endpoint` from the config map.

1. Locate the existing block in `initLocalModelAndPipeline` (around lines 1565-1588). The "First-resolver broadcast (legacy single-banner UX)" comment is the marker.
2. Replace the entire `if (this.localResolvers.size > 0)` branch with:
   ```typescript
   if (this.localResolvers.size > 0) {
     // Spec 2 Phase 5 (SC39): subscribe each resolver independently. Each
     // listener tags its broadcast with the resolver's backendName +
     // endpoint, producing a NamedLocalModelStatus payload. Multi-banner
     // dashboards (SC40) reconstruct a per-name map from these per-resolver
     // events; the legacy single-banner consumer reads
     // `getLocalModelStatus` (first-resolver) via the deprecated singular
     // endpoint.
     const backends = this.config.agent.backends ?? {};
     for (const [name, resolver] of this.localResolvers) {
       const def = backends[name];
       // Defensive: a resolver in the Map without a corresponding backend
       // def is a contract violation — skip but log. (The Map is built
       // FROM backends, so this should not fire.)
       if (!def || (def.type !== 'local' && def.type !== 'pi')) {
         this.logger.warn('Resolver without matching backend def — broadcast skipped', { name });
         continue;
       }
       const endpoint = def.endpoint;
       const unsubscribe = resolver.onStatusChange((status) => {
         const named: NamedLocalModelStatus = {
           ...status,
           backendName: name,
           endpoint,
         };
         this.server?.broadcastLocalModelStatus(named);
       });
       // Track the unsubscribe in a list (replaces the singular field).
       this.localModelStatusUnsubscribes.push(unsubscribe);
     }
     // Probe each resolver independently — SC37.
     for (const resolver of this.localResolvers.values()) {
       await resolver.start();
     }
   }
   ```
3. Replace the singular field declaration:
   ```typescript
   // OLD: private localModelStatusUnsubscribe: (() => void) | null = null;
   // NEW:
   private localModelStatusUnsubscribes: Array<() => void> = [];
   ```
4. Search for any reference to `this.localModelStatusUnsubscribe` (singular) in the file. If it appears in a `stop()` method, replace with iteration:
   ```typescript
   for (const unsub of this.localModelStatusUnsubscribes) unsub();
   this.localModelStatusUnsubscribes = [];
   ```
5. Add a `NamedLocalModelStatus` import at the top of `orchestrator.ts`:
   ```typescript
   import type { NamedLocalModelStatus } from '@harness-engineering/types';
   ```
   (or extend the existing `@harness-engineering/types` import if grouped).
6. Run: `pnpm --filter @harness-engineering/orchestrator vitest run packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts packages/orchestrator/tests/server/local-model-broadcast.test.ts`
7. Observe **pass** for the per-resolver broadcast multi-event assertion (Task 6's first test).
8. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
9. Run: `harness validate`
10. Commit: `feat(orchestrator): per-resolver NamedLocalModelStatus broadcast (Spec 2 SC39)`

### Task 8: Supply `getLocalModelStatuses` callback to the server constructor (SC38 producer side)

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/orchestrator.ts`

The `OrchestratorServer` is constructed at orchestrator.ts:370-384 with `getLocalModelStatus` (singular). Add the `getLocalModelStatuses` (plural) callback alongside.

1. In the `new OrchestratorServer(...)` call, add the `getLocalModelStatuses` field next to the existing `getLocalModelStatus`:
   ```typescript
   getLocalModelStatuses: () => {
     // SC38: build NamedLocalModelStatus[] from each registered resolver,
     // tagged with its backendName + endpoint from the config.
     const backends = this.config.agent.backends ?? {};
     const out: NamedLocalModelStatus[] = [];
     for (const [name, resolver] of this.localResolvers) {
       const def = backends[name];
       if (!def || (def.type !== 'local' && def.type !== 'pi')) continue;
       out.push({
         ...resolver.getStatus(),
         backendName: name,
         endpoint: def.endpoint,
       });
     }
     return out;
   },
   ```
2. Update the existing `getLocalModelStatus` (singular) JSDoc-comment in-place (lines 378-382): keep the "First-resolver compat" wording but mark it explicitly as deprecated:
   ```typescript
   getLocalModelStatus: () => {
     // Deprecated alias for /api/v1/local-model/status (Spec 1 endpoint
     // retained as a compat shim per spec line 35; superseded by
     // getLocalModelStatuses for the multi-local UI). Returns the
     // first-registered resolver's status.
     const first = this.localResolvers.values().next();
     return first.done ? null : first.value.getStatus();
   },
   ```
3. Run: `pnpm --filter @harness-engineering/orchestrator vitest run packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`
4. Observe **pass** for Task 6's second test (the `/local-models/status` callback returns both backends).
5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): wire getLocalModelStatuses callback for multi-status endpoint (Spec 2 SC38)`

### Task 9: TDD — Dashboard `useOrchestratorSocket` merge-by-backendName reducer test (SC39 consumer side)

**Depends on:** Task 8 | **Files:** `packages/dashboard/tests/client/hooks/useOrchestratorSocket.test.ts`

The existing socket-hook test covers single-status delivery. Add a new block covering the multi-status array reducer.

1. Read the existing test pattern: a `FakeWebSocket` is registered, `simulateMessage()` triggers WebSocket events, and the hook return value is read via `result.current`.
2. Update existing `localModelStatus` assertions to reference `localModelStatuses` (plural). The previous `localModelStatus: LocalModelStatus | null` shape becomes `localModelStatuses: NamedLocalModelStatus[]`.
3. Add a new `describe('localModelStatuses (multi-local — Spec 2 SC39)')` block:

   ```typescript
   describe('localModelStatuses merge-by-backendName (Spec 2 SC39)', () => {
     it('appends a new backend on first event', async () => {
       // Render hook; simulate one local-model:status event for backendName='local'.
       // Assert localModelStatuses.length === 1 and [0].backendName === 'local'.
     });

     it('merges by backendName (re-emit replaces in place; preserves other entries)', async () => {
       // Simulate event for 'local' (unhealthy), then event for 'pi-2' (unhealthy),
       // then event for 'local' (healthy). Assert array length === 2; the 'local'
       // entry is now healthy; the 'pi-2' entry is unchanged and still in the array.
     });

     it('preserves event order: first-seen backend stays at index 0', async () => {
       // Simulate 'local' then 'pi-2'. After both events, expect
       // localModelStatuses[0].backendName === 'local' and [1].backendName === 'pi-2'.
     });

     it('initial state is empty array, not null', async () => {
       // Render hook with no events. Assert localModelStatuses === [].
     });
   });
   ```

4. Run: `pnpm --filter @harness-engineering/dashboard vitest run packages/dashboard/tests/client/hooks/useOrchestratorSocket.test.ts`
5. Observe **failure** — `localModelStatuses` (plural) is not yet exposed; the existing hook returns `localModelStatus` (singular).
6. Run: `harness validate`
7. Commit: `test(dashboard): cover localModelStatuses merge-by-backendName reducer (Spec 2 SC39)`

### Task 10: Update `useOrchestratorSocket` to track `localModelStatuses: NamedLocalModelStatus[]`

**Depends on:** Task 9 | **Files:** `packages/dashboard/src/client/hooks/useOrchestratorSocket.ts`, `packages/dashboard/src/client/types/orchestrator.ts`

1. First widen the WebSocket message type. Edit `packages/dashboard/src/client/types/orchestrator.ts`:
   - Update the `LocalModelStatus` import:
     ```typescript
     import type { LocalModelStatus, NamedLocalModelStatus } from '@harness-engineering/types';
     export type { LocalModelStatus, NamedLocalModelStatus };
     ```
   - Update the `WebSocketMessage` union member from `LocalModelStatus` to `NamedLocalModelStatus`:
     ```typescript
     | { type: 'local-model:status'; data: NamedLocalModelStatus };
     ```
2. Edit `packages/dashboard/src/client/hooks/useOrchestratorSocket.ts`:
   - Update import: replace `LocalModelStatus` with `NamedLocalModelStatus` (or add it alongside if `LocalModelStatus` is still used).
   - Update `OrchestratorSocketState` interface:
     ```typescript
     /** Per-backend local-model statuses, merged by backendName. Empty until first event. */
     localModelStatuses: NamedLocalModelStatus[];
     ```
     (Remove the singular `localModelStatus` field.)
   - Replace the `setLocalModelStatus` `useState<LocalModelStatus | null>` with:
     ```typescript
     const [localModelStatuses, setLocalModelStatuses] = useState<NamedLocalModelStatus[]>([]);
     ```
   - Update `MessageHandlers`: rename `setLocalModelStatus` to `setLocalModelStatuses` with type `React.Dispatch<React.SetStateAction<NamedLocalModelStatus[]>>`.
   - Replace the `case 'local-model:status':` block in `handleMessage`:
     ```typescript
     case 'local-model:status':
       handlers.setLocalModelStatuses((prev) => {
         const idx = prev.findIndex((s) => s.backendName === msg.data.backendName);
         if (idx === -1) return [...prev, msg.data];
         const next = prev.slice();
         next[idx] = msg.data;
         return next;
       });
       break;
     ```
   - Update the returned object: `localModelStatuses` (plural) replaces `localModelStatus`.
3. Run: `pnpm --filter @harness-engineering/dashboard vitest run packages/dashboard/tests/client/hooks/useOrchestratorSocket.test.ts`
4. Observe **pass** for the new multi-status tests (Task 9). The pre-existing tests in this file referencing `localModelStatus` (singular) will fail — fix them to read from `localModelStatuses[0]` (or the appropriate backend entry).
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`. Other consumers of `useOrchestratorSocket` will fail (Orchestrator.tsx). Note them — Task 12 fixes them. The compile error is expected.
6. Run: `harness validate`
7. Commit: `feat(dashboard): expose localModelStatuses[] merge-by-backendName from useOrchestratorSocket (Spec 2 SC39)`

### Task 11: Rename `useLocalModelStatus.ts` → `useLocalModelStatuses.ts`; widen to multi-status

**Depends on:** Task 10 | **Files:** `packages/dashboard/src/client/hooks/useLocalModelStatus.ts` → `useLocalModelStatuses.ts`, `packages/dashboard/tests/client/hooks/useLocalModelStatus.test.ts` → `useLocalModelStatuses.test.ts`

1. Run: `git mv packages/dashboard/src/client/hooks/useLocalModelStatus.ts packages/dashboard/src/client/hooks/useLocalModelStatuses.ts`
2. Run: `git mv packages/dashboard/tests/client/hooks/useLocalModelStatus.test.ts packages/dashboard/tests/client/hooks/useLocalModelStatuses.test.ts`
3. Edit `useLocalModelStatuses.ts`:
   - Rename the function: `useLocalModelStatus` → `useLocalModelStatuses`.
   - Rename the result interface: `UseLocalModelStatusResult` → `UseLocalModelStatusesResult`. Update the `status: LocalModelStatus | null` field to `statuses: NamedLocalModelStatus[]` (initial value `[]`).
   - Update HTTP fetch: `fetch('/api/v1/local-model/status', ...)` → `fetch('/api/v1/local-models/status', ...)`. Drop the 503-special-case (the multi endpoint always returns 200 with `[]` when no backends — no 503 path).
   - The HTTP body type becomes `NamedLocalModelStatus[]`. Seed the array via `setStatuses((prev) => prev.length === 0 ? json : prev)`.
   - Update the WebSocket merge logic to mirror Task 10's reducer (merge-by-backendName).
   - Update JSDoc to reference Spec 2's `useLocalModelStatuses` and the `/local-models/status` endpoint.
4. Edit `useLocalModelStatuses.test.ts`:
   - Update imports: `useLocalModelStatus` → `useLocalModelStatuses`, `LocalModelStatus` → `NamedLocalModelStatus`.
   - Update fixtures: `STATUS_UNHEALTHY` → tagged with `backendName: 'local'` and `endpoint: 'http://localhost:1234/v1'`. Same for `STATUS_HEALTHY`.
   - Update HTTP-mock URL assertion from `/api/v1/local-model/status` to `/api/v1/local-models/status`.
   - Update HTTP-mock `json: async () => STATUS_UNHEALTHY` to `json: async () => [STATUS_UNHEALTHY]` (array shape).
   - Update result reads: `result.current.status` → `result.current.statuses[0]`.
   - Drop the "503 returns null status" test (no 503 path on the new endpoint); replace with an "empty array seeds zero entries" test.
   - Add a "merge-by-backendName WebSocket update" test (mirror Task 9's reducer assertions but on the standalone hook).
5. Run: `pnpm --filter @harness-engineering/dashboard vitest run packages/dashboard/tests/client/hooks/useLocalModelStatuses.test.ts`
6. Observe **pass** for all tests including the new merge-by-backendName test.
7. Run: `pnpm --filter @harness-engineering/dashboard typecheck`. Imports of `useLocalModelStatus` elsewhere will fail compilation. Task 12 (next) updates Orchestrator.tsx; if any other consumers exist, fix them in this task to match.
   - Run: `git grep -n "useLocalModelStatus" packages/dashboard/src/`. Update any imports to the new name. If only Orchestrator.tsx references the old name, defer to Task 12.
8. Run: `harness validate`
9. Commit: `refactor(dashboard): rename useLocalModelStatus → useLocalModelStatuses; consume /local-models/status (Spec 2 SC38, SC39)`

### Task 12: TDD — Orchestrator page multi-banner test (SC40) [checkpoint:human-verify]

**Depends on:** Task 11 | **Files:** `packages/dashboard/tests/client/pages/Orchestrator.test.tsx`

Update existing tests + add multi-banner cases.

1. Update the mock-hook surface at the top of the file:
   ```typescript
   localModelStatuses: [] as import('../../../src/client/types/orchestrator').NamedLocalModelStatus[],
   ```
   (Remove the old `localModelStatus` field. Update `beforeEach` to reset `localModelStatuses = []`.)
2. Update the existing three banner tests:
   - `'renders LocalModelBanner when local model is unavailable (OT5 / SC19)'`: change `mockHook.localModelStatus = { ... }` to `mockHook.localModelStatuses = [{ ...status, backendName: 'local', endpoint: 'http://localhost:1234/v1' }]`. Update assertion to also check the banner's text contains `'local'` (the backend name) and `'http://localhost:1234/v1'` (the endpoint).
   - `'does not render LocalModelBanner when status.available is true (OT6)'`: change to `localModelStatuses = [{ ...healthyStatus, backendName: 'local', endpoint: 'http://localhost:1234/v1' }]`. Banner still must not render.
   - `'does not render LocalModelBanner when status is null (no local backend)'`: rename to `'does not render LocalModelBanner when localModelStatuses is empty'`; set `localModelStatuses = []`.
3. Add new multi-banner tests:

   ```typescript
   it('renders one banner per unhealthy backend (SC40)', () => {
     mockHook.snapshot = makeSnapshot();
     mockHook.connected = true;
     mockHook.localModelStatuses = [
       { ...UNHEALTHY_BASE, backendName: 'local-a', endpoint: 'http://localhost:1234/v1' },
       { ...UNHEALTHY_BASE, backendName: 'pi-2', endpoint: 'http://192.168.1.50:1234/v1' },
     ];
     render(<MemoryRouter><Orchestrator /></MemoryRouter>);
     const banners = screen.getAllByRole('alert');
     expect(banners).toHaveLength(2);
     expect(banners[0].textContent).toContain('local-a');
     expect(banners[0].textContent).toContain('http://localhost:1234/v1');
     expect(banners[1].textContent).toContain('pi-2');
     expect(banners[1].textContent).toContain('http://192.168.1.50:1234/v1');
   });

   it('renders only banners for unhealthy backends (mixed health) (SC40)', () => {
     mockHook.snapshot = makeSnapshot();
     mockHook.connected = true;
     mockHook.localModelStatuses = [
       { ...UNHEALTHY_BASE, backendName: 'local-a', endpoint: 'http://localhost:1234/v1' },
       { ...HEALTHY_BASE, backendName: 'pi-2', endpoint: 'http://192.168.1.50:1234/v1' },
     ];
     render(<MemoryRouter><Orchestrator /></MemoryRouter>);
     const banners = screen.getAllByRole('alert');
     expect(banners).toHaveLength(1);
     expect(banners[0].textContent).toContain('local-a');
     expect(banners[0].textContent).not.toContain('pi-2');
   });
   ```

   Hoist `UNHEALTHY_BASE` and `HEALTHY_BASE` (sans `backendName`/`endpoint`) as module-level constants.

4. Run: `pnpm --filter @harness-engineering/dashboard vitest run packages/dashboard/tests/client/pages/Orchestrator.test.tsx`
5. Observe **failure** — Orchestrator.tsx still reads `localModelStatus` (singular) and renders one banner.
6. Run: `harness validate`
7. **[checkpoint:human-verify]** — pause for review. Show the test diff and confirm the banner-per-backend rendering shape matches the operator's expectation (separate banners vs. a unified panel). Spec line 464 mandates "one banner per unhealthy backend" — match it.
8. Commit: `test(dashboard): cover Orchestrator multi-banner rendering (Spec 2 SC40)`

### Task 13: Update `Orchestrator.tsx` to render N banners (SC40)

**Depends on:** Task 12 | **Files:** `packages/dashboard/src/client/pages/Orchestrator.tsx`

1. Replace the import: `LocalModelStatus` → `NamedLocalModelStatus`.
2. Update the `LocalModelBanner` component signature:
   ```typescript
   function LocalModelBanner({ status }: { status: NamedLocalModelStatus }) {
     // ... existing markup ...
     // After "Local model unavailable", add a label line showing backendName+endpoint:
     // <p className="text-xs font-mono text-red-300/80">{status.backendName} — {status.endpoint}</p>
   }
   ```
   Add the `backendName` + `endpoint` label inside the banner header area (immediately after the "Local model unavailable" `<p>` is the natural location). Use a small monospaced text style consistent with the existing `dl`/`dd` font choices.
3. Replace the destructure on line 611:
   ```typescript
   const { snapshot, agentEvents, connected, localModelStatuses } = useOrchestratorSocket();
   ```
4. Replace both `{localModelStatus && !localModelStatus.available && (...)}` blocks (lines 671-673 and 687-689) with a multi-banner render:
   ```typescript
   {localModelStatuses
     .filter((s) => !s.available)
     .map((s) => (
       <LocalModelBanner key={s.backendName} status={s} />
     ))}
   ```
   Both occurrences (the `if (!snapshot)` early return and the main render) get the same block.
5. Run: `pnpm --filter @harness-engineering/dashboard vitest run packages/dashboard/tests/client/pages/Orchestrator.test.tsx`
6. Observe **pass** for all multi-banner assertions including SC40 mixed-health.
7. Run: `pnpm --filter @harness-engineering/dashboard typecheck`. Any leftover singular references in this file or elsewhere should now compile clean.
8. Run: `harness validate`
9. Commit: `feat(dashboard): render N banners on Orchestrator page; LocalModelBanner takes NamedLocalModelStatus (Spec 2 SC40)`

### Task 14: Update integration test for orchestrator-local-resolver legacy path

**Depends on:** Task 13 | **Files:** `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`

Verify the deprecated singular endpoint (`/api/v1/local-model/status`) still returns the first-resolver `LocalModelStatus` for legacy consumers — the regression catcher for the deprecation alias.

1. Add a small test alongside the multi-resolver test added in Task 6:
   ```typescript
   it('legacy /local-model/status (singular) still returns first-resolver LocalModelStatus (deprecation alias)', async () => {
     // Build same 2-backend config from Task 6.
     // Call the legacy getLocalModelStatus callback directly (or hit the
     // singular endpoint). Assert the response shape is LocalModelStatus
     // (no backendName/endpoint fields) and the resolver corresponds to
     // the first registered backend.
   });
   ```
2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`
3. Observe **pass** — the legacy callback was preserved in Task 8.
4. Run: `harness validate`
5. Commit: `test(orchestrator): regression test for deprecated /local-model/status alias (Spec 2 Phase 5)`

### Task 15: Verification gate — full mechanical sweep [checkpoint:human-verify]

**Depends on:** Task 14 | **Files:** none (verification only)

1. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
3. Run: `pnpm --filter @harness-engineering/intelligence typecheck`
4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run`
5. Run: `pnpm --filter @harness-engineering/dashboard vitest run`
6. Run: `pnpm --filter @harness-engineering/intelligence vitest run`
7. Run: `harness validate`
8. Run: `harness check-deps`
9. SC30 grep regression check: `git grep -n "this\.config\.agent\.backend\b" packages/orchestrator/src/orchestrator.ts`. Expect **3 hits** (line 586 comment, line 1277 comment, line 1295 dispatchIssue legacy fallback) — same as Phase 4 exit. The Phase 5 changes touch the broadcast/HTTP layer, not the dispatch path; hit count must match.
10. SC41 invariant: `git diff 78ba4309 HEAD -- packages/orchestrator/src/core/state-machine.ts`. Expect empty diff.
11. **[checkpoint:human-verify]** — show the operator a green sweep summary (typecheck PASS x3, tests PASS x3 with delta vs Phase 4 exit baseline of 817 orchestrator + 218 intelligence + dashboard suite, harness validate PASS, harness check-deps PASS, SC30 grep clean, SC41 diff empty). Confirm phase exit-readiness before Task 16.
12. No commit (verification only).

### Task 16: Phase exit chore commit

**Depends on:** Task 15 | **Files:** `.harness/sessions/changes--multi-backend-routing--proposal/handoff.json` (no — handled by autopilot framework), session state files (handled by framework)

1. Confirm working tree is clean (`git status` shows no unstaged changes from Tasks 1-14; only a clean staging area from the prior commit).
2. Create an empty-content phase-exit commit:
   ```
   git commit --allow-empty -m "chore(spec2): Phase 5 exit gate green (dashboard surface multi-local SC38-40)"
   ```
3. Run: `harness validate`
4. Final commit: `chore(spec2): Phase 5 exit gate green (dashboard surface multi-local SC38-40)`

---

## Carry-forward to Phase 6+

- Remove the deprecated `/api/v1/local-model/status` singular endpoint and the `getLocalModelStatus` server callback. One minor release after Spec 2 ships, per D13.
- `docs/knowledge/orchestrator/issue-routing.md` still describes single-backend dispatch — update in Phase 6 (docs) per the original carry-forward.
- P2-S1 (synthesized routing default `Object.keys(backends)[0]` non-obvious; emit info log) — does not intersect dashboard work; defer.
- `LocalModelResolver` does not expose `endpoint` as a public getter. The orchestrator threads endpoint via `agent.backends[name].endpoint`. If a future consumer (e.g. a dashboard widget rendering resolver internals) needs the endpoint without going through config, add a getter on `LocalModelResolver` then.
- `useOrchestratorSocket`'s `localModelStatuses` state grows monotonically over a long-running session — no entry is ever removed (only upserted by `backendName`). If a backend is removed from config at runtime (currently impossible — backends are static at boot), stale entries persist. Out of scope; document if config hot-reload ever lands.

## Soundness review (P5-pre)

Run `harness-soundness-review --mode plan` against this draft before writing the final plan. Resolve any reviewer-flagged issues (vague tasks, missing exact code, oversized atomic units) by editing the plan and re-running the review until it converges with zero remaining issues.
