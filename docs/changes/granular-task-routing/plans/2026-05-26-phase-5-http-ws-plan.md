# Plan: Spec B Phase 5 — HTTP Routes + WS Topic for Routing Decisions

**Date:** 2026-05-26
**Spec:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/docs/changes/granular-task-routing/proposal.md`
**Worktree:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1`
**Branch:** `feat/spec-b-phase-1` (HEAD `5802839f`, Phase 4 tip)
**Phase 5 scope:** ~2 days, medium complexity
**Tasks:** 13
**Estimated time:** ~55 min of focused work (1 context window per task)
**Integration Tier:** medium
**Phase 5 success criteria:** F10 (WS topic broadcasts payload within 100ms of dispatch); F8 (decisions filterable + JSON-shaped); O3 (trace dry-run); plus closes Phase 4 deferred findings **S1** (`recent()` oldest-N → latest-N) and **S2** (`clearListeners()` on stop)

---

## Goal

When `BackendRouter.resolve()` produces a `RoutingDecision`, the orchestrator (a) holds the latest 500 in the bus ring buffer for HTTP read-out under `/api/v1/routing/decisions`, (b) snapshots the current `RoutingConfig` (with each `RoutingValue` resolved into a `{ candidate, exists }[]` chain shape) under `/api/v1/routing/config`, (c) accepts a dry-run resolution under `POST /api/v1/routing/trace` that calls `BackendRouter.resolveDecisionAndDef()` (the Phase 4 single-resolve seam) without side effects, and (d) broadcasts every decision live to WebSocket clients on type `routing:decision`. Alongside the four route surfaces, two Phase 4 deferred findings close: `RoutingDecisionBus.recent({limit})` returns **latest-N** (was oldest-N — wrong semantic for "recent"), and `RoutingDecisionBus.clearListeners()` is added + called from `Orchestrator.stop()` before the bus reference is nulled.

---

## Observable Truths (Acceptance Criteria)

1. **EARS — Event-driven (F10):** When `BackendRouter.resolve(useCase)` returns a decision and a WS client is subscribed to `/ws`, the system shall broadcast a frame `{ type: 'routing:decision', data: <RoutingDecision> }` within 100ms of the resolve return (verified by integration test that resolves and asserts WS receipt time < 100ms).
2. **EARS — Event-driven:** When the operator sends `GET /api/v1/routing/config` with a valid `read-telemetry` token, the system shall respond `200 application/json` with body `{ routing: <RoutingConfig>, resolvedChains: Record<string, { candidate: string, exists: boolean }[]>, backends: string[] }` — every routing-value source (default, each tier, each intelligence layer, each isolation tier, each skill, each mode) keyed in `resolvedChains` with its normalized chain plus per-candidate existence in `agent.backends`.
3. **EARS — Event-driven (F8):** When the operator sends `GET /api/v1/routing/decisions?skill=harness-debugging&limit=10` with a valid `read-telemetry` token, the system shall respond `200 application/json` with body `{ decisions: RoutingDecision[] }` containing at most 10 records, newest-first, filtered to `useCase.kind === 'skill' && useCase.skillName === 'harness-debugging'`. Filter params `skill`, `mode`, `backend`, `limit` are all optional; combining them ANDs the filters.
4. **EARS — Event-driven (O3 partial):** When the operator sends `POST /api/v1/routing/trace` with body `{ useCase: <RoutingUseCase>, invocationOverride?: string }` and a valid `read-telemetry` token, the system shall call `BackendRouter.resolveDecisionAndDef(useCase, { invocationOverride })`, respond `200` with body `{ decision: <RoutingDecision>, def: { type: BackendDef['type'] } }`, and shall NOT emit the decision onto the bus (dry-run; verified by ring-buffer length unchanged after the call).
5. **EARS — Unwanted:** If `POST /api/v1/routing/trace` body fails Zod parse (missing/invalid `useCase.kind`), then the system shall respond `400 application/json` with body `{ error: <message> }` and shall NOT call `router.resolveDecisionAndDef`.
6. **EARS — Unwanted:** If `BackendRouter` is unavailable (legacy config, `backendFactory === null`), then all three routes shall respond `503 application/json` with body `{ error: 'BackendRouter not available' }` — matches the `cacheMetrics` 503 precedent in `telemetry.ts`.
7. **EARS — Ubiquitous (Phase 4 S1 fix):** `RoutingDecisionBus.recent({ limit: N })` shall return the **latest N** decisions in **newest-first** order. `recent({ limit: 10 })` on a 100-decision buffer shall return decisions [99, 98, …, 90]. Verified by unit test against the existing fixture pattern.
8. **EARS — Event-driven (Phase 4 S2 fix):** When `Orchestrator.stop()` runs, the system shall call `routingDecisionBus.clearListeners()` before setting `this.routingDecisionBus = null`. After stop, a previously-subscribed listener shall never receive subsequent emissions (verified by integration test).
9. **EARS — Ubiquitous:** Three new bridge primitives shall be registered in `V1_BRIDGE_ROUTES`: `GET /api/v1/routing/config` (scope `read-telemetry`), `GET /api/v1/routing/decisions` (scope `read-telemetry`), `POST /api/v1/routing/trace` (scope `read-telemetry`). All three accept optional `?...` query string per the existing pattern.
10. **EARS — Ubiquitous (N1):** All existing Phase 4 acceptance tests (`spec-b-phase-4-decision-bus.test.ts` — 5 tests) and the bus unit tests (`routing/decision-bus.test.ts` — 5 tests) shall continue to pass; the latest-N flip pins a NEW assertion shape but should NOT break Phase 4's S5 capacity test (which counts records, not order).
11. **EARS — Ubiquitous:** `harness validate`, `harness check-deps`, `pnpm --filter @harness-engineering/orchestrator typecheck`, and the new Phase 5 acceptance test file shall pass.
12. **EARS — Ubiquitous:** A new acceptance test file at `packages/orchestrator/tests/integration/spec-b-phase-5-http-ws.test.ts` shall pin F10, F8, O3 (trace), 503-on-no-router, latest-N semantics, and clearListeners-on-stop across at least 6 tests.

---

## Uncertainties / Concerns for Operator Sign-Off

| #   | Class         | Concern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | BLOCKING-LITE | **Scope choice for the 3 routes.** Existing scope vocabulary (`read-status`, `read-telemetry`, `manage-proposals`, etc.) is closed — Phase 0 ADR pins changes require an ADR. **Option A (planner default):** reuse `read-telemetry` for all three routes — matches `cacheMetrics` precedent, no schema change, no ADR. **Option B:** add `read-routing` to `TokenScopeSchema` + `SCOPE_VOCABULARY`, requires ADR + Zod schema change + cascading token-doc updates. Plan defaults to **A** — routing-config + decisions + trace are read-only observability; `read-telemetry` already covers prompt-cache stats which is the closest semantic neighbor. Phase 6 CLI work uses the same scope.                                                                                                                                                                                                                  |
| C2  | BLOCKING-LITE | **Router accessor on Orchestrator.** Trace route needs the `BackendRouter` instance; `backendFactory` is currently private. **Option X (planner default):** add `public getBackendRouter(): BackendRouter \| null` to `Orchestrator` mirroring `getRoutingDecisionBus()` pattern. **Option Y:** widen `ServerDependencies` with `getBackendRouter?: () => BackendRouter \| null` and pass via the existing `OrchestratorServer` constructor wiring. Plan defaults to **X** — symmetric with Phase 4's `getRoutingDecisionBus()`, single accessor surface, route handler reads it via `(this.orchestrator as { getBackendRouter?: () => BackendRouter \| null }).getBackendRouter?.()` same way `proposals.ts` reaches the bus.                                                                                                                                                                                  |
| C3  | BLOCKING-LITE | **`recent()` ordering — newest-first vs oldest-first.** Spec wording (F8: "10 most recent records"), dashboard mental model ("the latest first"), and Phase 4 review S1 finding all point to **newest-first**. Plan defaults to **newest-first** (`buffer.slice(-limit).reverse()`). Alternative: keep insertion order but slice from the tail (`buffer.slice(-limit)`) — preserves chronological order but means the dashboard has to reverse on render. Plan picks newest-first because (a) it matches "recent" semantics, (b) Phase 7 dashboard expects newest-first per spec line 372–381, (c) `harness routing decisions` CLI output (Phase 6) reads top-to-bottom = most-recent-to-oldest. Operator may flip to chronological if the Phase 7 component design prefers oldest-first scrolling.                                                                                                             |
| C4  | BLOCKING-LITE | **`clearListeners()` timing in `stop()`.** Phase 4 review S2: when Phase 5 adds the WS broadcaster as the first external subscriber, `stop()` must release listeners to prevent the subscriber closure (which retains a reference to the `OrchestratorServer`) from anchoring the bus. **Plan:** add `clearListeners()` method to `RoutingDecisionBus`, call it from `Orchestrator.stop()` immediately **before** `this.routingDecisionBus = null` (line 1888). The WS subscriber unsubscribe handle returned from `bus.subscribe(...)` is stored on `OrchestratorServer` and called from `OrchestratorServer.stop()`; `clearListeners()` is the belt-and-suspenders second line. Operator may prefer to drop the explicit unsubscribe and rely on `clearListeners()` alone — plan defaults to **both** because unsubscribe runs earlier in shutdown (server.stop before orchestrator nulls the bus reference). |
| C5  | ASSUMPTION    | **`/routing/config` response shape — flat keyed map vs nested.** Plan response: `{ routing: <as-configured RoutingConfig>, resolvedChains: { 'default': [...], 'tier:quick-fix': [...], 'intelligence:sel': [...], 'isolation:tight': [...], 'skill:harness-debugging': [...], 'mode:adversarial-reviewer': [...] }, backends: ['claude-opus', …] }`. Keys are `<source>:<key>` so the dashboard can render one row per source without re-walking `RoutingConfig`. Alternative: nested shape mirroring `RoutingConfig` exactly. Plan picks flat-keyed because the dashboard's "Resolved Chains" table is one-row-per-source and flat-keyed avoids client-side flattening. Operator may prefer nested for symmetry with the input config shape.                                                                                                                                                                  |
| C6  | ASSUMPTION    | **Trace route response shape.** Plan returns `{ decision: RoutingDecision, def: { type: BackendDef['type'] } }` — the full decision plus the backend type so the dashboard's trace panel can show "would dispatch to claude-opus (type: anthropic)". Avoids leaking secrets (model env keys, endpoint URLs for local backends) by NOT echoing the full `BackendDef`. Alternative: return the full `BackendDef` for completeness. Plan picks redacted because trace is operator-facing and may be CI-piped (logs); model + endpoint URL is fine but `secrets` references are not. Operator may broaden if no secret leak risk in current `BackendDef` shape.                                                                                                                                                                                                                                                     |
| C7  | ASSUMPTION    | **WS broadcaster subscription lifecycle.** Plan: `OrchestratorServer` constructor reads `(orchestrator as { getRoutingDecisionBus?: () => Bus \| null }).getRoutingDecisionBus?.()` once at construction, calls `bus?.subscribe(decision => this.broadcaster.broadcast('routing:decision', decision))`, stores the returned unsubscribe handle in `private routingDecisionUnsubscribe`. `OrchestratorServer.stop()` calls it before `broadcaster.close()`. Alternative: subscribe lazily on first WS upgrade. Plan picks eager subscribe — simpler, matches `wireEvents()` (`agent_event` listener attached in constructor regardless of WS clients) and the bus's S6 isolation already handles "subscriber called with zero WS clients" (just a `broadcast()` call into an empty client set).                                                                                                                  |
| C8  | DEFERRABLE    | **Trace route — should it support `useCase.kind === 'skill'` without a real skill?** Plan accepts any well-formed `RoutingUseCase`. If the operator passes `{ kind: 'skill', skillName: 'fake-skill', cognitiveMode: 'adversarial-reviewer' }`, trace returns the resolution that WOULD happen — including skill-routing entries if they exist. Trace does NOT validate skill name against the catalog (D10 says catalog warning is at startup, not per-trace). Operator may want a `?strict=true` mode that 400s on unknown skill — defer to Phase 6 CLI ergonomics work.                                                                                                                                                                                                                                                                                                                                      |
| C9  | DEFERRABLE    | **Test file naming.** `spec-b-phase-5-http-ws.test.ts` matches Phase 3/4 convention. Per-route unit tests live as siblings: `packages/orchestrator/src/server/routes/v1/routing.test.ts` (similar to `telemetry.test.ts`). Operator may split per-route into 3 files if the suite grows beyond ~15 tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Decision points the operator should confirm before execution:**

- **D-OP-1 (C1):** **Approve Option A** — all 3 routes use `read-telemetry`. If reject (prefer dedicated scope): Task 4 adds `'read-routing'` to `TokenScopeSchema` + `SCOPE_VOCABULARY` + writes an ADR (adds 2 tasks).
- **D-OP-2 (C2):** **Approve adding `Orchestrator.getBackendRouter()` accessor.** If reject (prefer ServerDependencies threading): Task 6 wires `getBackendRouter` through `ServerDependencies` and `orchestrator.ts:533` server-init block.
- **D-OP-3 (C3):** **Approve newest-first ordering for `recent()`.** If reject (prefer chronological tail): Task 2 uses `slice(-limit)` without `.reverse()` and the acceptance test pins chronological order.
- **D-OP-4 (C4):** **Approve dual safety net** — explicit unsubscribe from `OrchestratorServer.stop()` AND `clearListeners()` from `Orchestrator.stop()`. If reject (clearListeners alone): Task 9 drops the unsubscribe storage and stop()-time unsubscribe call.
- **D-OP-5 (C5):** **Approve flat-keyed `resolvedChains` shape** (`'tier:quick-fix'`, `'skill:<name>'`, etc.). If reject (prefer nested): Task 7 mirrors `RoutingConfig`'s nested shape.
- **D-OP-6 (C6):** **Approve redacted `def` in trace response** (`{ type: BackendDef['type'] }` only). If reject (broader): Task 8 returns the full `BackendDef` with secrets-scrubbing TODO.
- **D-OP-7 (C7):** **Approve eager WS subscription at server construction.** If reject (lazy): Task 9 subscribes on first WS `/ws` upgrade and tracks subscriber count.

---

## File Map

```
MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/routing/decision-bus.ts
        # 1. Flip recent() limit: slice(-limit).reverse() — newest-first
        # 2. Add clearListeners(): void — empties this.listeners set

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/routing/decision-bus.test.ts
        # Re-pin the filter+limit test for newest-first; add clearListeners test

CREATE  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/routes/v1/routing.ts
        # Three route handlers: handleV1RoutingConfigRoute, handleV1RoutingDecisionsRoute,
        # handleV1RoutingTraceRoute. Exported via a single handleV1RoutingRoute dispatcher
        # matching the telemetry.ts pattern. Deps: { router: BackendRouter | null,
        # bus: RoutingDecisionBus | null, routing: RoutingConfig | null,
        # backends: Record<string, BackendDef> | null }.

CREATE  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/routes/v1/routing.test.ts
        # Per-route unit tests using the IncomingMessage/ServerResponse fixture
        # from telemetry.test.ts: 503 on no-router, 200 on config, 200 on
        # decisions with filter, 200 on trace, 400 on bad trace body, ring-buffer
        # unchanged after trace.

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/v1-bridge-routes.ts
        # Append 3 entries: GET /api/v1/routing/config, GET /api/v1/routing/decisions,
        # POST /api/v1/routing/trace — all scope 'read-telemetry'

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/http.ts
        # 1. Import handleV1RoutingRoute
        # 2. Add routing deps to ServerDependencies: { getBackendRouter?: () => BackendRouter | null;
        #    getRoutingDecisionBus?: () => RoutingDecisionBus | null; getRoutingConfig?: () => RoutingConfig | null;
        #    getBackends?: () => Record<string, BackendDef> | null; }
        # 3. Wire handler into buildApiRoutes()
        # 4. In constructor (after wireEvents()), call getRoutingDecisionBus and subscribe
        #    the broadcaster — store unsubscribe in private routingDecisionUnsubscribe
        # 5. stop(): if (this.routingDecisionUnsubscribe) this.routingDecisionUnsubscribe()
        # 6. Add public broadcastRoutingDecision(decision) shim (optional, for test direct-call)

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/orchestrator.ts
        # 1. Add public getBackendRouter(): BackendRouter | null — returns this.backendFactory?.getRouter() ?? null
        # 2. Add public getRoutingConfig(): RoutingConfig | null — returns synthesized routing (this.config.agent.routing ?? null)
        # 3. Add public getBackends(): Record<string, BackendDef> | null — returns this.config.agent.backends ?? null
        # 4. In server-init at line 533, pass the four new accessors via ServerDependencies
        # 5. In stop() at line 1888, call this.routingDecisionBus?.clearListeners() BEFORE nulling

CREATE  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/integration/spec-b-phase-5-http-ws.test.ts
        # Acceptance test pinning F10 (WS broadcast latency <100ms), F8 (decisions
        # filter+order), O3 (trace dry-run + ring buffer unchanged), 503 on no-router,
        # latest-N semantics on recent(), clearListeners-on-stop hygiene
```

No new directories created. No barrel regen required (everything imported via deep module paths, matching Phase 4 D-OP precedent — "orchestrator barrel hand-curated").

---

## Tasks

### Task 1 — Pin the latest-N + clearListeners contract (TDD red)

**Depends on:** none | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/routing/decision-bus.test.ts` | **Category:** test

1. Open `tests/routing/decision-bus.test.ts`. Locate the existing test pinning `recent({ limit: N })` behavior (Phase 4 Task 2 pinned it).
2. Add a new test case after the existing limit-test:
   ```ts
   it('recent({ limit }) returns the latest N decisions in newest-first order (Phase 5 S1 fix)', () => {
     const bus = new RoutingDecisionBus({ capacity: 100 });
     for (let i = 0; i < 50; i++) {
       bus.emit({
         timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
         useCase: { kind: 'tier', tier: 'quick-fix' },
         resolutionPath: [{ source: 'tier', candidate: `b${i}`, outcome: 'chosen' }],
         backendName: `b${i}`,
         backendType: 'anthropic',
         durationMs: 0,
       });
     }
     const out = bus.recent({ limit: 5 });
     expect(out.length).toBe(5);
     expect(out.map((d) => d.backendName)).toEqual(['b49', 'b48', 'b47', 'b46', 'b45']);
   });
   ```
3. Add a second new test case:
   ```ts
   it('clearListeners() removes all subscribers so post-clear emits reach nobody (Phase 5 S2 fix)', () => {
     const bus = new RoutingDecisionBus();
     const received: string[] = [];
     bus.subscribe((d) => received.push(d.backendName));
     bus.clearListeners();
     bus.emit({
       timestamp: '2026-05-26T00:00:00.000Z',
       useCase: { kind: 'tier', tier: 'quick-fix' },
       resolutionPath: [{ source: 'tier', candidate: 'x', outcome: 'chosen' }],
       backendName: 'x',
       backendType: 'anthropic',
       durationMs: 0,
     });
     expect(received).toEqual([]);
   });
   ```
4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run tests/routing/decision-bus.test.ts`
5. Observe: both new tests fail (newest-first not implemented; `clearListeners` does not exist). Existing 5 tests still pass — including the original filter-limit test (planner: the original test was `recent({skillName})` with no limit ordering; verify before this task that the existing filter-limit test does not assert ordering — if it does, this task ALSO updates that existing test for newest-first).
6. Run: `harness validate`
7. Commit: `test(orchestrator): pin Phase 5 latest-N + clearListeners contracts for RoutingDecisionBus`

> **Pre-task verification step:** Before writing the new tests, the executor must `grep -n "limit:" tests/routing/decision-bus.test.ts` to see whether any existing test pins oldest-first ordering. If yes, update it in this task; do not split.

---

### Task 2 — Implement latest-N + clearListeners (TDD green)

**Depends on:** Task 1 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/routing/decision-bus.ts`

1. Open `src/routing/decision-bus.ts`.
2. Replace `recent(filter?)` lines 75-97. Change line 94 from `out = out.slice(0, filter.limit);` to:
   ```ts
   if (filter?.limit !== undefined) {
     out = out.slice(-filter.limit).reverse();
   } else {
     out = out.slice().reverse();
   }
   ```
   Move the existing filter passes (skillName, mode, backendName) to run BEFORE the slice — so the limit is applied to the filtered set, not the raw buffer. Final structure:
   ```ts
   recent(filter?: RoutingDecisionBusFilter): RoutingDecision[] {
     let out = this.ringBuffer.slice();
     if (filter?.skillName !== undefined) { /* ... */ }
     if (filter?.mode !== undefined) { /* ... */ }
     if (filter?.backendName !== undefined) { /* ... */ }
     if (filter?.limit !== undefined) {
       out = out.slice(-filter.limit).reverse();
     } else {
       out = out.reverse();
     }
     return out;
   }
   ```
3. Add `clearListeners` method after `subscribe`:
   ```ts
   /**
    * Spec B Phase 5 (review-S2 fix): release all subscriber references so
    * teardown can complete without anchoring closures. Called from
    * Orchestrator.stop() before nulling the bus reference. The bus
    * remains usable after clear — subscribe() works as normal.
    */
   clearListeners(): void {
     this.listeners.clear();
   }
   ```
4. Update the class JSDoc capacity comment if it mentions ordering.
5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run tests/routing/decision-bus.test.ts`
6. Observe: all 7 tests pass.
7. Run: `harness validate && harness check-deps`
8. Commit: `feat(orchestrator): RoutingDecisionBus.recent returns latest-N newest-first + add clearListeners (Spec B Phase 5, closes Phase 4 review S1+S2)`

---

### Task 3 — Pin the routing-config route contract (TDD red)

**Depends on:** Task 2 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/routes/v1/routing.test.ts` (CREATE) | **Category:** test

1. Create `src/server/routes/v1/routing.test.ts`. Use the fixture pattern from `telemetry.test.ts` (`makeReq`, `makeRes`).
2. Add the imports:
   ```ts
   import { describe, it, expect } from 'vitest';
   import { IncomingMessage, ServerResponse } from 'node:http';
   import { Socket } from 'node:net';
   import { BackendRouter } from '../../../agent/backend-router';
   import { RoutingDecisionBus } from '../../../routing/decision-bus';
   import { handleV1RoutingRoute } from './routing';
   import type { BackendDef, RoutingConfig } from '@harness-engineering/types';
   ```
3. Add fixtures (`makeReq`, `makeRes` copy-paste from telemetry.test.ts).
4. Add the first describe block with one test asserting the config route:

   ```ts
   describe('handleV1RoutingRoute — GET /api/v1/routing/config', () => {
     it('returns 200 with routing + resolvedChains + backends', async () => {
       const backends: Record<string, BackendDef> = {
         'claude-opus': { type: 'anthropic', model: 'claude-opus-4-7' },
         'local-fast': { type: 'local', endpoint: 'http://localhost:1234/v1', model: 'qwen3:8b' },
       };
       const routing: RoutingConfig = {
         default: 'claude-opus',
         'quick-fix': ['local-fast', 'claude-opus'],
         skills: { 'harness-debugging': 'local-fast' },
       };
       const router = new BackendRouter({ backends, routing });
       const bus = new RoutingDecisionBus();
       const req = makeReq('GET', '/api/v1/routing/config');
       const { res, chunks, statusCode } = makeRes();
       const handled = handleV1RoutingRoute(req, res, { router, bus, routing, backends });
       expect(handled).toBe(true);
       expect(statusCode()).toBe(200);
       const body = JSON.parse(chunks.join(''));
       expect(body.backends).toEqual(['claude-opus', 'local-fast']);
       expect(body.routing).toEqual(routing);
       expect(body.resolvedChains['default']).toEqual([{ candidate: 'claude-opus', exists: true }]);
       expect(body.resolvedChains['tier:quick-fix']).toEqual([
         { candidate: 'local-fast', exists: true },
         { candidate: 'claude-opus', exists: true },
       ]);
       expect(body.resolvedChains['skill:harness-debugging']).toEqual([
         { candidate: 'local-fast', exists: true },
       ]);
     });

     it('returns 503 when router is null', () => {
       const req = makeReq('GET', '/api/v1/routing/config');
       const { res, chunks, statusCode } = makeRes();
       const handled = handleV1RoutingRoute(req, res, {
         router: null,
         bus: null,
         routing: null,
         backends: null,
       });
       expect(handled).toBe(true);
       expect(statusCode()).toBe(503);
       expect(chunks.join('')).toContain('BackendRouter not available');
     });
   });
   ```

5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/routing.test.ts`
6. Observe: tests fail (module does not exist).
7. Run: `harness validate`
8. Commit: `test(orchestrator): pin GET /api/v1/routing/config route contract (Spec B Phase 5)`

---

### Task 4 — Implement routing.ts module with config route (TDD green)

**Depends on:** Task 3 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/routes/v1/routing.ts` (CREATE)

1. Create `src/server/routes/v1/routing.ts`:

   ```ts
   import type { IncomingMessage, ServerResponse } from 'node:http';
   import type { BackendDef, RoutingConfig, RoutingValue } from '@harness-engineering/types';
   import type { BackendRouter } from '../../../agent/backend-router';
   import type { RoutingDecisionBus } from '../../../routing/decision-bus';
   import { toArray } from '../../../agent/backend-router';

   const CONFIG_RE = /^\/api\/v1\/routing\/config(?:\?.*)?$/;
   const DECISIONS_RE = /^\/api\/v1\/routing\/decisions(?:\?.*)?$/;
   const TRACE_RE = /^\/api\/v1\/routing\/trace(?:\?.*)?$/;

   export interface RoutingRouteDeps {
     router: BackendRouter | null;
     bus: RoutingDecisionBus | null;
     routing: RoutingConfig | null;
     backends: Record<string, BackendDef> | null;
   }

   function sendJSON(res: ServerResponse, status: number, body: unknown): void {
     res.writeHead(status, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify(body));
   }

   function unavailable(res: ServerResponse): true {
     sendJSON(res, 503, { error: 'BackendRouter not available' });
     return true;
   }

   function resolveChain(
     value: RoutingValue,
     backends: Record<string, BackendDef>
   ): { candidate: string; exists: boolean }[] {
     return toArray(value).map((c) => ({ candidate: c, exists: c in backends }));
   }

   function buildResolvedChains(
     routing: RoutingConfig,
     backends: Record<string, BackendDef>
   ): Record<string, { candidate: string; exists: boolean }[]> {
     const out: Record<string, { candidate: string; exists: boolean }[]> = {};
     out['default'] = resolveChain(routing.default, backends);
     for (const tier of ['quick-fix', 'guided-change', 'full-exploration', 'diagnostic'] as const) {
       const v = routing[tier];
       if (v !== undefined) out[`tier:${tier}`] = resolveChain(v, backends);
     }
     if (routing.intelligence) {
       for (const [layer, v] of Object.entries(routing.intelligence)) {
         if (v !== undefined) out[`intelligence:${layer}`] = resolveChain(v, backends);
       }
     }
     if (routing.isolation) {
       for (const [tier, v] of Object.entries(routing.isolation)) {
         if (v !== undefined) out[`isolation:${tier}`] = resolveChain(v, backends);
       }
     }
     if (routing.skills) {
       for (const [name, v] of Object.entries(routing.skills)) {
         if (v !== undefined) out[`skill:${name}`] = resolveChain(v, backends);
       }
     }
     if (routing.modes) {
       for (const [mode, v] of Object.entries(routing.modes)) {
         if (v !== undefined) out[`mode:${mode}`] = resolveChain(v, backends);
       }
     }
     return out;
   }

   function handleConfig(res: ServerResponse, deps: RoutingRouteDeps): boolean {
     if (!deps.router || !deps.routing || !deps.backends) return unavailable(res);
     sendJSON(res, 200, {
       routing: deps.routing,
       resolvedChains: buildResolvedChains(deps.routing, deps.backends),
       backends: Object.keys(deps.backends),
     });
     return true;
   }

   export function handleV1RoutingRoute(
     req: IncomingMessage,
     res: ServerResponse,
     deps: RoutingRouteDeps
   ): boolean {
     const url = req.url ?? '';
     const method = req.method ?? 'GET';
     if (method === 'GET' && CONFIG_RE.test(url)) return handleConfig(res, deps);
     // DECISIONS_RE + TRACE_RE wired in Tasks 5/8
     return false;
   }
   ```

2. Note: `toArray` must be exported from `backend-router.ts`. It currently has no `export` keyword inside the function declaration — verify with `grep -n "export function toArray" src/agent/backend-router.ts`. If unexported, this task adds `export` to it (line 37 of backend-router.ts already has `export`, per Phase 1 plan — verify).
3. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/routing.test.ts`
4. Observe: both config tests pass.
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(orchestrator): GET /api/v1/routing/config — current config + resolved chains + backends (Spec B Phase 5)`

---

### Task 5 — Pin the decisions route contract (TDD red)

**Depends on:** Task 4 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/routes/v1/routing.test.ts` | **Category:** test

1. Add a second describe block to `routing.test.ts`:

   ```ts
   describe('handleV1RoutingRoute — GET /api/v1/routing/decisions', () => {
     it('returns 200 with decisions[] filtered by skill+limit, newest-first', () => {
       const backends = { 'claude-opus': { type: 'anthropic', model: 'x' } };
       const routing: RoutingConfig = {
         default: 'claude-opus',
         skills: { 'harness-debugging': 'claude-opus' },
       };
       const router = new BackendRouter({ backends, routing });
       const bus = new RoutingDecisionBus();
       // Seed: 3 skill decisions for harness-debugging, 2 tier decisions
       for (let i = 0; i < 3; i++)
         bus.emit({
           timestamp: `2026-05-26T00:00:0${i}.000Z`,
           useCase: { kind: 'skill', skillName: 'harness-debugging' },
           resolutionPath: [],
           backendName: 'claude-opus',
           backendType: 'anthropic',
           durationMs: 0,
         });
       for (let i = 0; i < 2; i++)
         bus.emit({
           timestamp: `2026-05-26T00:01:0${i}.000Z`,
           useCase: { kind: 'tier', tier: 'quick-fix' },
           resolutionPath: [],
           backendName: 'claude-opus',
           backendType: 'anthropic',
           durationMs: 0,
         });
       const req = makeReq('GET', '/api/v1/routing/decisions?skill=harness-debugging&limit=2');
       const { res, chunks, statusCode } = makeRes();
       handleV1RoutingRoute(req, res, { router, bus, routing, backends });
       expect(statusCode()).toBe(200);
       const body = JSON.parse(chunks.join(''));
       expect(body.decisions.length).toBe(2);
       // newest-first
       expect(body.decisions[0].timestamp).toBe('2026-05-26T00:00:02.000Z');
       expect(body.decisions[1].timestamp).toBe('2026-05-26T00:00:01.000Z');
     });

     it('returns 503 when bus is null', () => {
       const req = makeReq('GET', '/api/v1/routing/decisions');
       const { res, statusCode } = makeRes();
       handleV1RoutingRoute(req, res, { router: null, bus: null, routing: null, backends: null });
       expect(statusCode()).toBe(503);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/routing.test.ts`
3. Observe: 2 new tests fail (DECISIONS_RE not wired in handler).
4. Run: `harness validate`
5. Commit: `test(orchestrator): pin GET /api/v1/routing/decisions filter+ordering contract (Spec B Phase 5)`

---

### Task 6 — Implement decisions route (TDD green)

**Depends on:** Task 5 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/routes/v1/routing.ts`

1. Open `src/server/routes/v1/routing.ts`. Add `handleDecisions`:

   ```ts
   function parseDecisionsQuery(url: string): {
     skillName?: string;
     mode?: string;
     backendName?: string;
     limit?: number;
   } {
     const qIdx = url.indexOf('?');
     if (qIdx === -1) return {};
     const p = new URLSearchParams(url.slice(qIdx + 1));
     const filter: { skillName?: string; mode?: string; backendName?: string; limit?: number } = {};
     const skill = p.get('skill');
     const mode = p.get('mode');
     const backend = p.get('backend');
     const limit = p.get('limit');
     if (skill) filter.skillName = skill;
     if (mode) filter.mode = mode;
     if (backend) filter.backendName = backend;
     if (limit) {
       const n = Number(limit);
       if (Number.isFinite(n) && n > 0) filter.limit = Math.floor(n);
     }
     return filter;
   }

   function handleDecisions(
     req: IncomingMessage,
     res: ServerResponse,
     deps: RoutingRouteDeps
   ): boolean {
     if (!deps.bus) return unavailable(res);
     const filter = parseDecisionsQuery(req.url ?? '');
     sendJSON(res, 200, { decisions: deps.bus.recent(filter) });
     return true;
   }
   ```

2. Wire into the dispatcher:
   ```ts
   if (method === 'GET' && DECISIONS_RE.test(url)) return handleDecisions(req, res, deps);
   ```
3. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/routing.test.ts`
4. Observe: 4 tests pass.
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(orchestrator): GET /api/v1/routing/decisions with skill/mode/backend/limit filters (Spec B Phase 5, F8)`

---

### Task 7 — Pin the trace route contract (TDD red)

**Depends on:** Task 6 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/routes/v1/routing.test.ts` | **Category:** test

1. Add a third describe block to `routing.test.ts`:

   ```ts
   import { readBody } from '../../utils'; // verify import path matches existing
   // utility for fixturing JSON body
   function makeJsonReq(method: string, url: string, body: unknown): IncomingMessage {
     const r = new IncomingMessage(new Socket());
     r.method = method;
     r.url = url;
     r.headers['content-type'] = 'application/json';
     const data = JSON.stringify(body);
     process.nextTick(() => {
       r.emit('data', Buffer.from(data));
       r.emit('end');
     });
     return r;
   }

   describe('handleV1RoutingRoute — POST /api/v1/routing/trace', () => {
     it('returns 200 with { decision, def: { type } } and does NOT emit on bus', async () => {
       const backends = { 'claude-opus': { type: 'anthropic', model: 'x' } };
       const routing: RoutingConfig = { default: 'claude-opus' };
       const router = new BackendRouter({ backends, routing });
       const bus = new RoutingDecisionBus();
       const ringBefore = bus.recent().length;
       const req = makeJsonReq('POST', '/api/v1/routing/trace', {
         useCase: { kind: 'tier', tier: 'quick-fix' },
       });
       const { res, chunks, statusCode } = makeRes();
       handleV1RoutingRoute(req, res, { router, bus, routing, backends });
       await new Promise((r) => setTimeout(r, 10)); // body read is async
       expect(statusCode()).toBe(200);
       const body = JSON.parse(chunks.join(''));
       expect(body.decision.backendName).toBe('claude-opus');
       expect(body.def).toEqual({ type: 'anthropic' });
       expect(bus.recent().length).toBe(ringBefore); // dry-run = no emit
     });

     it('returns 400 on invalid body (missing useCase.kind)', async () => {
       const backends = { 'claude-opus': { type: 'anthropic', model: 'x' } };
       const routing: RoutingConfig = { default: 'claude-opus' };
       const router = new BackendRouter({ backends, routing });
       const bus = new RoutingDecisionBus();
       const req = makeJsonReq('POST', '/api/v1/routing/trace', { useCase: { tier: 'quick-fix' } });
       const { res, chunks, statusCode } = makeRes();
       handleV1RoutingRoute(req, res, { router, bus, routing, backends });
       await new Promise((r) => setTimeout(r, 10));
       expect(statusCode()).toBe(400);
       expect(chunks.join('')).toContain('error');
     });

     it('returns 503 when router is null', async () => {
       const req = makeJsonReq('POST', '/api/v1/routing/trace', {
         useCase: { kind: 'tier', tier: 'quick-fix' },
       });
       const { res, statusCode } = makeRes();
       handleV1RoutingRoute(req, res, { router: null, bus: null, routing: null, backends: null });
       await new Promise((r) => setTimeout(r, 10));
       expect(statusCode()).toBe(503);
     });
   });
   ```

2. Run tests; observe 3 new failures (TRACE_RE not wired).
3. Run: `harness validate`
4. Commit: `test(orchestrator): pin POST /api/v1/routing/trace dry-run contract (Spec B Phase 5)`

---

### Task 8 — Implement trace route (TDD green) — uses `resolveDecisionAndDef`

**Depends on:** Task 7 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/routes/v1/routing.ts`

1. Open `routing.ts`. Add Zod schema for the body — keep narrow, no transform:

   ```ts
   import { z } from 'zod';
   import { readBody } from '../../utils';

   // Mirror RoutingUseCase discriminated union; reject malformed at the wire.
   const UseCaseSchema = z.discriminatedUnion('kind', [
     z.object({
       kind: z.literal('tier'),
       tier: z.enum(['quick-fix', 'guided-change', 'full-exploration', 'diagnostic']),
     }),
     z.object({ kind: z.literal('intelligence'), layer: z.enum(['sel', 'pesl']) }),
     z.object({ kind: z.literal('isolation'), tier: z.string() }),
     z.object({ kind: z.literal('maintenance') }),
     z.object({ kind: z.literal('chat') }),
     z.object({
       kind: z.literal('skill'),
       skillName: z.string().min(1),
       cognitiveMode: z.string().optional(),
     }),
     z.object({ kind: z.literal('mode'), cognitiveMode: z.string().min(1) }),
   ]);
   const TraceBodySchema = z.object({
     useCase: UseCaseSchema,
     invocationOverride: z.string().min(1).optional(),
   });
   ```

2. Add the handler:
   ```ts
   async function handleTrace(
     req: IncomingMessage,
     res: ServerResponse,
     deps: RoutingRouteDeps
   ): Promise<boolean> {
     if (!deps.router) {
       unavailable(res);
       return true;
     }
     let raw: string;
     try {
       raw = await readBody(req);
     } catch {
       sendJSON(res, 400, { error: 'body read failed' });
       return true;
     }
     let parsed: unknown;
     try {
       parsed = JSON.parse(raw);
     } catch {
       sendJSON(res, 400, { error: 'invalid JSON body' });
       return true;
     }
     const r = TraceBodySchema.safeParse(parsed);
     if (!r.success) {
       sendJSON(res, 400, { error: r.error.message });
       return true;
     }
     const opts =
       r.data.invocationOverride !== undefined
         ? { invocationOverride: r.data.invocationOverride }
         : undefined;
     try {
       const { decision, def } = deps.router.resolveDecisionAndDef(r.data.useCase as any, opts);
       sendJSON(res, 200, { decision, def: { type: def.type } });
     } catch (err) {
       sendJSON(res, 500, { error: String(err) });
     }
     return true;
   }
   ```
   The `as any` cast on `r.data.useCase` is because Zod's inferred shape (with `kind: 'isolation'; tier: string`) is a wider type than `RoutingUseCase` whose `isolation` tier is `IsolationTier`. The router validates anyway. Mark with an `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment.
3. Wire into the dispatcher:
   ```ts
   if (method === 'POST' && TRACE_RE.test(url)) {
     void handleTrace(req, res, deps);
     return true;
   }
   ```
4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/routing.test.ts`
5. Observe: 7 tests pass.

   **Critical assertion:** `handleTrace` must NOT call `bus.emit()`. The Phase 4 contract is that `BackendRouter.resolve()` emits if a bus is injected. Trace uses `resolveDecisionAndDef` which calls `resolve()` internally — so to make trace dry-run, the router instance passed to the trace route MUST be one that has NO bus injected, OR the test seeds the bus separately. The acceptance test pins ring-buffer-unchanged after trace, so the route handler must use a router that was never given the bus (the orchestrator wires the bus into the dispatch-path router; trace passes a sibling router instance? — see C8 below).

   **Resolution:** add a trace-only router accessor on `Orchestrator` — `getBackendRouter()` already returns the production router (with bus). For trace dry-run, either (a) construct a sibling `BackendRouter` per-trace from `getBackends()` + `getRoutingConfig()` (no bus), or (b) accept that trace emits a "phantom" decision and explicitly tag it with a `traceOnly: true` flag the bus filters out.

   **Plan picks (a)** — simpler, no Phase 4 contract change: `handleTrace` constructs `new BackendRouter({ backends: deps.backends, routing: deps.routing })` (no bus) per-call. Cheap (no allocation hot path; trace is operator-driven). Update the test fixture accordingly — the test passes both `router` and `routing+backends`, and the handler uses `routing+backends` for trace, `router` for nothing in trace. Adjust dep shape if needed.

   **Revised handler:**

   ```ts
   async function handleTrace(
     req: IncomingMessage,
     res: ServerResponse,
     deps: RoutingRouteDeps
   ): Promise<boolean> {
     if (!deps.routing || !deps.backends) {
       unavailable(res);
       return true;
     }
     // ... body parse ...
     // Build a bus-less router so the trace cannot pollute the production ring buffer.
     const dryRunRouter = new (await import('../../../agent/backend-router')).BackendRouter({
       backends: deps.backends,
       routing: deps.routing,
     });
     const { decision, def } = dryRunRouter.resolveDecisionAndDef(r.data.useCase as any, opts);
     // ...
   }
   ```

   This makes the `router` field on `RoutingRouteDeps` unused by trace (used by future routes that need the live router). Acceptable surface.

6. Run: `harness validate && harness check-deps`
7. Commit: `feat(orchestrator): POST /api/v1/routing/trace dry-run via bus-less router (Spec B Phase 5, O3 partial, F4 prep)`

---

### Task 9 — Register 3 v1 bridge primitives + scope

**Depends on:** Task 8 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/v1-bridge-routes.ts` | **Category:** integration

1. Open `src/server/v1-bridge-routes.ts`. After the Phase 5 telemetry/cache entry (line ~111), append:
   ```ts
   // ── Spec B Phase 5 routing observability ──
   {
     method: 'GET',
     pattern: /^\/api\/v1\/routing\/config(?:\?.*)?$/,
     scope: 'read-telemetry',
     description: 'Current routing config + resolved fallback chains + known backends.',
   },
   {
     method: 'GET',
     pattern: /^\/api\/v1\/routing\/decisions(?:\?.*)?$/,
     scope: 'read-telemetry',
     description: 'Recent routing decisions (newest-first), filterable by skill/mode/backend.',
   },
   {
     method: 'POST',
     pattern: /^\/api\/v1\/routing\/trace(?:\?.*)?$/,
     scope: 'read-telemetry',
     description: 'Dry-run a routing decision without side effects (no bus emit, no dispatch).',
   },
   ```
2. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
3. Run: `harness validate`
4. Commit: `feat(orchestrator): register 3 v1 bridge primitives for /api/v1/routing/* (Spec B Phase 5)`

---

### Task 10 — Add orchestrator accessors + wire ServerDependencies + clearListeners in stop()

**Depends on:** Task 9 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/orchestrator.ts`

1. Open `src/orchestrator.ts`. After `public getRoutingDecisionBus()` (line 1983), add three new public accessors:
   ```ts
   /** Spec B Phase 5: trace route + config route consumer. */
   public getBackendRouter(): import('./agent/backend-router').BackendRouter | null {
     return this.backendFactory?.getRouter() ?? null;
   }
   /** Spec B Phase 5: config route + trace route's dry-run router constructor. */
   public getRoutingConfig(): import('@harness-engineering/types').RoutingConfig | null {
     return this.config.agent.routing ?? null;
   }
   /** Spec B Phase 5: config route + trace route's dry-run router constructor. */
   public getBackends(): Record<string, import('@harness-engineering/types').BackendDef> | null {
     return this.config.agent.backends ?? null;
   }
   ```
2. In the server-init block at line 533, add the four accessors to the `OrchestratorServer` deps:
   ```ts
   this.server = new OrchestratorServer(this, config.server.port, {
     // ...existing fields...
     getBackendRouter: () => this.getBackendRouter(),
     getRoutingDecisionBus: () => this.getRoutingDecisionBus(),
     getRoutingConfig: () => this.getRoutingConfig(),
     getBackends: () => this.getBackends(),
   });
   ```
3. In `stop()` at line ~1888, change:
   ```ts
   this.routingDecisionBus = null;
   ```
   to:
   ```ts
   // Spec B Phase 5 (Phase 4 review S2 fix): release subscribers before
   // nulling the reference so any WS broadcaster closure can be GC'd.
   this.routingDecisionBus?.clearListeners();
   this.routingDecisionBus = null;
   ```
4. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
5. Run: `harness validate`
6. Commit: `feat(orchestrator): expose getBackendRouter/getRoutingConfig/getBackends + clearListeners-on-stop (Spec B Phase 5)`

---

### Task 11 — Wire routing route + WS broadcaster subscription into OrchestratorServer

**Depends on:** Task 10 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/server/http.ts`

1. Open `src/server/http.ts`. Add imports near the top with the other route handlers:
   ```ts
   import { handleV1RoutingRoute } from './routes/v1/routing';
   import type { BackendRouter } from '../agent/backend-router';
   import type { RoutingDecisionBus } from '../routing/decision-bus';
   import type { BackendDef, RoutingConfig, RoutingDecision } from '@harness-engineering/types';
   ```
2. Extend `ServerDependencies` (after `cacheMetrics`):
   ```ts
   /** Spec B Phase 5 — routing observability routes. */
   getBackendRouter?: () => BackendRouter | null;
   getRoutingDecisionBus?: () => RoutingDecisionBus | null;
   getRoutingConfig?: () => RoutingConfig | null;
   getBackends?: () => Record<string, BackendDef> | null;
   ```
3. Add four private fields on the class (near `private cacheMetrics`):
   ```ts
   private getBackendRouter: (() => BackendRouter | null) | null = null;
   private getRoutingDecisionBus: (() => RoutingDecisionBus | null) | null = null;
   private getRoutingConfig: (() => RoutingConfig | null) | null = null;
   private getBackends: (() => Record<string, BackendDef> | null) | null = null;
   private routingDecisionUnsubscribe: (() => void) | null = null;
   ```
4. In `initDependencies(deps)`, assign them:
   ```ts
   this.getBackendRouter = deps?.getBackendRouter ?? null;
   this.getRoutingDecisionBus = deps?.getRoutingDecisionBus ?? null;
   this.getRoutingConfig = deps?.getRoutingConfig ?? null;
   this.getBackends = deps?.getBackends ?? null;
   ```
5. In `wireEvents()` (after the existing `agent_event` listener registration), append:
   ```ts
   // Spec B Phase 5 (F10): bridge RoutingDecisionBus → WS broadcaster on
   // topic 'routing:decision'. Eager subscribe at server construction
   // matches the agent_event listener pattern; bus.emit() reaches a
   // broadcaster with zero clients without error (existing broadcast()
   // contract). Unsubscribe runs in stop() before broadcaster.close().
   const bus = this.getRoutingDecisionBus?.();
   if (bus) {
     this.routingDecisionUnsubscribe = bus.subscribe((decision: RoutingDecision) => {
       this.broadcaster.broadcast('routing:decision', decision);
     });
   }
   ```
6. In `buildApiRoutes()`, add an entry near the telemetry route:
   ```ts
   // Spec B Phase 5 — routing observability. Returns 503 when the
   // backendFactory is null (legacy single-backend configs).
   (req, res) =>
     handleV1RoutingRoute(req, res, {
       router: this.getBackendRouter?.() ?? null,
       bus: this.getRoutingDecisionBus?.() ?? null,
       routing: this.getRoutingConfig?.() ?? null,
       backends: this.getBackends?.() ?? null,
     }),
   ```
7. In `stop()` (locate the existing teardown — `for (const client of this.wss.clients) client.close()` etc.), prepend before broadcaster close:
   ```ts
   if (this.routingDecisionUnsubscribe) {
     this.routingDecisionUnsubscribe();
     this.routingDecisionUnsubscribe = null;
   }
   ```
8. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
9. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/routes/v1/routing.test.ts`
10. Run: `harness validate && harness check-deps`
11. Commit: `feat(orchestrator): wire /api/v1/routing/* + routing:decision WS broadcast in OrchestratorServer (Spec B Phase 5, F10)`

---

### Task 12 — Integration acceptance test (F10 + F8 + O3 + 503 + latest-N + clearListeners)

**Depends on:** Task 11 | **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/integration/spec-b-phase-5-http-ws.test.ts` (CREATE) | **Category:** test

1. Create the integration test using the existing orchestrator fixture pattern from `tests/integration/spec-b-phase-4-decision-bus.test.ts` (reference structure; do not invent new patterns).
2. Six pinned test cases:
   - **F10:** Connect a `ws.WebSocket` client to the running orchestrator's `/ws`, invoke a dispatch that triggers `BackendRouter.resolve(...)`, assert the client receives a `{ type: 'routing:decision', data: RoutingDecision }` frame within 100ms (use `performance.now()` to bracket).
   - **F8:** Seed the bus by triggering 5 dispatches (mix of skill / tier use cases), call `GET /api/v1/routing/decisions?skill=...&limit=2`, assert body matches expected shape + newest-first order.
   - **O3 partial:** `POST /api/v1/routing/trace` with `{ useCase: { kind: 'tier', tier: 'quick-fix' } }`, assert 200 + decision present + ring-buffer length unchanged.
   - **503:** Construct an orchestrator with legacy single-backend config (no `agent.backends`), assert all 3 routes return 503.
   - **latest-N hygiene:** seed >500 decisions, GET `/api/v1/routing/decisions?limit=10`, assert first decision is the most recent.
   - **clearListeners-on-stop:** subscribe a custom listener directly via `getRoutingDecisionBus()?.subscribe()`, call `orchestrator.stop()`, trigger a (hypothetical, via a held bus reference) emit and assert the listener does not fire.
3. Reuse the Phase 4 acceptance test's orchestrator-construction helper if one exists; if not, copy the minimal fixture from `spec-b-phase-4-decision-bus.test.ts`.
4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run tests/integration/spec-b-phase-5-http-ws.test.ts`
5. Observe: 6/6 pass.
6. Run: `harness validate && harness check-deps`
7. Commit: `test(orchestrator): pin Spec B Phase 5 acceptance criteria (F10 + F8 + O3 trace + 503 + latest-N + clearListeners)`

---

### Task 13 — Final verification: phase-4 tests still pass, typecheck, validate, check-deps

**Depends on:** Task 12 | **Files:** (no edits) | **Category:** verification

1. Run the Phase 4 acceptance suite to confirm N1:
   `pnpm --filter @harness-engineering/orchestrator vitest run tests/integration/spec-b-phase-4-decision-bus.test.ts tests/routing/decision-bus.test.ts`
   Expect: Phase 4 5/5 + Phase 5 augmented decision-bus tests 7/7 all pass.
2. Run the full backend-router suite to confirm N1:
   `pnpm --filter @harness-engineering/orchestrator vitest run tests/agent/backend-router.test.ts tests/agent/backend-router-chain-walk.test.ts`
   Expect: unchanged (21/21 + 20/20 per Phase 4 baseline).
3. Run the orchestrator typecheck:
   `pnpm --filter @harness-engineering/orchestrator typecheck`
4. Run: `harness validate && harness check-deps`
5. Run the full orchestrator test suite, allowing the pre-existing 48 better-sqlite3 NODE_MODULE_VERSION failures:
   `pnpm --filter @harness-engineering/orchestrator test 2>&1 | tail -30`
   Confirm: total failures count is unchanged from Phase 4's 48-baseline (no Phase-5-induced regressions).
6. No commit (verification only).

---

## Integration Checklist

Per spec `Integration Points` section, Phase 5 touches the following:

| Integration Point    | Phase 5 Status                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| HTTP routes          | **DONE** — 3 new routes in `routes/v1/routing.ts` (Tasks 3-8), wired in `http.ts:buildApiRoutes` (Task 11)                    |
| WS topic             | **DONE** — `routing:decision` topic, subscribed in `OrchestratorServer.wireEvents()` (Task 11)                                |
| V1 bridge registry   | **DONE** — 3 entries in `v1-bridge-routes.ts` (Task 9)                                                                        |
| Token scopes         | **NO CHANGE** — reuses `read-telemetry` per D-OP-1 (no schema delta)                                                          |
| Barrel exports       | **NO CHANGE** — handler is internal, deep-imported per Phase 4 D-OP-precedent                                                 |
| Plugin manifests     | **DEFERRED to Phase 6** — `harness routing` CLI is the manifest-affecting surface; Phase 5 routes are dashboard/raw-HTTP-only |
| Dashboard route      | **DEFERRED to Phase 7**                                                                                                       |
| Docs + ADRs          | **DEFERRED to Phase 8**                                                                                                       |
| Knowledge enrichment | **DEFERRED to Phase 8**                                                                                                       |

---

## Risks & Mitigations

| Risk                                                                                                                                                                   | Likelihood | Mitigation                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trace route's bus-less router (Task 8 step 5) drifts from production router behavior over time (e.g., production gains a validation gate; trace skips it).             | Medium     | Acceptance test pins `decision.backendName` equality between trace and a subsequent real dispatch with the same useCase. Add a comment block to `routing.ts` noting that both routers MUST be constructed from identical `backends + routing` snapshots.                 |
| `recent()` latest-N flip breaks Phase 4 acceptance tests that pin oldest-N implicitly.                                                                                 | Low        | Task 1 verifies the existing test fixture first; if Phase 4 tests depended on oldest-N (unlikely — Phase 4 tests only assert count + filter, not order), update in lockstep before the impl change in Task 2.                                                            |
| WS broadcaster subscription at server construction races with the bus instantiation in `Orchestrator` constructor (which happens after `OrchestratorServer` is built). | Low        | `getRoutingDecisionBus` is a closure called at subscription time, not a captured reference. Verify the orchestrator constructs `routingDecisionBus` BEFORE `new OrchestratorServer(...)` (line 411 vs 533 — confirmed: 411 < 533).                                       |
| Trace endpoint accepts oversized bodies and exhausts memory.                                                                                                           | Low        | `readBody` already enforces `DEFAULT_MAX_BYTES`; trace bodies are <1KB in practice.                                                                                                                                                                                      |
| WS `routing:decision` broadcast is fired from a subscriber that runs synchronously on `bus.emit()` — could block dispatch if `broadcaster.broadcast()` is slow.        | Medium     | `WebSocketBroadcaster.broadcast()` is `for (const client of clients) client.send(message)` — non-blocking per `ws` library semantics. S6 isolation in the bus catches any subscriber throw. Document expected dispatch-path overhead at < 1ms with up to 100 WS clients. |

---

## Success Criteria (Final Gate)

- [ ] All 13 tasks committed (Task 13 is verification-only; 12 commits expected)
- [ ] Phase 5 acceptance test (Task 12) passes 6/6
- [ ] Phase 4 acceptance test passes 5/5 (no regressions)
- [ ] `decision-bus.test.ts` passes 7/7 (5 Phase 4 + 2 Phase 5)
- [ ] `routing.test.ts` passes ≥7 (config 2 + decisions 2 + trace 3)
- [ ] `harness validate` PASS
- [ ] `harness check-deps` PASS
- [ ] `pnpm --filter @harness-engineering/orchestrator typecheck` PASS
- [ ] Full orchestrator test failure count unchanged from Phase 4 baseline (48 pre-existing failures)
- [ ] F10 (WS broadcast latency < 100ms) verified by integration test
- [ ] Phase 4 review S1 (latest-N) + S2 (clearListeners) both closed

---

## Handoff Note for Phase 6 (CLI tools)

Phase 6 (`harness routing config|trace|decisions`) consumes the routes shipped here. Phase 5 surface is stable: filter param names (`skill`, `mode`, `backend`, `limit`), response shapes (`{ decisions }`, `{ routing, resolvedChains, backends }`, `{ decision, def: { type } }`), and the `read-telemetry` scope. The CLI will issue HTTP requests using the existing `harness` token machinery — no new auth wiring required.

Phase 6 should also add a `--strict` mode for trace that 400s on unknown-skill (deferred per C8). Phase 5's trace currently does not validate skill name against the catalog.
