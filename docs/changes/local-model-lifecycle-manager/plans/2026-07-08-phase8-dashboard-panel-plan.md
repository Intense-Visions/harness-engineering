# Plan: LMLM Phase 8 — Dashboard panel (`/local-models`)

**Date:** 2026-07-08 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Implementation Order Phase 8; Technical Design "Dashboard panel"; Soundness Reconciliation 2026-07-07 is authoritative) | **Tasks:** 8 | **Time:** ~34 min | **Integration Tier:** medium

**Branch:** `feat/lmlm-wire-operator-surfaces` (Phases 4–7 complete, HEAD `e19d71721`)

## Goal

Give web operators the same LMLM UX as CLI operators: a `/s/local-models` dashboard panel with Hardware, Pool, and Recommendations (+ pending model proposals) cards, seeded from the Phase 7 HTTP read surface and kept live via the existing `local-models:{pool,proposal}` WebSocket fan-out — rendering cleanly in every empty/degraded state (O3).

## Prior context (already shipped on `feat/lmlm-wire-operator-surfaces`)

- **Read routes (Phase 7, `orchestrator/src/server/routes/v1/local-models.ts`):** `GET /api/v1/local-models/{hardware,pool,recommendations,proposals}`. Each returns `503 { error: 'LMLM disabled' }` when its accessor is null, `200` with the payload otherwise. `pool` returns a `PoolStateView` (entries carry transient `pendingEviction?: true`). `recommendations` returns `RankedModel[]` — **empty `[]` until the Phase 2 candidate parser lands** (documented limitation). `proposals` is kind-scoped model-only, status `open`.
- **Write path (Phase 5/6, shared route `routes/v1/proposals.ts`):** `POST /api/v1/proposals/:id/{approve,reject}` already dispatches `kind: 'model'` to the live pool via `onApprove/onRejectModelProposal`, with terminal-state guards. **No local-models-scoped write routes exist** (Phase 7 D-Q2) and this plan does not add any.
- **WS fan-out (Phase 7, `server/http.ts:354-364`):** the orchestrator bus topics `local-models:proposal` (`MODEL_PROPOSAL_TOPIC`) and `local-models:pool` (`MODEL_POOL_TOPIC`) are re-broadcast to every `/ws` client as `{ type, data }` frames. **These frames are change _signals_ (deltas), not full-state snapshots** — e.g. `{ id, status:'created', action, target }` for proposal; `{ action, phase, evicted?, deferred? }` for pool.

## Dashboard architecture (verified this session — tasks reference real files)

- **Build:** Vite (`vite.config.ts`, `chunkSizeWarningLimit: 700`). Client entry `src/client/main.tsx` uses `react-router` v7. Routes are `/t/:threadId` and `/s/:systemPage`; extra flat paths are legacy redirects in `main.tsx`.
- **Page registration (2 points):**
  1. `src/client/components/layout/ThreadView.tsx` → `SYSTEM_PAGE_COMPONENTS` record (systemPage slug → component).
  2. `src/client/types/thread.ts` → `SYSTEM_PAGES` `as const` array (drives the sidebar nav **and** the `SystemPage` union type).
- **HTTP fetch:** pages call `fetch('/api/v1/...')` directly (see `pages/Proposals.tsx`); `hooks/useApi.ts` is a POST helper.
- **WS client pattern:** `hooks/useLocalModelStatuses.ts` — HTTP seed + own `WebSocket('/ws')` with exponential-backoff reconnect, `onmessage` narrows `msg.type` against the `WebSocketMessage` union in `src/client/types/orchestrator.ts`. **The union does not yet carry the two local-models topics** — Task 1 adds them.
- **Types:** the dashboard maintains hand-mirrored client types under `src/client/types/` (e.g. `orchestrator.ts`) rather than importing runtime packages into the browser bundle. `ModelProposalRecord` / `Proposal` are already available from `@harness-engineering/types` (an existing dep). `HardwareProfile` / `PoolStateView` / `RankedModel` live in `@harness-engineering/local-models`, which is **not** a dashboard dep and pulls Node-only code (`child_process`, `system_profiler`) through its barrel.
- **Test harness:** vitest (`vitest.config.mts`, client project = jsdom) + `@testing-library/react`. Fetch mocked via `vi.spyOn(globalThis, 'fetch')`; WebSocket mocked via a `FakeWebSocket` class + `vi.stubGlobal('WebSocket', FakeWebSocket)` (see `tests/client/hooks/useLocalModelStatuses.test.ts`).
- **Scripts:** `pnpm --filter @harness-engineering/dashboard typecheck | test | build`.

## Key decisions (resolved during scope — recorded here + in handoff)

### D-P8-1 — Client-side type mirror, not a new `@harness-engineering/local-models` dependency

Importing values from `@harness-engineering/local-models` into the browser bundle would drag Node-only detector code (`child_process`) through Vite. `import type` is erased, but the codebase convention is a hand-maintained client mirror (`src/client/types/orchestrator.ts`). **Decision:** create `src/client/types/local-models.ts` mirroring only the fields the panel renders (`HardwareProfile`, `PoolStateView`/`PoolEntryView`, `RankedModel`) plus the two WS event delta shapes. Model proposals reuse `ModelProposalRecord` from `@harness-engineering/types` (already a dep). Tradeoff: the mirror must be kept in sync with the source types — acceptable since these are frozen Phase-1/2/3 shapes; a comment cross-links the source of truth.

### D-P8-2 — Pool card is READ-ONLY in Phase 8; pool mutation is proposal-driven

The spec's Pool card lists "install/evict actions", but **no HTTP install/evict route exists** — direct install/evict is CLI-only (`harness models install/evict`), and Phase 7 D-Q2 explicitly forbade inventing local-models-scoped write routes. Pool _mutations_ reach the dashboard through the **proposal approve/reject** path (add/swap/evict proposals on the Recommendations card → shared `/api/v1/proposals/:id/{approve,reject}`). **Decision:** the Pool card renders entries, disk-used-vs-budget, and `pendingEviction` badges (read-only). Direct install/evict buttons are deferred — building them requires new backend routes that are out of Phase 8 scope and contra D-Q2. Flagged as a concern for sign-off.

### D-P8-3 — WS frames are signals; the panel refetches on receipt

Pool/proposal WS frames are deltas, not full state. **Decision:** the data hook treats any `local-models:pool` frame as "refetch pool + recommendations" and any `local-models:proposal` frame as "refetch proposals + recommendations". This is robust (no partial-state merge bugs) and matches the Phase 7 emit shapes. Recommendations is refetched on both because an approved add/swap changes the ranked set.

### D-P8-4 — Degraded is per-card, not per-panel

Each of the four GETs can independently 503 (LMLM disabled) or fail. **Decision:** the hook tracks per-endpoint `{data, error}`; a 503/failure on one endpoint degrades only its card. The panel itself never throws (O3). A global "LMLM disabled" banner shows when _all four_ return 503.

## Uncertainties

- **[RESOLVED → D-P8-2]** Pool card install/evict actions — no HTTP route exists; resolved to read-only + proposal-driven mutation. **Requires sign-off** (deviates from the spec's literal card description).
- **[ASSUMPTION]** The shared `POST /api/v1/proposals/:id/approve` for a `kind:'model'` proposal does **not** require a prior soundness-gate run (unlike skill proposals, whose dashboard `canApprove` gates on `gate-running` + no errors). Evidence: `proposals.ts:163` dispatches model approve directly to `onApproveModelProposal` with only a terminal-state guard. The Recommendations card therefore enables Approve/Reject immediately for open model proposals. If a gate step is later added for model proposals, Task 5 needs revision.
- **[DEFERRABLE]** Exact copy/labels and Tailwind classes for the cards. The dashboard already carries pre-existing design-token warnings; Phase 8 must add **no new** ones but wording is finalizable during implementation.

## Observable Truths (Acceptance Criteria)

1. When the operator navigates to `/s/local-models` (or `/local-models`, which redirects), the system shall render a panel containing Hardware, Pool, and Recommendations cards. (Tasks 6, 7)
2. **[O3]** While the pool is empty **and/or** hardware GET returns `503` **and/or** recommendations returns `[]`/`503`, the system shall render the panel without throwing, and each affected card shall show a sensible empty/degraded state. Verified by a page-level test exercising all three fixtures. (Task 6)
3. Where `GET /api/v1/local-models/recommendations` returns `[]` (pre-Phase-2), the Recommendations card shall render "No recommendations yet" rather than an error or blank region. (Tasks 5, 6)
4. When a `local-models:pool` WS frame arrives, the system shall refetch pool + recommendations and update the Pool card, including `pendingEviction` badges. (Tasks 2, 4)
5. When a `local-models:proposal` WS frame arrives, the system shall refetch the model-proposal feed + recommendations and update the Recommendations card. (Tasks 2, 5)
6. When the operator clicks Approve or Reject on an open model proposal, the system shall `POST /api/v1/proposals/:id/{approve,reject}` and refetch on success. (Task 5)
7. The Pool card shall display entries, disk-used-vs-budget, and `pendingEviction` badges, and shall expose no direct install/evict controls (D-P8-2). (Task 4)
8. When all four GETs return `503`, the system shall show a single "LMLM disabled" state rather than four separate error cards. (Tasks 2, 6)
9. The system shall register `local-models` in `SYSTEM_PAGE_COMPONENTS` and `SYSTEM_PAGES` (sidebar + `SystemPage` type) and add a `/local-models → /s/local-models` legacy redirect. (Task 7)
10. `pnpm --filter @harness-engineering/dashboard typecheck && test && build` pass, and `harness validate` adds **no new** tree-wide issues beyond the ~391 pre-existing baseline (incl. no new dashboard design-token warnings). (all tasks)

## File Map

- CREATE `packages/dashboard/src/client/types/local-models.ts`
- MODIFY `packages/dashboard/src/client/types/orchestrator.ts` (extend `WebSocketMessage` union)
- CREATE `packages/dashboard/tests/client/types/local-models.test.ts`
- CREATE `packages/dashboard/src/client/hooks/useLocalModelsPanel.ts`
- CREATE `packages/dashboard/tests/client/hooks/useLocalModelsPanel.test.ts`
- CREATE `packages/dashboard/src/client/components/local-models/HardwareCard.tsx`
- CREATE `packages/dashboard/tests/client/components/local-models/HardwareCard.test.tsx`
- CREATE `packages/dashboard/src/client/components/local-models/PoolCard.tsx`
- CREATE `packages/dashboard/tests/client/components/local-models/PoolCard.test.tsx`
- CREATE `packages/dashboard/src/client/components/local-models/RecommendationsCard.tsx`
- CREATE `packages/dashboard/tests/client/components/local-models/RecommendationsCard.test.tsx`
- CREATE `packages/dashboard/src/client/pages/LocalModels.tsx`
- CREATE `packages/dashboard/tests/client/pages/LocalModels.test.tsx` (O3)
- MODIFY `packages/dashboard/src/client/components/layout/ThreadView.tsx` (register component)
- MODIFY `packages/dashboard/src/client/types/thread.ts` (register `SYSTEM_PAGES` entry)
- MODIFY `packages/dashboard/src/client/main.tsx` (legacy redirect)
- CREATE `packages/dashboard/tests/client/pages/LocalModels.route.test.tsx` (registration)
- CREATE `.changeset/lmlm-phase8-dashboard-panel.md`

## Skeleton

1. Client types + WS union (~1 task, ~4 min)
2. Data hook: fetch 4 endpoints + WS-signal refetch + per-card degrade (~1 task, ~6 min)
3. Three cards, each TDD with empty/degraded fixtures (~3 tasks, ~14 min)
4. Page composition + O3 degraded-fixture test (~1 task, ~5 min)
5. Registration (ThreadView + SYSTEM_PAGES + redirect) + route test (~1 task, ~4 min)
6. Changeset (integration) (~1 task, ~1 min)

**Estimated total:** 8 tasks, ~34 min. _Skeleton approved: pending (see sign-off)._

## Tasks

### Task 1: Client view types + WS union extension

**Depends on:** none | **Files:** `src/client/types/local-models.ts`, `src/client/types/orchestrator.ts`, `tests/client/types/local-models.test.ts`

1. Create `tests/client/types/local-models.test.ts` first (TDD, type-level + runtime narrowing assertions):

   ```ts
   import { describe, it, expect } from 'vitest';
   import type {
     DashHardwareProfile,
     DashPoolStateView,
     DashPoolEntryView,
     DashRankedModel,
     LocalModelsPoolEvent,
     LocalModelsProposalEvent,
   } from '../../../src/client/types/local-models';
   import type { WebSocketMessage } from '../../../src/client/types/orchestrator';

   describe('local-models client types', () => {
     it('pool view entries carry an optional pendingEviction flag', () => {
       const entry: DashPoolEntryView = {
         ollamaName: 'qwen3:32b',
         hfRepoId: 'Qwen/Qwen3-32B-GGUF',
         sizeOnDiskGb: 18,
         installedAt: '2026-07-01T00:00:00.000Z',
         lastUsedAt: null,
         currentScore: 82,
         pendingEviction: true,
       };
       const view: DashPoolStateView = {
         diskBudgetGb: 100,
         diskUsedGb: 18,
         entries: [entry],
         allowedOrgs: ['Qwen'],
         allowedFamilies: [],
         lastRefreshAt: null,
       };
       expect(view.entries[0].pendingEviction).toBe(true);
     });

     it('WebSocketMessage union accepts the two local-models topics', () => {
       const poolFrame: WebSocketMessage = {
         type: 'local-models:pool',
         data: { action: 'evict', phase: 'evict_completed' } satisfies LocalModelsPoolEvent,
       };
       const propFrame: WebSocketMessage = {
         type: 'local-models:proposal',
         data: { id: 'p1', status: 'created' } satisfies LocalModelsProposalEvent,
       };
       expect(poolFrame.type).toBe('local-models:pool');
       expect(propFrame.type).toBe('local-models:proposal');
     });

     const _hw: DashHardwareProfile = {
       platform: 'macos',
       vramGb: 36,
       ramGb: 36,
       bandwidthGbps: 400,
       cpuName: 'Apple M3 Max',
       detectedAt: '2026-07-01T00:00:00.000Z',
     };
     const _rm: DashRankedModel = {
       hfRepoId: 'Qwen/Qwen3-32B-GGUF',
       sizeB: 32,
       quant: 'Q4_K_M',
       estimatedVramGb: 20,
       estimatedTokPerSec: 30,
       speedConfidence: 'medium',
       score: 82,
       evidence: 'direct',
       benchmarkSnapshot: '2026-05-21',
       fitsHardware: true,
     };
   });
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard test -- tests/client/types/local-models.test.ts` — observe failure (module not found).
3. Create `src/client/types/local-models.ts` mirroring the source shapes (cross-link `@harness-engineering/local-models` + `packages/types/src/proposals.ts` as source of truth in a header comment). Mirror `HardwareProfile` (spec lines 147–155), `PoolEntry`/`PoolEntryView`/`PoolState`/`PoolStateView` (`pool/types.ts`), and the subset of `RankedModel` the cards render (spec lines 157–170) as `Dash*` types. Add the two delta event shapes:

   ```ts
   /** Delta signal broadcast on `local-models:pool` (server/http.ts). Consumed only as a refetch trigger. */
   export interface LocalModelsPoolEvent {
     action?: 'add' | 'swap' | 'evict';
     phase?: string; // 'evict_completed' | 'evict_deferred' | 'swap_evict_failed' | ...
     evicted?: string;
     deferred?: string;
     id?: string;
   }
   /** Delta signal broadcast on `local-models:proposal`. Consumed only as a refetch trigger. */
   export interface LocalModelsProposalEvent {
     id: string;
     status?: string; // 'created' | 'approved' | 'rejected' | 'failed_target_missing'
     action?: string;
     target?: string;
   }
   ```

4. Edit `src/client/types/orchestrator.ts`: add two variants to the `WebSocketMessage` union:

   ```ts
   | { type: 'local-models:pool'; data: LocalModelsPoolEvent }
   | { type: 'local-models:proposal'; data: LocalModelsProposalEvent }
   ```

   and `import type { LocalModelsPoolEvent, LocalModelsProposalEvent } from './local-models';` at the top.

5. Run: `pnpm --filter @harness-engineering/dashboard test -- tests/client/types/local-models.test.ts` — observe pass.
6. Run: `pnpm --filter @harness-engineering/dashboard typecheck`.
7. Run: `harness validate`.
8. Commit: `feat(dashboard): add local-models client types + WS topics`

### Task 2: Data hook `useLocalModelsPanel`

**Depends on:** Task 1 | **Files:** `src/client/hooks/useLocalModelsPanel.ts`, `tests/client/hooks/useLocalModelsPanel.test.ts`

1. Create `tests/client/hooks/useLocalModelsPanel.test.ts` first (TDD). Reuse the `FakeWebSocket` pattern from `tests/client/hooks/useLocalModelStatuses.test.ts` (`vi.stubGlobal('WebSocket', FakeWebSocket)`) and `vi.spyOn(globalThis, 'fetch')`. Cover:
   - Seeds `hardware`, `pool`, `recommendations`, `proposals` from four GETs on mount (assert each URL fetched: `/api/v1/local-models/{hardware,pool,recommendations,proposals}`).
   - A `503` on `hardware` sets `hardware.error` but leaves the other three populated (D-P8-4 per-card degrade).
   - When all four return `503`, exposes `allDisabled === true`.
   - A `FakeWebSocket.instance.simulateMessage({ type: 'local-models:pool', data: {...} })` triggers a **refetch** of pool + recommendations (assert fetch call counts for those two URLs increment; hardware does not).
   - A `local-models:proposal` frame refetches proposals + recommendations.
   - `refetchAll()` (returned) re-issues all four GETs (used by card action handlers).
   - Unmount closes the socket and cancels in-flight fetches (AbortController) — no state update after unmount.
2. Run: `pnpm --filter @harness-engineering/dashboard test -- tests/client/hooks/useLocalModelsPanel.test.ts` — observe failure.
3. Create `src/client/hooks/useLocalModelsPanel.ts`. Shape the return as:

   ```ts
   interface Resource<T> {
     data: T | null;
     error: string | null;
     loading: boolean;
   }
   interface UseLocalModelsPanelResult {
     hardware: Resource<DashHardwareProfile>;
     pool: Resource<DashPoolStateView>;
     recommendations: Resource<DashRankedModel[]>;
     proposals: Resource<ModelProposalRecord[]>;
     allDisabled: boolean; // true when all four GETs returned 503
     refetchAll: () => void; // re-issue all four GETs (post-action)
   }
   ```

   - One `fetchResource(url, setter)` helper using `AbortController`; map `503` to `error: 'LMLM disabled'`, other non-2xx to `error: HTTP n`.
   - Mirror the WS lifecycle from `useLocalModelStatuses` (own `WebSocket('/ws')`, exponential-backoff reconnect, `mounted` guard). In `onmessage`, narrow `msg.type`: `'local-models:pool'` → refetch pool + recommendations; `'local-models:proposal'` → refetch proposals + recommendations. Ignore all other frame types.
   - `allDisabled` derived from all four resources having `error === 'LMLM disabled'`.

4. Run: `pnpm --filter @harness-engineering/dashboard test -- tests/client/hooks/useLocalModelsPanel.test.ts` — observe pass.
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`.
6. Run: `harness validate`.
7. Commit: `feat(dashboard): add useLocalModelsPanel data hook`

### Task 3: Hardware card

**Depends on:** Task 1 | **Files:** `src/client/components/local-models/HardwareCard.tsx`, `tests/client/components/local-models/HardwareCard.test.tsx`

1. Create the test first (TDD). Props: `{ hardware: DashHardwareProfile | null; error: string | null; loading: boolean }`. Assert:
   - Populated profile renders `platform`, `vramGb`, `ramGb`, `bandwidthGbps`, `gpuName`/`cpuName` (use `getByTestId('hw-platform')` etc.).
   - `error === 'LMLM disabled'` renders a "hardware unavailable — LMLM disabled" state, no throw.
   - `hardware === null && error === null && loading` renders a loading state.
   - **[O3 slice]** `hardware === null && error` (detection failed / no hardware) renders "No hardware detected".
2. Run the card test — observe failure.
3. Implement `HardwareCard.tsx` (presentational, props-only; no fetch). Reuse existing card container classes seen in `pages/Proposals.tsx` (`rounded-lg border border-white/10 p-4`) — **do not introduce new design-token classes** (baseline has token warnings; add none). Include an "override" line when the profile is operator-overridden (spec config `localModels.hardware.override`); since the GET returns a resolved `HardwareProfile` without an explicit override flag, render override status only if a future field appears — for now show detected `platform` + `detectedAt`. Add `data-testid` hooks used by the test.
4. Run the card test — observe pass.
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`.
6. Run: `harness validate`.
7. Commit: `feat(dashboard): add HardwareCard`

### Task 4: Pool card (read-only, D-P8-2)

**Depends on:** Task 1 | **Files:** `src/client/components/local-models/PoolCard.tsx`, `tests/client/components/local-models/PoolCard.test.tsx`

1. Create the test first (TDD). Props: `{ pool: DashPoolStateView | null; error: string | null; loading: boolean }`. Assert:
   - Populated pool renders one row per entry (`ollamaName`, `hfRepoId`, `sizeOnDiskGb`, `currentScore`) and a disk-usage indicator showing `diskUsedGb` / `diskBudgetGb`.
   - An entry with `pendingEviction: true` renders a "pending eviction" badge (`getByTestId('pool-pending-<ollamaName>')` or text match).
   - **[O3 slice]** empty pool (`entries: []`) renders "No models in the pool" — no throw.
   - `error === 'LMLM disabled'` renders the disabled state.
   - Assert **no** install/evict buttons exist (`queryByRole('button', { name: /install|evict/i })` is null) — enforces D-P8-2.
2. Run — observe failure.
3. Implement `PoolCard.tsx` (presentational, read-only). Disk bar computed from `diskUsedGb/diskBudgetGb` (guard divide-by-zero). Header note: "Pool changes are approved on the Recommendations card." Reuse existing classes; add no new design tokens.
4. Run — observe pass.
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`.
6. Run: `harness validate`.
7. Commit: `feat(dashboard): add read-only PoolCard`

### Task 5: Recommendations card (+ pending proposals, approve/reject)

**Depends on:** Task 1 | **Files:** `src/client/components/local-models/RecommendationsCard.tsx`, `tests/client/components/local-models/RecommendationsCard.test.tsx`

1. Create the test first (TDD). Props: `{ recommendations: DashRankedModel[] | null; recommendationsError: string | null; proposals: ModelProposalRecord[] | null; onDecided: () => void; loading: boolean }`. Mock `fetch` via `vi.spyOn`. Assert:
   - Populated `recommendations` renders top-N rows (`hfRepoId`, `score`, `evidence`, `estimatedVramGb`, `fitsHardware`).
   - **[O3 / known limitation]** `recommendations === []` renders "No recommendations yet" (not an error, not blank). Also render this when `recommendationsError === 'LMLM disabled'` (distinct copy is fine).
   - Populated `proposals` renders each with Approve + Reject buttons.
   - Clicking Approve `POST`s to `/api/v1/proposals/<id>/approve` (assert URL + method) and calls `onDecided` on success.
   - Clicking Reject with a reason `POST`s to `/api/v1/proposals/<id>/reject` and calls `onDecided`.
   - A failed POST (non-2xx) surfaces an inline error and does **not** call `onDecided`.
2. Run — observe failure.
3. Implement `RecommendationsCard.tsx`. Two sections: "Recommended for your hardware" (ranked list; empty → "No recommendations yet") and "Pending proposals" (model proposals with justification summary from `proposal.model.justification.summary`, Approve/Reject). Reuse the POST pattern from `pages/Proposals.tsx` (`fetch(`/api/v1/proposals/${id}${suffix}`, { method:'POST', ... })`) with a local `busy`/`error` state; on success call `props.onDecided`. Per D-P8-2 assumption, enable Approve immediately for open model proposals (no gate precondition). Add no new design tokens.
4. Run — observe pass.
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`.
6. Run: `harness validate`.
7. Commit: `feat(dashboard): add RecommendationsCard with model proposal approve/reject`

### Task 6: LocalModels page + O3 degraded-fixture test

**Depends on:** Tasks 2, 3, 4, 5 | **Files:** `src/client/pages/LocalModels.tsx`, `tests/client/pages/LocalModels.test.tsx`

1. Create `tests/client/pages/LocalModels.test.tsx` first (TDD, **the O3 acceptance test**). Stub `WebSocket` via `FakeWebSocket` and mock `fetch` per-URL (a `fetchSpy.mockImplementation` that branches on `url`). Cover three fixtures + happy path + live update:
   - **Fixture A — empty pool:** hardware `200` (profile), pool `200 { entries: [] }`, recommendations `200 []`, proposals `200 []`. Assert the panel renders, Pool shows "No models in the pool", Recommendations shows "No recommendations yet", no throw.
   - **Fixture B — HF unreachable:** recommendations `503` (or `200 []`); assert Recommendations shows its empty/disabled state and the rest of the panel still renders.
   - **Fixture C — no hardware detected:** hardware `503`; assert Hardware card shows "No hardware detected" and the panel still renders.
   - **All-disabled:** all four `503` → assert a single "LMLM disabled" state (Truth 8).
   - **Live update:** after mount with a populated pool, `FakeWebSocket.instance.simulateMessage({ type:'local-models:pool', data:{ action:'evict', phase:'evict_completed' } })` triggers a pool refetch (assert the pool GET count increments and the updated view renders).
2. Run — observe failure (page module missing).
3. Create `src/client/pages/LocalModels.tsx`: call `useLocalModelsPanel()`, render a header + the three cards, passing the matching resource slices and `refetchAll` as `onDecided` to `RecommendationsCard`. When `allDisabled`, render a single "LMLM disabled — enable via `harness.config.json`" panel instead of the three cards. Wrap in the standard page container (the `/s/:systemPage` route already wraps pages in `max-w-7xl p-6`). No new design tokens.
4. Run — observe pass.
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`.
6. Run: `harness validate`.
7. Commit: `feat(dashboard): add LocalModels panel page (O3 empty/degraded coverage)`

### Task 7: Register the page + route test

**Depends on:** Task 6 | **Files:** `src/client/components/layout/ThreadView.tsx`, `src/client/types/thread.ts`, `src/client/main.tsx`, `tests/client/pages/LocalModels.route.test.tsx` | **Category:** integration

1. Create `tests/client/pages/LocalModels.route.test.tsx` first (TDD). Follow `tests/client/pages/Routing.route.test.tsx`: render the app router (or `SystemRoute` with `systemPage='local-models'`) inside a `MemoryRouter` at `/s/local-models`, stub `WebSocket` + mock `fetch` (all `200` minimal), and assert the LocalModels panel mounts (a stable `data-testid` or header text). Add an assertion that `SYSTEM_PAGES` contains a `local-models` entry with route `/s/local-models`.
2. Run — observe failure.
3. Edit `src/client/components/layout/ThreadView.tsx`: `import { LocalModels } from '../../pages/LocalModels';` and add `'local-models': LocalModels,` to `SYSTEM_PAGE_COMPONENTS`.
4. Edit `src/client/types/thread.ts`: add `{ page: 'local-models', label: 'Local Models', route: '/s/local-models' }` to the `SYSTEM_PAGES` `as const` array (this also extends the `SystemPage` union + sidebar nav).
5. Edit `src/client/main.tsx`: add `{ from: '/local-models', to: '/s/local-models' }` to `LEGACY_REDIRECTS`.
6. Run — observe pass.
7. Run: `pnpm --filter @harness-engineering/dashboard typecheck && pnpm --filter @harness-engineering/dashboard build`.
8. Run: `harness validate`.
9. Commit: `feat(dashboard): register /s/local-models route + sidebar nav`

### Task 8: Changeset

**Depends on:** Task 7 | **Files:** `.changeset/lmlm-phase8-dashboard-panel.md` | **Category:** integration

1. Create `.changeset/lmlm-phase8-dashboard-panel.md`:

   ```md
   ---
   '@harness-engineering/dashboard': minor
   ---

   Add the Local Model Lifecycle Manager dashboard panel at `/s/local-models`: Hardware, Pool, and Recommendations (+ pending model proposals) cards, seeded from the `/api/v1/local-models/*` read routes and kept live via the `local-models:{pool,proposal}` WebSocket topics. Model proposals are approved/rejected through the shared `/api/v1/proposals/:id/{approve,reject}` route. Renders cleanly when the pool is empty, HuggingFace is unreachable, or no hardware is detected (O3).
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard test && pnpm --filter @harness-engineering/dashboard build`.
3. Run: `harness validate`.
4. Commit: `docs(dashboard): changeset for LMLM Phase 8 dashboard panel`

## Integration notes (medium tier)

- **Wiring:** page registration (Task 7) is the only wiring; the dashboard client is Vite-bundled (no barrel regen). `pnpm build` in Tasks 7–8 is the wiring check.
- **Docs/ADRs:** deferred to spec Phase 9 (docs + ADRs + plugin regen). No new ADR — ADR 0060 already covers the operator surface / D-Q2 write-path decision. AGENTS.md/knowledge-doc updates are Phase 9's scope.
- **Roadmap:** entry already exists (`docs/roadmap.d/lmlm-wire-engine-to-operator-surfaces.md`), per Soundness Reconciliation.

## Risk / baseline notes

- **Pre-existing baseline:** ~391 tree-wide `harness validate` issues incl. dashboard design-token warnings. Every task ends with `harness validate`; the bar is **no new** issues (esp. no new design-token classes — reuse the container/border/text classes already present in `pages/Proposals.tsx`).
- **Bundle budget:** `vite.config.ts` `chunkSizeWarningLimit: 700`. The panel adds one page + one hook + three small presentational cards (no heavy deps); Task 7 `build` confirms no new chunk-size warning.
- **WS double-connection:** `useLocalModelsPanel` owns its own socket (like `useLocalModelStatuses`). The page must call the panel hook exactly once (at the page root) — do not also mount `useLocalModelStatuses` in the same tree.
