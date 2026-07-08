# Plan: LMLM Phase 6 — Background Scheduler + Drift Reconciliation

**Date:** 2026-07-07 · **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Phase 6, lines 508–517; Technical Design "Background scheduler" lines 283–294; §"Soundness Reconciliation (2026-07-07)" authoritative) · **Tasks:** 17 · **Time:** ~68 min · **Integration Tier:** medium

**Branch:** `feat/lmlm-wire-operator-surfaces` (HEAD `5eb0eb0d9`). Phases 4, 5a, 5b complete.

## Goal

The orchestrator drives a single per-instance interval timer that, on each tick, refreshes hardware + HF data, reconciles the pool against Ollama (silent drift removal, D12), re-ranks, diffs against the live pool via the Phase 5b engine, and emits at most one model proposal per pool entry — with real disk math, correct swap-eviction accounting, structured O1 logging, and a force-refresh path (CLI + one HTTP route). The live `PoolManager` becomes available to the proposals route, retiring the 501 stub.

## Observable Truths (Acceptance Criteria)

1. **[P5-SUG-ENGINE, F6/F7]** When a pool entry's single best swap-in is a suppressed (pending/rejected) `(target, replaces)` pair, `diffPoolAgainstRanking` falls through to the next-best **non-suppressed** hardware-fitting candidate and proposes it (still ≤1 proposal per entry; a suppressed pair is never re-emitted). Verified by a new engine test.
2. **[P5-SUG-EVICT-a]** Emitted `ModelProposalContent.diskImpactGb` is a real, non-zero estimate derived from `estimateVram` weight sizing (not the `0` placeholder). Verified by engine + `estimateDiskGb` unit tests.
3. **[P5-SUG-EVICT-b]** A swap whose `replaces` frees enough disk does **not** trigger budget-driven eviction of an unrelated LRU member: `PoolManager.install` credits the `replaces` entry's on-disk size to available budget. Verified by a `manager` test asserting the unrelated member survives.
4. **[P5-SUG-EVICT-c]** When budget-driven auto-eviction _does_ occur during install, the `local-models:pool` bus event lists every auto-evicted member (not just `replaces`). Verified by a `model-handlers` test.
5. **[O1]** Each scheduler tick logs one structured `info` entry `{ tick, started, completed, durationMs, candidatesEvaluated, proposalsEmitted, errors }`. Verified by a scheduler test on an injected logger.
6. **Overlap guard:** a timer fire while a refresh is in flight is suppressed (shares the in-flight promise), matching `LocalModelResolver.probeInFlight`. Verified by a scheduler test with an injected clock + a slow tick.
7. **[F10]** Install a model, remove it from Ollama (`list()` no longer reports it), run a tick → the pool entry is removed, its disk budget freed, and an `info` reconciliation event logged. Verified by a drift integration test.
8. **Live pool wired:** with `localModels.enabled = true`, `POST /api/v1/proposals/:id/approve` for a `kind: 'model'` proposal reaches the real `PoolManager` instead of returning `501`. Verified by an `http`/route test with the accessor populated.
9. **[O4]** `harness models refresh` exits non-zero on hard failure (HF unreachable **and** no frozen snapshot loaded) and zero with warnings otherwise; `POST /api/v1/local-models/refresh` returns the newly emitted proposals + warnings. Verified by CLI + route tests.
10. `createModelProposal` persists a `ModelProposalContent` as a `kind: 'model'` `ModelProposalRecord` retrievable by `listProposals(projectPath, { kind: 'model' })`. Verified by a core store test.
11. **ADR 0059** documents the scheduler cadence + silent drift reconciliation; the LMLM knowledge doc gains a scheduler/refresh section.
12. `pnpm --filter @harness-engineering/local-models build` regenerates the barrel with the new `scheduler` / `recommender` / `estimateDiskGb` exports; `harness validate` surfaces no **new** issues attributable to Phase 6.

## Uncertainties

- **[ASSUMPTION] Candidate discovery source.** The Phase 2 `recommender/native.ts` that would turn arbitrary _live_ HF models into `RankerCandidate[]` (parsing `sizeB` / `quant` from HF metadata) was never built. Phase 6's `createNativeRecommender` therefore takes an explicit `candidates: RankerCandidate[]` list (frozen-snapshot-derived or config-derived) and ranks those. Autonomous discovery of brand-new HF models beyond that list is deferred to the Phase 2 recommender completion (flagged as a concern). This does not block F6/F10/O1/O4 — the scheduler wiring, reconcile, diff, and force-refresh are all exercised with the injected/explicit candidate set.
- **[ASSUMPTION] Config defaults.** `localModels.refresh.{intervalMs,proposalThreshold,jitterMs}` and `localModels.installer.{backend,ollamaEndpoint}` are supplied by the operator's config when `enabled = true` (types already require them). The wiring task applies defensive fallbacks (`intervalMs → 86_400_000` clamped to `≥ 3_600_000`; `jitterMs → 600_000`; `proposalThreshold → 5`; `ollamaEndpoint → http://localhost:11434`).
- **[DEFERRABLE → CONCERN] D10 / S1 "no mid-dispatch swap".** Decided **out of Phase 6 scope.** The scheduler only _emits_ proposals and reconciles operator-initiated `ollama rm` drift (entries the operator already removed — never in-flight). It never evicts a live model. S1's `pendingEviction` deferral belongs to the approve/install eviction path and requires wiring the orchestrator's per-model dispatch tracking into `PoolManager` — Phase 7 work. Documented in ADR 0059; flagged in handoff concerns.

## Scope Decisions (documented per the brief)

- **Live `PoolManager` exposure.** Phase 6 constructs the live `PoolManager` (`OllamaInstallAdapter` + the already-loaded `PoolStateStore`) and exposes it via a `getModelPool()` accessor threaded into `ServerDependencies` → the proposals route deps, retiring the 501. The remaining `/api/v1/local-models/{hardware,pool,recommendations,proposals}` routes + the two WS topics stay **Phase 7**.
- **Refresh route minimalism.** Only `POST /api/v1/local-models/refresh` is added now (force-refresh + O4 exit signal). The other four routes + WS fan-out are **Phase 7**.

## Change Specification (deltas to existing Phase 5 code)

- **[MODIFIED]** `packages/local-models/src/proposals/engine.ts` — fall-through past suppressed candidates; real `diskImpactGb`.
- **[MODIFIED]** `packages/local-models/src/pool/manager.ts` — `install` credits `replaces` size to available budget; excludes `replaces` from the eviction plan.
- **[MODIFIED]** `packages/orchestrator/src/proposals/model-handlers.ts` — pass `replaces` to install; include auto-evictions in the pool bus event.
- **[ADDED]** scheduler, native recommender, `estimateDiskGb`, `createModelProposal`, refresh route + CLI subcommand, orchestrator lifecycle wiring, ADR 0059.

## File Map

```
# Deferred Phase 5 rework
MODIFY packages/local-models/src/proposals/engine.ts
MODIFY packages/local-models/tests/proposals/engine.test.ts
CREATE packages/local-models/src/ranker/disk.ts
CREATE packages/local-models/tests/ranker/disk.test.ts
MODIFY packages/local-models/src/ranker/index.ts            (export estimateDiskGb)
MODIFY packages/local-models/src/pool/manager.ts
MODIFY packages/local-models/tests/pool/manager.test.ts
MODIFY packages/orchestrator/src/proposals/model-handlers.ts
MODIFY packages/orchestrator/tests/proposals/model-handlers.test.ts

# Scheduler + recommender
CREATE packages/local-models/src/recommender/native.ts
CREATE packages/local-models/src/recommender/index.ts
CREATE packages/local-models/tests/recommender/native.test.ts
CREATE packages/local-models/src/scheduler/refresh.ts
CREATE packages/local-models/src/scheduler/index.ts
CREATE packages/local-models/tests/scheduler/refresh.test.ts
CREATE packages/local-models/tests/scheduler/drift-reconciliation.test.ts
MODIFY packages/local-models/src/index.ts                   (export scheduler + recommender)

# Proposal persistence
MODIFY packages/core/src/proposals/store.ts                 (createModelProposal)
MODIFY packages/core/src/proposals/index.ts                 (export)
MODIFY packages/core/tests/proposals/store.test.ts

# Force-refresh surfaces
CREATE packages/orchestrator/src/server/routes/v1/local-models.ts
CREATE packages/orchestrator/tests/server/routes/v1/local-models.test.ts
MODIFY packages/orchestrator/src/server/http.ts             (getModelPool + getRefreshScheduler + route registration)
MODIFY packages/orchestrator/tests/server/http.test.ts (or nearest server test)
MODIFY packages/cli/src/commands/models.ts                  (refresh subcommand)
MODIFY packages/cli/tests/commands/models.test.ts

# Orchestrator lifecycle wiring
MODIFY packages/orchestrator/src/orchestrator.ts            (PoolManager + scheduler + start/stop + accessors)
MODIFY packages/orchestrator/tests/... (orchestrator lifecycle test — nearest existing)

# Integration (medium tier)
CREATE docs/knowledge/decisions/0059-background-scheduler-and-silent-drift-reconciliation.md
MODIFY docs/knowledge/orchestrator/local-model-lifecycle.md
```

## Skeleton

1. Deferred Phase 5 engine + disk-math + eviction rework (~5 tasks, ~22 min)
2. Native recommender + scheduler pipeline + overlap-guarded timer (~4 tasks, ~20 min)
3. Proposal persistence + force-refresh route + CLI (~4 tasks, ~14 min)
4. Orchestrator lifecycle wiring + live-pool exposure (~2 tasks, ~8 min)
5. Drift integration test + ADR/knowledge + barrels (~2 tasks, ~6 min)

**Estimated total:** 17 tasks, ~68 min. _Skeleton direction pre-approved by the invocation brief's explicit Phase-6 scope enumeration._

---

## Tasks

### Task 1: Engine fall-through past suppressed candidates (P5-SUG-ENGINE)

**Depends on:** none | **Files:** `packages/local-models/src/proposals/engine.ts`, `packages/local-models/tests/proposals/engine.test.ts`

Today `bestCandidateFor` returns the single highest-scoring candidate; the caller then checks suppression at `engine.ts:78` and `continue`s (skips the entry) when that top candidate is a suppressed pair — hiding a viable never-seen swap.

1. Add a failing test to `tests/proposals/engine.test.ts`: a pool with one entry `qwen3:8b` (score 60); `ranked` has two fitting candidates — `A` (score 80, `ollamaName: 'top:32b'`) and `B` (score 75, `ollamaName: 'next:14b'`); `rejected: [{ target: 'top:32b', replaces: 'qwen3:8b' }]`. Assert exactly one proposal is returned and its `target.ollamaName === 'next:14b'` (fall-through), and that a second run with `B` also rejected yields **zero** proposals.
2. Run: `pnpm --filter @harness-engineering/local-models exec vitest run tests/proposals/engine.test.ts` — observe failure (current code emits zero because it skips the entry).
3. In `engine.ts`, move suppression into `bestCandidateFor`: pass `entry.ollamaName` and the `suppressed: Set<string>` into `bestCandidateFor`, and add a guard `if (suppressed.has(pairKey(c.ollamaName, entryName))) continue;` inside the candidate loop. Delete the now-redundant post-selection suppression `continue` at the call site (keep the `claimed.add`).
4. Run the test — observe pass. Run the full engine suite to confirm F6/F7 regressions are clean.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `fix(local-models): engine falls through to next-best non-suppressed swap (P5-SUG-ENGINE)`

### Task 2: `estimateDiskGb` ranker helper (P5-SUG-EVICT-a foundation)

**Depends on:** none | **Files:** `packages/local-models/src/ranker/disk.ts`, `packages/local-models/tests/ranker/disk.test.ts`, `packages/local-models/src/ranker/index.ts`

On-disk GGUF size is dominated by quantized weights; reuse `estimateVram`'s weight math rather than inventing a new model.

1. Create `tests/ranker/disk.test.ts`: assert `estimateDiskGb({ sizeB: 32, quant: 'Q4_K_M' })` is within a sane band (e.g. `> 15 && < 24`), that a larger `sizeB` yields a larger result (monotonic), and that an unknown quant still returns a finite positive number.
2. Run: `pnpm --filter @harness-engineering/local-models exec vitest run tests/ranker/disk.test.ts` — observe failure (module missing).
3. Create `src/ranker/disk.ts`:
   ```ts
   import { estimateVram, type VramEstimateInput } from './vram.js';
   /** On-disk footprint ≈ quantized weight tensors (GGUF overhead is small). */
   export function estimateDiskGb(
     input: Pick<VramEstimateInput, 'sizeB' | 'quant' | 'activeB'>
   ): number {
     return estimateVram({
       sizeB: input.sizeB,
       quant: input.quant,
       ...(input.activeB !== undefined ? { activeB: input.activeB } : {}),
     }).weightsGb;
   }
   ```
4. Export from `src/ranker/index.ts`: `export { estimateDiskGb } from './disk.js';`
5. Run the test — observe pass.
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `feat(local-models): add estimateDiskGb on-disk sizing helper`

### Task 3: Wire real disk math into the engine (P5-SUG-EVICT-a)

**Depends on:** Task 1, Task 2 | **Files:** `packages/local-models/src/proposals/engine.ts`, `packages/local-models/tests/proposals/engine.test.ts`

1. Add a failing assertion to `tests/proposals/engine.test.ts`: on a normal swap proposal, `proposal.diskImpactGb > 0` and equals `estimateDiskGb({ sizeB: candidate.sizeB, quant: candidate.quant })`.
2. Run: `pnpm --filter @harness-engineering/local-models exec vitest run tests/proposals/engine.test.ts` — observe failure (still `0`).
3. In `engine.ts`, import `estimateDiskGb` from `../ranker/index.js` and replace the `diskImpactGb: 0` placeholder with:
   ```ts
   diskImpactGb: estimateDiskGb({ sizeB: candidate.sizeB, quant: candidate.quant, ...(candidate.activeB !== undefined ? { activeB: candidate.activeB } : {}) }),
   ```
   Remove the "0 placeholder" comment.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(local-models): emit real diskImpactGb from ranker sizing (P5-SUG-EVICT-a)`

### Task 4: `PoolManager.install` credits `replaces` size (P5-SUG-EVICT-b)

**Depends on:** none | **Files:** `packages/local-models/src/pool/manager.ts`, `packages/local-models/tests/pool/manager.test.ts`

Preserve the existing install-then-evict handler flow (and the p5-01 swap-evict-failure recovery). The minimal fix: install treats `replaces`'s on-disk size as available budget and excludes it from the eviction plan, so an unrelated LRU member is not pre-evicted.

1. Add a failing test to `tests/pool/manager.test.ts`: budget 100 GB, pool holds `keep:14b` (30 GB, score 90) + `old:8b` (20 GB, score 40, this is `replaces`); `diskUsedGb = 50`. Install a 40 GB target with `replaces: 'old:8b'`. Assert the result succeeds with **no** budget-driven eviction of `keep:14b` (available 50 + credited 20 = 70 ≥ 40), and `evicted` from install is empty.
2. Run: `pnpm --filter @harness-engineering/local-models exec vitest run tests/pool/manager.test.ts` — observe failure (current code evicts `keep:14b` because available is only 50).
3. In `manager.ts`: add `replaces?: string` to `InstallPoolRequest`. In `precommitEvict`, compute the credit and exclude `replaces`:
   ```ts
   const replacesEntry = request.replaces
     ? state.entries.find((e) => e.ollamaName === request.replaces)
     : undefined;
   const credit = replacesEntry?.sizeOnDiskGb ?? 0;
   const available = state.diskBudgetGb - state.diskUsedGb + credit;
   if (sizeOnDiskGb <= available) return { ok: true, evicted };
   const deficit = sizeOnDiskGb - available;
   // exclude replaces from the plan so the handler's later evict owns it
   const planState = request.replaces
     ? { ...state, entries: state.entries.filter((e) => e.ollamaName !== request.replaces) }
     : state;
   const plan = planEviction({ state: planState, freeBudgetGb: deficit });
   ```
   Leave the rest of `precommitEvict` unchanged. Update the method doc to note the `replaces` credit.
4. Run the test + the full manager suite — observe pass (S5 budget-exceeded path still holds since credit only applies when `replaces` is a real pool entry).
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `fix(local-models): credit replaces size in install pre-commit to avoid over-eviction (P5-SUG-EVICT-b)`

### Task 5: model-handlers pass `replaces` + include auto-evictions in the pool event (P5-SUG-EVICT-b/c)

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/proposals/model-handlers.ts`, `packages/orchestrator/tests/proposals/model-handlers.test.ts`

1. Add a failing test to `tests/proposals/model-handlers.test.ts`: a `swap` approve where the fake `pool.install` returns `{ status: 'success', evicted: [entryFor('lru:3b')] }` (a budget-driven auto-eviction distinct from `replaces`). Assert the emitted `MODEL_POOL_TOPIC` event's evicted info lists **both** `lru:3b` and `model.replaces.ollamaName`. Also assert `pool.install` was called with `replaces: model.replaces.ollamaName`.
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/proposals/model-handlers.test.ts` — observe failure.
3. In `model-handlers.ts` `onApproveModelProposal` (add/swap branch): pass `replaces` into install:
   ```ts
   const installResult = await deps.pool.install({
     hfRepoId: model.target.hfRepoId,
     ollamaName: model.target.ollamaName,
     ...(model.replaces !== undefined ? { replaces: model.replaces.ollamaName } : {}),
     ...(model.diskImpactGb > 0 ? { sizeOnDiskGb: model.diskImpactGb } : {}),
   });
   ```
   In the success `MODEL_POOL_TOPIC` emit, build the evicted list from `installResult.evicted` names plus the handler-evicted `replaces`, e.g. `evicted: [...installResult.evicted.map((e) => e.ollamaName), ...(model.replaces ? [model.replaces.ollamaName] : [])]`. Preserve the p5-01 `swap_evict_failed` branch untouched.
4. Run the test — observe pass. Confirm the existing p5-01 swap-evict-failure test still passes.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): thread replaces + surface auto-evictions in pool event (P5-SUG-EVICT-b/c)`

### Task 6: Native recommender seam

**Depends on:** none | **Files:** `packages/local-models/src/recommender/native.ts`, `packages/local-models/src/recommender/index.ts`, `packages/local-models/tests/recommender/native.test.ts`

Provide the scheduler's `recommend(hardware)` seam without depending on the unbuilt live-HF candidate parser. Candidates are supplied explicitly (snapshot- or config-derived).

1. Create `tests/recommender/native.test.ts`: build a recommender with a stub `loadSnapshot` returning a small `BenchmarkSnapshot` and an explicit `candidates: RankerCandidate[]`. Assert `recommend(hardware)` returns `{ ranked, snapshotLoaded: true, hfReachable: <bool> }`, `ranked` is `RankedModel[]` sorted by score, and that when the snapshot loader throws, `snapshotLoaded: false` and `ranked` is `[]` with a warning (O4 hard-failure signal).
2. Run: `pnpm --filter @harness-engineering/local-models exec vitest run tests/recommender/native.test.ts` — observe failure.
3. Create `src/recommender/native.ts` exporting `RecommendResult { ranked: RankedModel[]; snapshotLoaded: boolean; hfReachable: boolean; warnings: string[] }`, `NativeRecommenderDeps { candidates: readonly RankerCandidate[]; loadSnapshot?: typeof loadFrozenSnapshot; hfClient?: HuggingFaceClient }`, and `createNativeRecommender(deps): (hardware: HardwareProfile) => Promise<RecommendResult>`. Implementation: call `loadFrozenSnapshot` (default), map to `rankModels({ hardware, candidates, snapshot })`; best-effort HF popularity enrichment wrapped in try/catch that sets `hfReachable` and never throws. On snapshot load failure return `{ ranked: [], snapshotLoaded: false, hfReachable, warnings }`.
4. Create `src/recommender/index.ts`: `export * from './native.js';`
5. Run the test — observe pass.
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `feat(local-models): add native recommender seam (snapshot-backed rank)`

### Task 7: Scheduler tick pipeline `runRefreshTick`

**Depends on:** Task 1, Task 3, Task 6 | **Files:** `packages/local-models/src/scheduler/refresh.ts`, `packages/local-models/tests/scheduler/refresh.test.ts`

Pure composition — no timers here. Sequence follows spec steps 1–6.

1. Create `tests/scheduler/refresh.test.ts`: inject fakes for `detectHardware`, `recommend`, a real `PoolManager` over a fake install adapter + in-memory store, `dedupSource` (returns pending/rejected `DedupPair[]`), and a spy `emitProposal`. Assert `runRefreshTick` (a) calls `poolManager.reconcile` before diffing, (b) calls `emitProposal` once per diff proposal, (c) calls `poolManager.updateScores` with the re-ranked scores, and (d) returns `TickResult { candidatesEvaluated, proposalsEmitted, reconciledRemoved, errors: [] }`.
2. Run: `pnpm --filter @harness-engineering/local-models exec vitest run tests/scheduler/refresh.test.ts` — observe failure.
3. Create `src/scheduler/refresh.ts` with `RefreshTickDeps { detectHardware; recommend; poolManager; dedupSource: () => Promise<{ pending: DedupPair[]; rejected: DedupPair[] }>; emitProposal: (c: ModelProposalContent) => Promise<void>; proposalThreshold: number; vramGb?: number }` and `TickResult`. `runRefreshTick(deps)`: `const hardware = await detectHardware();` → `const rec = await recommend(hardware);` → `const reconcile = await poolManager.reconcile();` → build `DiffInput` from `poolManager.snapshot()`, `rec.ranked`, `proposalThreshold`, `vramGb = hardware.vramGb`, `dedupSource()` → `diffPoolAgainstRanking(input)` → `for (const c of proposals) await emitProposal(c)` → `updateScores` from `rec.ranked` matched to pool entries. Wrap each stage so a stage error is pushed to `errors[]` and does not abort later stages where safe (reconcile failure already degrades inside PoolManager). Return metrics.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(local-models): add runRefreshTick pipeline (reconcile→rank→diff→emit)`

### Task 8: `RefreshScheduler` — timer, jitter, overlap guard, O1 logging

**Depends on:** Task 7 | **Files:** `packages/local-models/src/scheduler/refresh.ts`, `packages/local-models/src/scheduler/index.ts`, `packages/local-models/tests/scheduler/refresh.test.ts`

1. Extend `tests/scheduler/refresh.test.ts` with: (a) **overlap guard** — start the scheduler with a `runTick` that returns a manually-resolved promise; fire the timer twice before resolving; assert `runTick` ran once and the second fire shared the in-flight promise (matches `probeInFlight`). (b) **O1 log** — assert one structured `info` line per completed tick with keys `tick, started, completed, durationMs, candidatesEvaluated, proposalsEmitted, errors`. (c) **jitter + clamp** — assert the scheduled delay is `clamp(intervalMs, ≥ 3_600_000) + jitter∈[-jitterMs, +jitterMs]` using an injected `now`/`setTimer`. (d) `forceRefresh()` resolves with the `TickResult` and also respects the overlap guard.
2. Run: `pnpm --filter @harness-engineering/local-models exec vitest run tests/scheduler/refresh.test.ts` — observe failure.
3. In `refresh.ts` add `class RefreshScheduler`. Constructor opts: `{ runTick: () => Promise<TickResult>; intervalMs; jitterMs; logger: { info; warn }; setTimer?; clearTimer?; now?; random? }`. Fields: `private tickInFlight: Promise<TickResult> | null` (overlap guard, mirroring `LocalModelResolver.probeInFlight`), a monotonic `tick` counter. Methods: `start()` (idempotent; schedules first tick), `stop()` (clears timer), `private scheduleNext()` (jittered delay `Math.max(MIN_INTERVAL_MS, intervalMs) + round((random()*2-1)*jitterMs)`), `private async runGuarded()` (return `tickInFlight` if set; else run `runTick`, emit the O1 log in `finally`, clear `tickInFlight`), and `forceRefresh()` → `runGuarded()`. `MIN_INTERVAL_MS = 3_600_000`. Call `.unref?.()` on the handle like the resolver does.
4. Create `src/scheduler/index.ts`: `export * from './refresh.js';`
5. Run the tests — observe pass.
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `feat(local-models): add RefreshScheduler with jitter, overlap guard, O1 logging`

### Task 9: Export scheduler + recommender from the package barrel

**Depends on:** Task 6, Task 8 | **Files:** `packages/local-models/src/index.ts`

1. Add to `src/index.ts`:
   ```ts
   export * from './recommender/index.js';
   export * from './scheduler/index.js';
   ```
   Update the header comment's phase list to note Phase 6 (scheduler + recommender) is now present.
2. Run: `pnpm --filter @harness-engineering/local-models build` — observe the generated `dist` barrel includes `RefreshScheduler`, `runRefreshTick`, `createNativeRecommender`, `estimateDiskGb`.
3. Run: `pnpm --filter @harness-engineering/local-models exec vitest run` (full package) — observe green.
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `feat(local-models): export scheduler + recommender from barrel`

### Task 10: `createModelProposal` core store function

**Depends on:** none | **Files:** `packages/core/src/proposals/store.ts`, `packages/core/src/proposals/index.ts`, `packages/core/tests/proposals/store.test.ts`

1. Add a failing test to `tests/proposals/store.test.ts`: `createModelProposal(tmp, content)` writes a record, and `listProposals(tmp, { kind: 'model' })` returns exactly one with `kind: 'model'`, `status: 'open'`, and the same `model.target.ollamaName`; assert the id is prefixed `proposal_`.
2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/proposals/store.test.ts` — observe failure.
3. In `store.ts` add:
   ```ts
   export async function createModelProposal(
     projectPath: string,
     content: ModelProposalContent,
     opts: { proposedBy?: string; source?: ProposalSource } = {}
   ): Promise<ModelProposalRecord> {
     const id = `proposal_${randomUUID().replace(/-/g, '')}`;
     const record = ProposalSchema.parse({
       id,
       createdAt: new Date().toISOString(),
       kind: 'model',
       proposedBy: opts.proposedBy ?? 'orchestrator',
       source: opts.source ?? { justification: content.justification.summary },
       model: content,
       status: 'open',
     }) as ModelProposalRecord;
     const dir = proposalsDir(projectPath);
     ensureDir(dir);
     writeAtomic(proposalPath(projectPath, id), JSON.stringify(record, null, 2));
     return record;
   }
   ```
   Import `ModelProposalContent` / `ModelProposalRecord` / `ProposalSource` types as needed (match the `ProposalSourceSchema` required fields — check `packages/types/src/proposals.ts`; provide the minimal valid `source`).
4. Export `createModelProposal` from `src/proposals/index.ts`.
5. Run the test — observe pass.
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `feat(core): add createModelProposal store writer`

### Task 11: `POST /api/v1/local-models/refresh` route

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/server/routes/v1/local-models.ts`, `packages/orchestrator/tests/server/routes/v1/local-models.test.ts`

1. Create `tests/server/routes/v1/local-models.test.ts`: with a fake `getRefreshScheduler` returning `{ forceRefresh: async () => ({ proposalsEmitted: 2, errors: [] }) }` and an injected proposal reader, POST returns `200` with `{ emitted: 2, proposals: [...], warnings: [] }`; when `getRefreshScheduler()` is null return `503 { error: 'LMLM disabled' }`; when the tick's `errors` indicate a hard failure (HF unreachable AND no snapshot) return `503` (O4 signal for the CLI exit code).
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/server/routes/v1/local-models.test.ts` — observe failure.
3. Create `src/server/routes/v1/local-models.ts` exporting `handleV1LocalModelsRoute(req, res, deps)` matching only `POST /api/v1/local-models/refresh` (regex `^/api/v1/local-models/refresh(?:\?.*)?$`). Deps: `{ getRefreshScheduler: () => { forceRefresh(): Promise<TickResult> } | null; listModelProposals?: () => Promise<Proposal[]> }`. Return `false` for non-matching paths so the dispatcher falls through. Map a hard-failure `TickResult` to `503`.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): add POST /api/v1/local-models/refresh route`

### Task 12: Register refresh route + `getModelPool`/`getRefreshScheduler` on ServerDependencies

**Depends on:** Task 11 | **Category:** integration | **Files:** `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/tests/server/http.test.ts`

1. Add a failing test near the existing proposals-route server tests: construct `OrchestratorServer` with `getModelPool: () => fakePool` and assert a `kind: 'model'` approve request reaches the pool (no `501`); and with `getModelPool: () => null` it still returns `501`.
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run tests/server/http.test.ts` — observe failure.
3. In `http.ts`: extend `ServerDependencies` with `getModelPool?: () => ModelPoolOps | null` and `getRefreshScheduler?: () => { forceRefresh(): Promise<TickResult> } | null`. Store the closures. In the `handleV1ProposalsRoute` deps object add `modelPool: this.getModelPoolFn?.() ?? undefined`. Register `handleV1LocalModelsRoute` in the route table before the chat-proxy fallback, passing `{ getRefreshScheduler: this.getRefreshSchedulerFn ?? (() => null) }`. Import `ModelPoolOps` type from `../proposals/model-handlers`.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): expose getModelPool + getRefreshScheduler; wire refresh route`

### Task 13: `harness models refresh` CLI subcommand (O4 exit code)

**Depends on:** Task 11 | **Files:** `packages/cli/src/commands/models.ts`, `packages/cli/tests/commands/models.test.ts`

1. Add a failing test to `tests/commands/models.test.ts` (mirror the existing approve/reject fetch-stub pattern): a `refresh` action that POSTs `${orchestratorUrl}/api/v1/local-models/refresh`; on `200` prints the emitted count and exits `0`; on `503` prints the hard-failure reason and sets a non-zero exit code (O4). Assert both branches.
2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/models.test.ts` — observe failure.
3. In `models.ts` register `.command('refresh')` under the `models` group (follow the `approve <id>` handler shape at line ~339): POST the route with `HARNESS_ADMIN_TOKEN`, parse `{ emitted, warnings }`, print a summary; on non-2xx set `process.exitCode = 1` (do not `throw` — keep output clean). Update the group description comment listing `refresh` as implemented.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(cli): add harness models refresh with O4 exit semantics`

### Task 14: Orchestrator constructs live PoolManager + exposes it

**Depends on:** Task 5, Task 12 | **Files:** `packages/orchestrator/src/orchestrator.ts`, nearest orchestrator lifecycle test

1. Add a failing test (nearest existing orchestrator construction test): with `localModels.enabled = true` config, `orchestrator` builds a `PoolManager` reachable via the server's `getModelPool()` accessor (non-null); with `enabled` absent it stays null.
2. Run the relevant vitest file — observe failure.
3. In `orchestrator.ts`: when `localModelsEnabled` (reuse the existing `localModelsEnabled` local at line 436) and `this.poolStateStore` was created, construct in the constructor:
   ```ts
   const installerCfg = this.config.localModels?.installer;
   this.modelInstaller = new OllamaInstallAdapter({
     baseUrl: installerCfg?.ollamaEndpoint ?? 'http://localhost:11434',
     onWarn: (m, c) => this.logger.warn(m, c !== undefined ? { cause: c } : undefined),
   });
   this.modelPool = new PoolManager({
     store: this.poolStateStore,
     installer: this.modelInstaller,
     onWarn: (m, c) => this.logger.warn(m, c !== undefined ? { cause: c } : undefined),
   });
   ```
   Add private fields `modelPool: PoolManager | null = null`, `modelInstaller: InstallAdapter | null = null`. Import `PoolManager`, `OllamaInstallAdapter`, `InstallAdapter` from `@harness-engineering/local-models`. Pass `getModelPool: () => this.modelPool` into the `OrchestratorServer` deps block (line ~611). `PoolManager` reads `store.snapshot()` lazily, so constructing before `store.load()` (which happens in `initLocalModelAndPipeline`) is safe.
4. Run the test — observe pass; confirm N4/N9 (LMLM-disabled) path leaves `modelPool` null.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): construct live PoolManager and expose via getModelPool`

### Task 15: Orchestrator constructs, starts, and stops the RefreshScheduler

**Depends on:** Task 8, Task 9, Task 10, Task 14 | **Files:** `packages/orchestrator/src/orchestrator.ts`, nearest orchestrator lifecycle test

1. Add a failing test: with `localModels.enabled = true`, `start()` starts a scheduler (spy the injected `runTick`/timer or assert `getRefreshScheduler()` non-null and `forceRefresh()` runs a tick that calls the pool's `reconcile`), and `stop()` clears it (no further ticks). Use an injected clock/`setTimer` seam so no real 24h timer runs.
2. Run the test — observe failure.
3. In `orchestrator.ts`, after `this.poolStateStore.load()` in `initLocalModelAndPipeline` (line ~1977), when `this.modelPool` is non-null construct the scheduler:
   ```ts
   const refreshCfg = this.config.localModels?.refresh;
   this.refreshScheduler = new RefreshScheduler({
     runTick: () =>
       runRefreshTick({
         detectHardware: () => this.detectLmlmHardware(),
         recommend: this.lmlmRecommend,
         poolManager: this.modelPool!,
         dedupSource: () => this.lmlmDedupSource(),
         emitProposal: (c) => createModelProposal(this.projectPath, c).then(() => undefined),
         proposalThreshold: refreshCfg?.proposalThreshold ?? 5,
       }),
     intervalMs: refreshCfg?.intervalMs ?? 86_400_000,
     jitterMs: refreshCfg?.jitterMs ?? 600_000,
     logger: this.logger,
   });
   this.refreshScheduler.start();
   ```
   Add helpers: `detectLmlmHardware` (via `HardwareDetector` with `config.localModels.hardware.override`), `lmlmRecommend` (a `createNativeRecommender` bound to snapshot-derived candidates — see the Task 6 assumption), and `lmlmDedupSource` (map `listProposals(projectPath, { kind: 'model' })` open→`pending`, rejected→`rejected` into `DedupPair[]`). Pass `getRefreshScheduler: () => this.refreshScheduler` into the server deps. In `stop()` (line ~2063) add `this.refreshScheduler?.stop(); this.refreshScheduler = null;`. Import `RefreshScheduler`, `runRefreshTick`, `createNativeRecommender`, `HardwareDetector` from local-models and `createModelProposal` + `listProposals` from `@harness-engineering/core`.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): start/stop background RefreshScheduler on lifecycle`

### Task 16: F10 drift-reconciliation integration test

**Depends on:** Task 7 | **Files:** `packages/local-models/tests/scheduler/drift-reconciliation.test.ts`

1. Create the integration test: build a real `PoolManager` over an in-memory `PoolStateStore` + a fake `OllamaInstallAdapter` whose `list()` result is controllable. Install `qwen3:8b` (20 GB) via the manager; assert `diskUsedGb === 20`. Simulate `ollama rm` by making `list()` no longer return `qwen3:8b`. Run `runRefreshTick` with an injected `recommend` returning `[]` and a spy `info` logger. Assert: the pool entry is removed, `diskUsedGb === 0` (budget freed), the `TickResult.reconciledRemoved` includes `qwen3:8b`, and an `info`-level reconciliation message was logged.
2. Run: `pnpm --filter @harness-engineering/local-models exec vitest run tests/scheduler/drift-reconciliation.test.ts` — observe pass (feature already implemented in Tasks 4/7; this locks F10).
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Commit: `test(local-models): F10 drift reconciliation converges pool + frees budget`

### Task 17: ADR 0059 + knowledge doc update

**Depends on:** Task 15 | **Category:** integration | **Files:** `docs/knowledge/decisions/0059-background-scheduler-and-silent-drift-reconciliation.md`, `docs/knowledge/orchestrator/local-model-lifecycle.md`

1. Create `docs/knowledge/decisions/0059-background-scheduler-and-silent-drift-reconciliation.md` following the format of `0058-generalize-skill-proposal-into-discriminated-proposal.md`. Record: single per-instance interval timer with jitter + overlap guard (mirrors `LocalModelResolver.probeInFlight`); silent drift reconciliation (D12/ADR-NNNN+5 rationale — operator `ollama rm` is authoritative, no auto-import); the tick order (hardware→HF→reconcile→rank→diff→emit); and the explicit decision that **D10/S1 no-mid-dispatch-swap is out of scope** for Phase 6 (scheduler never evicts a live model; deferred to Phase 7 dispatch-tracking wiring).
2. Add a "Background scheduler & refresh cadence" section to `docs/knowledge/orchestrator/local-model-lifecycle.md`: cadence (24h default, ≥1h floor, ±10min jitter), the O1 tick log shape, the force-refresh path (`harness models refresh` + `POST /api/v1/local-models/refresh`), and the drift-reconciliation semantics.
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Run: `pnpm --filter @harness-engineering/local-models build` (confirm barrel still clean after all exports).
5. Commit: `docs(lmlm): ADR 0059 scheduler + drift reconciliation; knowledge update`

---

## Sequencing Notes

- **Parallelizable:** Tasks 1, 2, 4, 6, 10 have no dependencies and touch disjoint files (engine, ranker/disk, pool/manager, recommender, core/store) — safe first wave.
- **Serial spine:** 2→3, 4→5, 6→7→8→9, 11→12→13, 14→15, 15→17.
- **Cross-file collision risk:** Tasks 12, 14, 15 all touch `orchestrator.ts` / `http.ts` — run serially in that order (12 before 14 before 15).
- Tasks 1 and 3 both touch `engine.ts` / `engine.test.ts` — serial (1 before 3).

## Pre-existing Baseline (NOT attributable to Phase 6)

- ~391 tree-wide `harness validate` issues (design-token / hardcoded-color warnings across dashboard, graph, etc.).
- A non-blocking arch-baseline failure on `orchestrator.ts` (module-size / scope-mismatched baseline).
- Dirty `.harness` baseline files (`.harness/security/timeline.json`, `packages/cli/.harness/arch/baselines.json`).

Verify with `node packages/cli/dist/bin/harness.js validate` that Phase 6 adds no **new** issues; the CLI on PATH is the global npm install — for source-accurate validation use the built local binary at `packages/cli/dist/bin/harness.js` after `turbo build`.
