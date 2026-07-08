# Plan: LMLM Phase 7 — HTTP routes + WS topics + notification sinks (+ S1 deferral)

**Date:** 2026-07-07 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Implementation Order Phase 7; Soundness Reconciliation 2026-07-07 is authoritative) | **Tasks:** 15 | **Time:** ~58 min | **Integration Tier:** large

**Skills (from SKILLS.md):** `ts-zod-integration` (apply), `ts-type-guards` / `gof-factory-method` / `ts-testing-types` (reference)

## Goal

Expose the LMLM pool, hardware, recommendations, and model-proposal queue over the orchestrator's HTTP + WebSocket + notification-sink surfaces so CLI, dashboard, and Slack operators all read one source of truth — and honor Safety invariant S1 (no mid-dispatch swap) by deferring an approved eviction of an in-use model until it drains.

## Prior context (already shipped on `feat/lmlm-wire-operator-surfaces`, HEAD `83db05a34`)

- Phase 6 shipped `POST /api/v1/local-models/refresh` (`routes/v1/local-models.ts` → `handleV1LocalModelsRoute`), the `getModelPool()` / `getRefreshScheduler()` `ServerDependencies` accessors, and the live `PoolManager` + `RefreshScheduler` wiring in `orchestrator.ts`.
- Phase 5/6 shipped **kind-aware** approve/reject on the **shared** `/api/v1/proposals/:id/{approve,reject}` route (`routes/v1/proposals.ts`), reaching the live pool via `onApproveModelProposal` / `onRejectModelProposal` (`proposals/model-handlers.ts`, topics `MODEL_PROPOSAL_TOPIC='local-models:proposal'`, `MODEL_POOL_TOPIC='local-models:pool'`).
- The WS broadcaster (`server/websocket.ts`) + notification sinks (`notifications/{events,envelope,registry,slack-sink}.ts`) exist and are reused, not rebuilt.
- The `/api/v1/local-model(s)/status` routes (`routes/local-model.ts`) stay intact; new routes are additive.

## Key decisions (resolved during scope; recorded here + in handoff)

### D-Q1 — `GET /api/v1/local-models/proposals` is a NEW filtered route, not a reuse of `/api/v1/proposals`

The shared `GET /api/v1/proposals?status=open` returns **all** kinds and forces client-side filtering. The dashboard's Recommendations card wants a pending, model-only feed. Add a kind-scoped GET inside the existing `handleV1LocalModelsRoute` dispatcher that reuses core `listProposals(projectPath, { status: 'open' })` and filters `kind === 'model'`. Low cost, cohesive with the other four local-models GETs. (`V1LocalModelsDeps` already declares an optional `listModelProposals` seam.)

### D-Q2 — NO local-models-scoped approve/reject routes; the shared route suffices

`routes/v1/proposals.ts` already dispatches `kind: 'model'` approve/reject to the live pool (`existing.kind === 'model'` → `onApprove/onRejectModelProposal`) with terminal-state guards and 501/422 fallbacks. Adding `/api/v1/local-models/proposals/:id/{approve,reject}` would duplicate that handler and split the write path. **We do not add them.** The spec's route table lists them; the Soundness Reconciliation ("routes are additive… WS layer and notification envelope already exist and are reused") plus the explicit "avoid duplicate handlers" instruction override the table. This is documented in ADR 0060 (Task 13).

### D10 / S1 — "No mid-dispatch swap": recommendation is **(a), scoped, with a conservative probe + ADR**

Investigation of the orchestrator's dispatch tracking:

- `orchestrator.ts` `state.running` is a **GitHub-issue-keyed agent-run map** (`getSnapshot()` → `running: Array.from(this.state.running.entries())`, `maxConcurrentAgents`). It tracks spawned agent runs, **not** per-model inference requests.
- `local-model-resolver.ts` has only `probeInFlight` (a single health-probe dedup), not request tracking.
- The webhook `inFlight` counters are unrelated (delivery concurrency).
- **There is no per-model / per-request in-flight signal today.** The spec's "orchestrator's existing dispatch tracking provides the signal" is not literally true for local models at request granularity.

However a **coarse but sound** signal exists: `getLocalModelStatuses()` exposes each resolver's currently-resolved local model, and `state.running.size` says whether any agent run is live. A conservative probe — "defer if any run is active **and** the eviction target equals a currently-resolved local model" — never evicts a model an agent could be using. It may **over-defer** (a safe failure: the swap waits for idle), which is exactly S1's intent.

**Recommendation (prefer (a), as instructed):** implement the `pendingEviction` deferral machinery behind an injectable `isModelInUse(ollamaName)` probe, cover S1 with a **fake-probe** integration test (matching the spec's "fake long-running dispatch"), wire a conservative best-effort production probe, and write ADR 0060 documenting that the production signal is agent-run-coarse (not per-request) and may over-defer, with the fine-grained signal explicitly deferred. `pendingEviction` is surfaced on the API/WS **view** only (transient `Set` in `PoolManager`), never persisted — matching the existing design note in `pool/types.ts` ("Transient status … lives on a separate runtime record … so a crash mid-pull cannot leave a stale flag pinned on disk"). Note: `cloneEntry` in `pool/state.ts` spreads all fields, so `pendingEviction` must NOT be attached to persisted entries — it is overlaid at `viewState()` time only.

## Observable Truths (Acceptance Criteria)

1. **When** an authorized `GET /api/v1/local-models/hardware` request arrives while LMLM is enabled, the system shall respond `200` with the current `HardwareProfile`; **if** LMLM is disabled, it shall respond `503 { error: 'LMLM disabled' }`. (Tasks 1–4)
2. **When** `GET /api/v1/local-models/pool` arrives while LMLM is enabled, the system shall respond `200` with the `PoolState` view including any `pendingEviction: true` entries; disabled → `503`. (Tasks 1, 11)
3. **When** `GET /api/v1/local-models/recommendations?top=N&profile=general|coding|reasoning` arrives, the system shall respond `200` with a `RankedModel[]` (empty until the Phase 2 candidate parser lands) after validating `top` (positive int) and `profile` (enum); invalid params → `400`; disabled → `503`. (Tasks 1, 3, 4)
4. **When** `GET /api/v1/local-models/proposals` arrives, the system shall respond `200` with only `kind: 'model'`, `status: 'open'` proposals. (Tasks 1, 3, 4)
5. The system shall register all four new GET routes as v1 bridge primitives so the `/api/v1` URL-rewrite shim does not misroute them to the legacy `/api/local-models` status handler, and shall default-deny (403) any caller lacking the mapped read scope. (Task 2)
6. **When** the model-handler bus emits `local-models:proposal` or `local-models:pool`, the system shall broadcast a matching WS frame to every `/ws` client. (Task 5)
7. **When** the background scheduler emits a new model proposal, the system shall emit `local-models:proposal { status: 'created', id, … }` on the bus (which fans out to WS + sinks). (Task 6)
8. **Where** a notification sink subscribes to model-proposal events, the system shall deliver a `local-models.proposal` envelope whose title/summary/severity vary by `data.status` (`created`/`rejected`/`failed_target_missing`). (Task 7)
9. **If** an approved swap/evict targets a model the probe reports in use, then the system shall not call `pool.evict`; it shall mark the entry `pendingEviction: true`, emit `local-models:pool { phase: 'evict_deferred' }`, and complete the eviction only once the probe reports the model idle (drain). (Tasks 8–12)
10. The system shall verify S1 end-to-end via an integration test using a fake in-use probe (pull → fake dispatch → approve swap → observe deferral → drain → evict). (Task 12)
11. The system shall pass `harness validate` at every task and add no new tree-wide validate regressions beyond the pre-existing baseline. (all tasks)

## File Map

- MODIFY `packages/orchestrator/src/server/routes/v1/local-models.ts` — add 4 GET handlers + deps
- MODIFY `packages/orchestrator/tests/server/routes/v1/local-models.test.ts` — route tests
- MODIFY `packages/orchestrator/src/server/v1-bridge-routes.ts` — register 4 GET bridge routes
- MODIFY `packages/orchestrator/tests/server/routes/v1-bridge-routes.test.ts` (or existing bridge test) — scope + rewrite-skip assertions
- MODIFY `packages/orchestrator/src/server/http.ts` — new `ServerDependencies` accessors; thread into route table + WS subscriptions
- MODIFY `packages/orchestrator/tests/server/http*.test.ts` — WS-broadcast test
- MODIFY `packages/orchestrator/src/orchestrator.ts` — wire accessors, store recommender, emitProposal bus-emit, S1 probe + drain
- MODIFY `packages/orchestrator/src/notifications/events.ts` — add `local-models:proposal` topic
- MODIFY `packages/orchestrator/src/notifications/envelope.ts` — add `local-models.proposal` deriver
- MODIFY `packages/orchestrator/src/notifications/envelope.test.ts` + `events.test.ts` — deriver/topic tests
- MODIFY `packages/local-models/src/pool/manager.ts` — transient `pendingEviction` set + `viewState()`
- MODIFY `packages/local-models/src/pool/types.ts` — `PoolEntryView` / `PoolStateView`
- MODIFY `packages/local-models/src/pool/index.ts` — export view types
- MODIFY `packages/local-models/tests/pool/manager.test.ts` — overlay tests
- MODIFY `packages/orchestrator/src/proposals/model-handlers.ts` — `isModelInUse` seam + deferral branch
- MODIFY `packages/orchestrator/tests/proposals/model-handlers.test.ts` — deferral unit tests
- CREATE `packages/orchestrator/tests/server/lmlm-phase7-e2e.test.ts` — S1 + WS/sink smoke
- CREATE `docs/knowledge/decisions/0060-lmlm-operator-surfaces-and-dispatch-safe-eviction.md` — ADR
- MODIFY `AGENTS.md` — orchestrator LMLM surface section

## Skeleton (standard rigor, 15 tasks ≥ 8 → skeleton produced)

1. **GET route dispatcher + bridge registration** (Tasks 1–2, ~10 min) — the 4 new GETs + rewrite-skip/scope.
2. **Accessors + orchestrator wiring** (Tasks 3–4, ~8 min) — `getHardwareProfile`/`getRecommendations`/`listModelProposals`.
3. **WS broadcast** (Tasks 5–6, ~8 min) — bus→WS fan-out + new-proposal emit.
4. **Notification sink** (Task 7, ~4 min) — `local-models.proposal` event type.
5. **S1 pendingEviction deferral** (Tasks 8–12, ~22 min) — pool view overlay, probe seam, drain wiring, integration test.
6. **Integration/docs** (Tasks 13–15, ~10 min) — ADR, AGENTS.md, e2e smoke.

_Skeleton approved: pending (autonomous invocation — written for human review at sign-off)._

## Tasks

### Task 1: Add four GET handlers to the local-models route dispatcher

**Depends on:** none | **Files:** `packages/orchestrator/src/server/routes/v1/local-models.ts`, `packages/orchestrator/tests/server/routes/v1/local-models.test.ts` | **Skills:** `ts-type-guards`, `ts-zod-integration`

1. In `local-models.ts`, extend `V1LocalModelsDeps` with:
   ```ts
   getModelPool?: () => { snapshot(): PoolState; viewState?: () => PoolStateView } | null;
   getHardwareProfile?: () => Promise<HardwareProfile> | null;
   getRecommendations?: (opts: { top: number; profile: 'general' | 'coding' | 'reasoning' }) => Promise<RankedModel[]>;
   listModelProposals?: () => Promise<Proposal[]>; // already declared — keep
   ```
   Import the types from `@harness-engineering/local-models` and `@harness-engineering/types`.
2. Add anchored regexes: `HARDWARE_RE`, `POOL_RE`, `RECS_RE`, `PROPOSALS_RE` (all `^\/api\/v1\/local-models\/<name>(?:\?.*)?$`).
3. In `handleV1LocalModelsRoute`, before the POST refresh branch, add a `method === 'GET'` block dispatching each regex to an async handler:
   - `hardware` → `deps.getHardwareProfile?.() ?? null`; null → `503 { error: 'LMLM disabled' }`; else `200` with the awaited profile.
   - `pool` → `deps.getModelPool?.() ?? null`; null → `503`; else `200` with `pool.viewState?.() ?? pool.snapshot()`.
   - `recommendations` → parse `top` (default 10, must be positive int → else `400`) and `profile` (default `'general'`, must be in the enum → else `400`); `deps.getRecommendations` absent → `503`; else `200` with the awaited array.
   - `proposals` → `deps.listModelProposals` absent → `503`; else `200` with the awaited list (already model-only; see Task 4).
     Reuse the existing `sendJSON` helper. Wrap each async handler in try/catch → `500 { error, detail }`.
4. Write/extend tests in `local-models.test.ts`: for each route assert 200 payload (via fake deps), 503 when the accessor is null, and 400 for `recommendations?top=-1` / `?profile=bogus`.
5. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/server/routes/v1/local-models.test.ts`
6. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
7. Run: `harness validate`
8. Commit: `feat(orchestrator): add GET local-models hardware/pool/recommendations/proposals routes`

### Task 2: Register the four GET routes as v1 bridge primitives

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/server/v1-bridge-routes.ts`, its test | **Category:** integration

> Load-bearing: `local-models` is in `V1_WRAPPABLE`, so without a bridge entry the `/api/v1` rewrite shim rewrites `/api/v1/local-models/hardware` → `/api/local-models/hardware` and misroutes it to the legacy status handler. `isV1Bridge` short-circuits the rewrite, and `requiredBridgeScope` supplies the scope for default-deny. This mirrors the existing `refresh` bridge entry.

1. Append four `V1BridgeRoute` entries to `V1_BRIDGE_ROUTES` (method `GET`, anchored patterns matching Task 1), each `scope: 'read-status'`, with descriptions.
2. Add a test asserting `isV1Bridge('GET', '/api/v1/local-models/pool') === true` and `requiredBridgeScope('GET', '/api/v1/local-models/pool') === 'read-status'` for all four.
3. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/server/routes/v1-bridge-routes.test.ts`
4. Run: `harness validate`
5. Commit: `feat(orchestrator): register local-models GET routes as v1 bridge primitives`

### Task 3: Add `ServerDependencies` accessors + thread them into the route table

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/server/http.ts` | **Skills:** `gof-factory-method`

1. Add to `ServerDependencies`: `getHardwareProfile?: () => Promise<HardwareProfile> | null`, `getRecommendations?: (opts: { top: number; profile: 'general'|'coding'|'reasoning' }) => Promise<RankedModel[]>`, `listModelProposals?: () => Promise<Proposal[]>`. Import the types.
2. Add matching private fields + `initDependencies` assignments (null-coalesced), mirroring `getModelPoolFn` / `getRefreshSchedulerFn`.
3. In `buildApiRoutes`, extend the `handleV1LocalModelsRoute` call to pass `getModelPool: () => this.getModelPoolFn?.() ?? null`, `getHardwareProfile`, `getRecommendations`, and `listModelProposals` from the stored fns (omit undefined via spread, matching the existing style).
4. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
5. Run: `harness validate`
6. Commit: `feat(orchestrator): thread hardware/recommendations/proposals accessors into server deps`

### Task 4: Wire the accessors in `orchestrator.ts`

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/orchestrator.ts` | **Skills:** `ts-zod-integration`

1. Store the recommender: promote the `createNativeRecommender({ candidates: [] })` local in `startRefreshScheduler` to a field `this.modelRecommender` set in `initModelPool`/scheduler start (null when LMLM disabled).
2. In the `new OrchestratorServer(..., deps)` construction (near existing `getModelPool`/`getRefreshScheduler`), add:
   - `getHardwareProfile: () => (this.modelPool ? this.detectLmlmHardware() : null)`
   - `getRecommendations: async ({ top, profile }) => { if (!this.modelRecommender) return []; const hw = await this.detectLmlmHardware(); return this.modelRecommender.recommend(hw, { top, profile }); }` — adapt to the actual `recommend` signature; if it takes only `hardware`, slice to `top` and ignore `profile` (document the Phase 2 gap inline).
   - `listModelProposals: () => listProposals(this.projectRoot, { status: 'open' }).then((ps) => ps.filter((p) => p.kind === 'model'))`
3. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/server/routes/v1/local-models.test.ts` (add an integration-style case wiring a fake orchestrator if practical) and `pnpm --filter @harness-engineering/orchestrator typecheck`
4. Run: `harness validate`
5. Commit: `feat(orchestrator): wire live hardware/recommendations/model-proposal accessors`

### Task 5: Fan out `local-models:{proposal,pool}` bus topics to WS clients

**Depends on:** none | **Files:** `packages/orchestrator/src/server/http.ts`, a WS-broadcast test | **Skills:** `gof-chain-of-responsibility`

1. In `wireEvents()`, after the `routing:decision` subscription, add (the model handlers emit on `this.orchestrator` since `bus` === the orchestrator EventEmitter):
   ```ts
   const onModelProposal = (d: unknown) => this.broadcaster.broadcast('local-models:proposal', d);
   const onModelPool = (d: unknown) => this.broadcaster.broadcast('local-models:pool', d);
   this.orchestrator.on('local-models:proposal', onModelProposal);
   this.orchestrator.on('local-models:pool', onModelPool);
   ```
   Store the two listeners on private fields and `removeListener` them in `stop()` (before `broadcaster.close()`), matching the `routingDecisionUnsubscribe` teardown discipline.
2. Add a test: emit `local-models:pool` on the orchestrator bus and assert a connected fake WS client receives `{ type: 'local-models:pool', data }`.
3. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/server/http.test.ts` (or the WS test file), then `pnpm --filter @harness-engineering/orchestrator typecheck`
4. Run: `harness validate`
5. Commit: `feat(orchestrator): broadcast local-models proposal/pool bus events to WS clients`

### Task 6: Emit `local-models:proposal { status: 'created' }` when the scheduler emits a proposal

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/orchestrator.ts`, scheduler-wiring test

1. In `startRefreshScheduler`, change the `emitProposal` seam from `createModelProposal(...).then(() => undefined)` to capture the returned record and emit on the bus:
   ```ts
   emitProposal: (c) =>
     createModelProposal(this.projectRoot, c).then((record) => {
       this.emit('local-models:proposal', {
         id: record.id, status: 'created', action: c.action, target: c.target.ollamaName,
       });
     }),
   ```
   (Reference `MODEL_PROPOSAL_TOPIC` from `proposals/model-handlers.ts` for the literal rather than hardcoding, if importable without a cycle.)
2. Add/extend a test asserting a scheduler tick that emits a proposal fires `local-models:proposal` with `status: 'created'` on the bus.
3. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run` (scheduler test path), then `typecheck`
4. Run: `harness validate`
5. Commit: `feat(orchestrator): emit local-models:proposal on new-proposal creation`

### Task 7: Add the `local-models.proposal` notification event type

**Depends on:** none | **Files:** `packages/orchestrator/src/notifications/events.ts`, `envelope.ts`, `envelope.test.ts`, `events.test.ts` | **Skills:** `ts-type-guards`

1. In `events.ts`, add `'local-models:proposal'` to `NOTIFICATION_TOPICS` (the `.replace(':', '.')` normalization yields event type `local-models.proposal`).
2. In `envelope.ts`, add a `ModelProposalEventData` interface (`id?`, `status?`, `action?`, `target?`, `reason?`) and a `'local-models.proposal'` deriver that branches on `data.status`:
   - `created` → `title: 'New model proposal: <action> <target>'`, `severity: 'info'`
   - `rejected` → `title: 'Model proposal rejected'`, summary from `reason`, `severity: 'warning'`
   - `failed_target_missing` → `title: 'Model proposal target missing'`, `severity: 'error'`
   - default → generic info title.
3. Add tests: `wrapAsEnvelope` for each status; `events.test.ts` asserts a `local-models:proposal` bus emit reaches a registered fake sink.
4. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/notifications/envelope.test.ts src/notifications/events.test.ts`, then `typecheck`
5. Run: `harness validate`
6. Commit: `feat(orchestrator): deliver model-proposal notifications via sink registry`

### Task 8: PoolManager transient `pendingEviction` overlay + `viewState()`

**Depends on:** none | **Files:** `packages/local-models/src/pool/manager.ts`, `pool/types.ts`, `pool/index.ts`, `packages/local-models/tests/pool/manager.test.ts` | **Skills:** `ts-testing-types`

> `pendingEviction` must never reach persisted entries — `cloneEntry` in `pool/state.ts` spreads all fields, so keep the flag in a manager-owned `Set<string>` and overlay it only in `viewState()`.

1. In `pool/types.ts`, add `export interface PoolEntryView extends PoolEntry { pendingEviction?: boolean }` and `export interface PoolStateView extends Omit<PoolState, 'entries'> { entries: PoolEntryView[] }`.
2. In `manager.ts`, add a private `pendingEvictions = new Set<string>()` plus methods:
   - `markPendingEviction(ollamaName: string): void`
   - `clearPendingEviction(ollamaName: string): void`
   - `listPendingEvictions(): string[]`
   - `viewState(): PoolStateView` — clone `snapshot()` and set `pendingEviction: true` on entries whose `ollamaName ∈ pendingEvictions`.
3. Export the view types from `pool/index.ts`.
4. Tests: mark an entry, assert `viewState()` shows `pendingEviction: true` while `snapshot()` (and a subsequent `persist`) does NOT carry the flag; clear removes it.
5. Run: `pnpm --filter @harness-engineering/local-models exec vitest run tests/pool/manager.test.ts`, then `pnpm --filter @harness-engineering/local-models typecheck`
6. Run: `harness validate`
7. Commit: `feat(local-models): transient pendingEviction overlay on PoolManager.viewState`

### Task 9: `isModelInUse` probe seam + deferral branch in model-handlers

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/proposals/model-handlers.ts`, `packages/orchestrator/tests/proposals/model-handlers.test.ts` | **Skills:** `gof-factory-method`, `ts-testing-types`

1. Extend `ModelPoolOps` with `markPendingEviction(ollamaName: string): void` (PoolManager already satisfies it after Task 8).
2. Add to `ModelHandlerDeps`: `isModelInUse?: (ollamaName: string) => boolean` (default `() => false`).
3. In `onApproveModelProposal`, before each real `deps.pool.evict(...)` (both the `swap`'s `replaces` evict and `applyEvictOnly`'s target evict), consult the probe:
   - If in use → `deps.pool.markPendingEviction(<name>)`, record approval, emit `MODEL_POOL_TOPIC` with `phase: 'evict_deferred'` and the deferred name, and return `{ status: 'approved', … , evicted: [] }` (install already applied for swaps; only the evict defers).
   - If idle → existing evict path unchanged.
4. Tests: fake pool + `isModelInUse: () => true` → asserts `markPendingEviction` called, `evict` NOT called, `evict_deferred` event emitted; `() => false` → existing evict path unchanged (regression).
5. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/proposals/model-handlers.test.ts`, then `typecheck`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): defer eviction of in-use models in model-proposal approve`

### Task 10: Orchestrator production probe + drain wiring

**Depends on:** Task 9 | **Files:** `packages/orchestrator/src/orchestrator.ts` | **Skills:** `ts-type-guards`

1. Add a conservative probe method `private isLocalModelInUse(ollamaName: string): boolean` — returns `true` when `this.state.running.size > 0` AND `this.getLocalModelStatuses().some((s) => s.resolved === ollamaName || s.detected?.includes(ollamaName))` (adapt to the real `NamedLocalModelStatus` field names). Document inline that this is agent-run-coarse (may over-defer) per ADR 0060.
2. Thread `isModelInUse: (n) => this.isLocalModelInUse(n)` into the `handleV1ProposalsRoute` deps built in `http.ts` — extend the `modelPool ? { modelPool } : {}` spread site with an `isModelInUse` accessor on `ServerDependencies` (add `getIsModelInUse?` or a direct `isModelInUse?` dep, mirroring `getModelPool`). Pass it through `Deps` in `routes/v1/proposals.ts` → `modelHandlerDeps`.
3. Add a drain path: `private drainDeferredEvictions(): void` iterating `this.modelPool.listPendingEvictions()`, evicting any whose `isLocalModelInUse` is now false (`await pool.evict`, `clearPendingEviction`, emit `local-models:pool { phase: 'evict_completed' }`). Call it from the run-completion path (where `this.state.running.delete(...)` happens) — best-effort, never blocks dispatch.
4. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` and the proposals route test.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): wire conservative in-use probe + deferred-eviction drain`

### Task 11: `GET /api/v1/local-models/pool` surfaces `pendingEviction`

**Depends on:** Task 8, Task 1 | **Files:** `packages/orchestrator/src/server/routes/v1/local-models.ts`, its test

1. Confirm the pool GET handler (Task 1) calls `pool.viewState?.() ?? pool.snapshot()` so `pendingEviction` entries appear in the response. Add a test with a fake pool whose `viewState()` returns an entry with `pendingEviction: true` and assert it is present in the `200` body.
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/server/routes/v1/local-models.test.ts`, then `typecheck`
3. Run: `harness validate`
4. Commit: `test(orchestrator): assert GET local-models/pool surfaces pendingEviction`

### Task 12: S1 integration test (fake probe → defer → drain)

**Depends on:** Task 10, Task 11 | **Files:** `packages/orchestrator/tests/server/lmlm-phase7-e2e.test.ts` | **Skills:** `ts-testing-types`, `next-testing-patterns`

1. Create the e2e test: construct a real `PoolManager` over a fake installer with two entries (target + replaces). Build `ModelHandlerDeps` with a controllable `isModelInUse` closure (returns `true` for `replaces` initially). Approve a `swap` proposal via `onApproveModelProposal`.
2. Assert: install applied, `replaces` NOT evicted, `viewState()` shows `replaces.pendingEviction === true`, and an `evict_deferred` bus event fired.
3. Flip the probe to `false`, invoke the drain path, assert `replaces` is evicted, flag cleared, and `evict_completed` fired.
4. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/server/lmlm-phase7-e2e.test.ts`, then `typecheck`
5. Run: `harness validate`
6. Commit: `test(orchestrator): S1 no-mid-dispatch-swap deferral + drain integration`

### Task 13: ADR 0060 — operator surfaces + dispatch-safe eviction

**Depends on:** Task 12 | **Files:** `docs/knowledge/decisions/0060-lmlm-operator-surfaces-and-dispatch-safe-eviction.md` | **Category:** integration

1. Write ADR 0060 covering: (a) the four additive GET routes + why they are bridge primitives; (b) D-Q2 — no duplicate local-models approve/reject (shared route suffices); (c) the WS `local-models:{proposal,pool}` fan-out + `local-models.proposal` sink event type; (d) **S1 decision**: `pendingEviction` transient overlay + injectable probe, conservative agent-run-coarse production signal that may over-defer, fine-grained per-request signal deferred as a known gap. Reference F4(d), F11, S1, S7.
2. Run: `harness validate`
3. Commit: `docs(lmlm): ADR 0060 operator surfaces + dispatch-safe eviction`

### Task 14: Update AGENTS.md with the Phase 7 surface

**Depends on:** Task 13 | **Files:** `AGENTS.md` | **Category:** integration

1. In the orchestrator domain section, document the new `/api/v1/local-models/{hardware,pool,recommendations,proposals}` GETs, the `local-models:{proposal,pool}` WS topics, the `local-models.proposal` sink event, and the S1 deferral behavior. One concise paragraph + the route list.
2. Run: `harness validate`
3. Commit: `docs(agents): document LMLM Phase 7 HTTP/WS/notification surface`

### Task 15: End-to-end WS + sink smoke test

**Depends on:** Task 6, Task 7, Task 10 | **Files:** `packages/orchestrator/tests/server/lmlm-phase7-e2e.test.ts` (extend) | **Category:** integration | **Skills:** `next-testing-patterns`

1. Extend the e2e test: stand up an `OrchestratorServer` with a fake orchestrator bus + a registered fake sink; emit `local-models:proposal { status: 'created' }` on the bus; assert (a) a connected `/ws` client receives the `local-models:proposal` frame and (b) the fake sink `deliver` was called with the `local-models.proposal` envelope. This is the spec's Phase 7 checkpoint smoke ("change pool → observe WS broadcast → observe sink delivery").
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/server/lmlm-phase7-e2e.test.ts`, then `typecheck`
3. Run: `harness validate`
4. Commit: `test(orchestrator): Phase 7 WS + sink delivery smoke`

## Uncertainties

- [ASSUMPTION] The recommender's `recommend` signature accepts (or can ignore) a `{ top, profile }` options object. If it takes only `hardware`, Task 4 slices to `top` and drops `profile` with an inline Phase 2 note. (Verify in `recommender/native.ts` at execution.)
- [ASSUMPTION] `NamedLocalModelStatus` exposes the currently-resolved local model name (`resolved`/`detected`) usable by the Task 10 probe. If the field names differ, adapt the predicate; the probe's contract (over-defer-safe) is unchanged.
- [DEFERRABLE] `GET /recommendations` returns `[]` until the Phase 2 live-HF→candidate parser lands (candidates seeded empty in `startRefreshScheduler`). The route contract is still satisfied. Flagged as a concern.
- [DEFERRABLE] The S1 production probe is agent-run-coarse (not per-request) and may over-defer; the fine-grained signal is an explicit ADR-0060 known gap.

## Notes on baseline

Pre-existing, not attributable to Phase 7: ~391 tree-wide `harness validate` findings (dashboard/graph hardcoded-color warnings), a non-blocking arch fail on `orchestrator.ts`, and dirty `.harness` baseline files. `harness validate` currently passes (`v validation passed`). Watch arch complexity on `http.ts` and `orchestrator.ts` — prefer small helper methods over inline growth (Tasks 5/10).
