# Plan: LMLM Phase 3c — PoolManager orchestrator

**Date:** 2026-05-30 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Phase 3, lines 431–443; F4, F5, F8, S2, S5, S6, S7, D1, D12, D13) | **Tasks:** 4 | **Time:** ~3 hours | **Integration Tier:** small | **Session:** `changes--local-model-lifecycle-manager--phase3c`

## Goal

Ship `pool/manager.ts` — the `PoolManager` orchestrator that composes Phase 3a's `PoolStateStore` + `planEviction` with Phase 3b's `InstallAdapter` into the single high-level API later phases consume. The manager owns the full install / evict / reconcile / score-update / configure flow against the pool state file, enforcing the allowlist (D1, F8) and the disk-budget invariant (S5) at the engine layer so the install adapter is never asked to do something the pool state disagrees with.

Phase 3c explicitly **does not** ship CLI subcommands (Phase 7), `LocalModelResolver` integration (Phase 4), the background scheduler (Phase 6), the proposal engine (Phase 5b), HTTP / WS / dashboard surfaces (Phase 7 / 8), or mid-dispatch swap deferral (D10 / S1 — that signal lives at the orchestrator runtime layer, not in the package). Every Phase 3c primitive is opt-in and consumed only when `localModels.enabled = true`.

## Phase 3c Scope (from spec Phase 3, lines 431–443)

In:

- `src/pool/manager.ts` — `PoolManager` class exposing:
  - `install(req)` — allowlist check → idempotent short-circuit → size resolution via `installer.inspect` (when not provided) → capacity check → pre-commit eviction via `planEviction` + `installer.evict` (F5) → `installer.install` → append `PoolEntry` + persist atomically. Surfaces every Phase 3b error code unchanged so the proposal engine (Phase 5b) and scheduler (Phase 6) can branch on the same taxonomy.
  - `evict(req)` — single-entry remove via `installer.evict` + pool state mutation. `not_in_pool` from the installer is treated as a silent reconciliation (D12 primitive) — the manager prunes the entry from pool state and returns success.
  - `reconcile(req?)` — call `installer.list`, prune entries the installer no longer knows about, persist once, return `{ removed }`. A transport failure (`installer_unavailable` throw from `list`) leaves pool state untouched and emits `onWarn` so the scheduler (Phase 6) doesn't nuke the pool on transient network blips. The advisory adapter's `list() ⇒ []` is the caller's problem (Phase 6 / 7 will gate the call by installer kind).
  - `markUsed(ollamaName)` — bookkeeping for the Phase 4 resolver: updates `lastUsedAt` on the matching entry, persists.
  - `updateScores(updates)` — bookkeeping for the Phase 6 scheduler / Phase 5b proposal engine: batched `currentScore` rewrite, persists once.
  - `configurePool(config)` — Phase 7 CLI `pool {set-budget, allow-org, allow-family}` consumer. Updates only the fields supplied; persists.
  - `snapshot()` — passthrough to `store.snapshot()` so callers get a frozen clone.
  - `isAllowed({ hfRepoId, family? })` — exposed allowlist check so the proposal engine can pre-filter candidates.
- `src/pool/manager.ts` public types: `PoolManagerOptions`, `InstallPoolRequest`, `InstallPoolResult`, `EvictPoolRequest`, `EvictPoolResult`, `ReconcileRequest`, `ReconcileResult`, `ConfigurePoolRequest`, `ScoreUpdate`, `AllowCheckRequest`, plus a stable `PoolManagerErrorCode` union (`not_allowed | budget_exceeded | …InstallErrorCode`).
- `src/pool/index.ts` — barrel re-exports `PoolManager` + the new types alongside Phase 3a's `PoolStateStore`/`planEviction`.
- `src/index.ts` — already re-exports `./pool/index.js`; no edit needed if the new types ride the pool barrel.
- Tests under `tests/pool/`: `manager.test.ts` covering OT1–OT20 below.
- `.changeset/lmlm-phase3c-pool-manager.md` — minor bump.
- README — single-paragraph Phase 3c status note replacing the Phase 3b note.

Out of Phase 3c (deferred):

- CLI subcommands `harness models pool {show,set-budget,allow-org,allow-family}`, `install`, `evict`. Phase 7.
- `LocalModelResolver` integration (pool → resolver candidate list). Phase 4.
- Background scheduler (interval timer + drift reconcile + ranker diff). Phase 6.
- Proposal engine (`pool diff vs ranking → ModelProposal`). Phase 5b.
- HTTP / WS routes + dashboard panel. Phase 7 / 8.
- Mid-dispatch swap deferral (D10 / S1) — needs orchestrator dispatch state.
- Integration tests against a real Ollama (gated; skip in CI if Ollama not present).

## Observable Truths (Acceptance Criteria — Phase 3c only)

### Allowlist (D1, F8)

1. **OT1** — `install({ hfRepoId: 'random-org/foo' })` against a pool whose `allowedOrgs` does not include `'random-org'` resolves to `{ status: 'error', code: 'not_allowed', message: /org/ }`. The installer's `install` and `inspect` methods are not invoked; the recorded call list is empty.
2. **OT2** — `install({ hfRepoId: 'Qwen/Qwen3-32B-GGUF', family: 'qwen2' })` against `allowedFamilies: ['qwen3']` resolves to `not_allowed` with `/family/` in the message. Installer is not invoked.
3. **OT3** — `install({ hfRepoId: 'Qwen/Qwen3-32B-GGUF' })` with `allowedFamilies: []` (the proposal's "empty ⇒ all under allowed orgs") and `allowedOrgs: ['Qwen']` proceeds past the allowlist check.

### Idempotency (S2)

4. **OT4** — `install({ ollamaName: 'qwen3:32b', … })` when an entry with that `ollamaName` already exists in the pool resolves to `{ status: 'success', entry, evicted: [], alreadyInstalled: true }` without invoking `installer.install` or `installer.inspect`. Pool state is unchanged.

### Happy path (F4)

5. **OT5** — `install` against an empty pool with sufficient `diskBudgetGb` invokes (in order): `installer.inspect({ name })` → `installer.install({ name, signal, onEvent })`. On success, the pool state gains a new `PoolEntry` with `installedAt = now()`, `lastUsedAt = null`, `currentScore = req.initialScore ?? 0`, and `sizeOnDiskGb` taken from `inspect`. `store.persist()` is invoked exactly once. The recorded fs op log shows a single write+rename pair. (O2 via Phase 3a)
6. **OT6** — When `req.sizeOnDiskGb` is supplied, `installer.inspect` is **not** invoked; the caller-supplied size is trusted (Phase 5b's proposal engine prefers this path).

### Budget + eviction (F5, S5)

7. **OT7** — `install` whose target's `sizeOnDiskGb` exceeds `diskBudgetGb - diskUsedGb` triggers `planEviction({ freeBudgetGb: deficit })`. For each planned entry, `installer.evict({ name })` is invoked in lowest-score-LRU order; each successful evict removes the entry from in-memory pool state. After all evictions succeed and budget has room, `installer.install` is invoked. The `evicted: PoolEntry[]` field on the result lists the entries removed.
8. **OT8** — `install` whose target exceeds even the fully-evicted pool resolves to `{ status: 'error', code: 'budget_exceeded' }`. `installer.evict` and `installer.install` are not invoked. Pool state is unchanged. (S5 — never trust the installer)
9. **OT9** — `install` whose pre-commit `installer.evict` returns `installer_unavailable` on the first planned entry resolves to that error code unchanged. Pool state is unchanged. The remaining planned evictions are not attempted. `installer.install` is not invoked.

### Install failure modes (D13, S6, S7)

10. **OT10** — `install` whose `installer.install` resolves to `{ status: 'error', code: 'failed_target_missing' }` propagates the same result with `evicted: []` (or the entries evicted before the failure, if any — see OT11). Pool state does not gain a new entry. (D13 surfaces upstream; Phase 5b consumes the same code.)
11. **OT11** — `install` whose `installer.install` resolves to `{ status: 'error', code: 'install_failed' }` invokes `installer.evict({ name })` as a best-effort cleanup of partial bytes (S7). The cleanup `evict` failure is swallowed (logged via `onWarn`); the original error code is returned. Pool state still does not gain a new entry.
12. **OT12** — `install` whose `installer.install` resolves to `{ status: 'error', code: 'installer_unavailable' }` does **not** attempt the partial-byte cleanup (S6 — the installer is down; cleanup wouldn't reach it). The error is surfaced as-is. Pool state unchanged.
13. **OT13** — `install` whose `installer.inspect` throws `InstallError('installer_unavailable', …)` resolves to `{ status: 'error', code: 'installer_unavailable' }`. `installer.install` is not invoked.
14. **OT14** — `install` whose `installer.inspect` throws `InstallError('parse_failed', …)` resolves to `{ status: 'error', code: 'parse_failed' }`. `installer.install` is not invoked.

### Evict (D12 primitive)

15. **OT15** — `evict({ ollamaName })` for a known pool member invokes `installer.evict`, removes the entry from pool state, persists once, and resolves to `{ status: 'success', name, removed: PoolEntry }`.
16. **OT16** — `evict` for an unknown `ollamaName` resolves to `{ status: 'success', name, removed: null, alreadyAbsent: true }` without invoking the installer (the entry is already gone; nothing to do).
17. **OT17** — `evict` whose `installer.evict` resolves to `{ status: 'error', code: 'not_in_pool' }` removes the entry from pool state anyway (D12 — the operator's manual `ollama rm` is authoritative) and resolves to `{ status: 'success', name, removed }` with a `reconciled: true` flag.
18. **OT18** — `evict` whose `installer.evict` resolves to `installer_unavailable` propagates the error and **does not** remove the entry from pool state. (S6 — keep the operator's record until we can confirm the install backend agrees.)

### Reconcile (D12 primitive)

19. **OT19** — `reconcile()` against an installer whose `list()` returns a subset of the pool's `ollamaName`s removes the missing entries from pool state, persists once, and resolves to `{ removed: PoolEntry[] }` with the dropped entries (each tagged with the score / install timestamp they had at removal). Entries the installer reports are left alone (D12 — auto-import is not done; that would cross the autonomy boundary).
20. **OT20** — `reconcile()` whose `installer.list` throws `InstallError('installer_unavailable', …)` resolves to `{ removed: [] }`, emits `onWarn`, and leaves pool state untouched. The scheduler's next tick re-tries.

### Bookkeeping (Phase 4 / Phase 6 seams)

21. **OT21** — `markUsed('qwen3:32b')` against a pool containing that entry updates `lastUsedAt = now()` and persists. For an unknown name, the call is a no-op (no warning, no persist).
22. **OT22** — `updateScores([{ ollamaName: 'qwen3:32b', currentScore: 78 }, { ollamaName: 'unknown', currentScore: 99 }])` updates the known entry's score, ignores the unknown name, and persists once. The persist op count is `1` regardless of how many updates were supplied.

### Configure + snapshot (Phase 7 seam)

23. **OT23** — `configurePool({ diskBudgetGb: 200 })` updates only `diskBudgetGb`; `allowedOrgs` / `allowedFamilies` / entries are preserved. `configurePool({ allowedOrgs: ['Qwen', 'deepseek-ai'] })` symmetrically updates only the orgs. Each call persists once.
24. **OT24** — `snapshot()` returns a structurally-cloned `PoolState`; mutating the returned value does not affect a subsequent `snapshot()`.
25. **OT25** — `isAllowed({ hfRepoId: 'Qwen/Qwen3', family: 'qwen3' })` returns `true` against `allowedOrgs: ['Qwen']` + `allowedFamilies: ['qwen3']`. Same call with `family: 'qwen2'` returns `false`. Same call with `allowedFamilies: []` returns `true` (any family allowed). Org matching is case-sensitive (HF orgs are case-sensitive on the registry); family matching is case-insensitive (the slug is operator-typed).

### Package-level

26. **OT26** — `pnpm --filter @harness-engineering/local-models build && pnpm --filter @harness-engineering/local-models typecheck && pnpm --filter @harness-engineering/local-models lint && pnpm --filter @harness-engineering/local-models test` are all green. Phases 1, 2a, 2b, 2c, 3a, 3b tests pass unchanged. `pnpm exec harness validate` produces no new local-models findings.

## Skill Recommendations

- `tdd-classicist` — every Phase 3c branch has an in-memory fs port + a recorded-call installer stub; tests run with no real I/O.
- `ts-type-guards` — `isAllowed` and `configurePool` accept partials; runtime checks keep partial-config bugs localized.
- `single-writer` — `PoolStateStore.update` remains the single mutation path. The manager always reads via `snapshot()` and writes via `update()` so no consumer can drift the in-memory state.

## File Map

- CREATE `packages/local-models/src/pool/manager.ts`
- MODIFY `packages/local-models/src/pool/index.ts` — barrel re-export `PoolManager` + the new public types
- CREATE `packages/local-models/tests/pool/manager.test.ts`
- CREATE `.changeset/lmlm-phase3c-pool-manager.md`
- MODIFY `packages/local-models/README.md` — replace Phase 3b note with single-paragraph Phase 3c note

## Skeleton

1. Land `pool/manager.ts` — class wiring store + installer + planEviction with the public methods enumerated above. Pure orchestration; no fs or transport beyond what the injected store / installer do.
2. Extend `pool/index.ts` barrel with `PoolManager` + the new exported types.
3. Tests for the manager — recorded-fs harness (re-used from Phase 3a's pattern) + recorded-call installer stub (re-used from Phase 3b's pattern) cover OT1–OT25.
4. Verification gate (`build`, `typecheck`, `test`, `lint`, `harness validate`).
5. Changeset + README touch-up.

## Uncertainties

- **[ASSUMPTION]** Family allowlist matching is case-insensitive on the operator-typed `allowedFamilies` slug; org matching is case-sensitive on the HF org name (which is case-sensitive on the registry). The proposal does not specify either case explicitly; this matches the rough convention that HF orgs are exact identifiers and family slugs are human-typed labels.
- **[ASSUMPTION]** Eviction order on multi-entry pre-commit eviction is lowest-score-LRU as ordered by Phase 3a's `planEviction`. The manager processes the plan front-to-back; if a mid-plan `installer.evict` fails, processing halts and the manager returns the error. The already-evicted entries stay evicted (their state has been updated). This matches "never trust the installer past the point of confirmation".
- **[ASSUMPTION]** `install_failed` triggers a best-effort `installer.evict` cleanup. `installer_unavailable` does not (the installer is down; the cleanup wouldn't reach it). `failed_target_missing` does not (nothing was downloaded; nothing to clean up). This split keeps S6 / S7 honest.
- **[DEFERRABLE]** Mid-dispatch swap deferral (D10 / S1). The manager has no signal for "this model has zero active dispatches" — that signal lives at the orchestrator runtime layer and is wired in Phase 6 (scheduler) or via a callback the orchestrator passes in. Phase 3c assumes the caller has already determined eviction is safe.

## Tasks

### Task 1: Land `pool/manager.ts`

**Depends on:** none | **Files:** `src/pool/manager.ts`

1. Define `PoolManagerErrorCode = InstallErrorCode | 'not_allowed' | 'budget_exceeded'`.
2. Define `InstallPoolRequest = { hfRepoId, ollamaName, sizeOnDiskGb?, family?, initialScore?, signal?, onEvent? }`.
3. Define `InstallPoolResult = { status: 'success', entry, evicted, alreadyInstalled? } | { status: 'error', code: PoolManagerErrorCode, message, evicted? }`.
4. Define `EvictPoolRequest = { ollamaName, signal? }`.
5. Define `EvictPoolResult = { status: 'success', name, removed, alreadyAbsent?, reconciled? } | { status: 'error', code: InstallErrorCode, message }`.
6. Define `ReconcileResult = { removed: PoolEntry[] }`.
7. Define `ConfigurePoolRequest = Partial<{ diskBudgetGb, allowedOrgs, allowedFamilies }>`.
8. Define `ScoreUpdate = { ollamaName, currentScore }`.
9. Define `AllowCheckRequest = { hfRepoId, family? }`.
10. Implement `PoolManager` class:
    - `constructor({ store, installer, now?, onWarn? })`.
    - `snapshot()` → `store.snapshot()`.
    - `isAllowed(req)` — split `hfRepoId` on `/` for the org; check `allowedOrgs.includes(org)`; if `allowedFamilies.length > 0`, require `family` and `allowedFamilies.some(f => f.toLowerCase() === family.toLowerCase())`.
    - `install(req)` — allowlist gate → idempotent short-circuit → inspect (when needed) → capacity check → pre-commit eviction → installer.install → state append → persist.
    - `evict(req)` — known-entry check → installer.evict → state mutate → persist. Handles `not_in_pool` reconciliation (OT17).
    - `reconcile(req?)` — installer.list (try) → diff against current entries → state mutate → persist once. `installer_unavailable` throw is swallowed + `onWarn`.
    - `markUsed(name)` — single-entry timestamp update + persist (only when found).
    - `updateScores(updates)` — batched score rewrite + persist (only when at least one update applies).
    - `configurePool(config)` — partial field update + persist.

Acceptance: typecheck clean; OT1–OT25 covered by Task 3's tests.

### Task 2: Extend `pool/index.ts` barrel

**Depends on:** Task 1 | **Files:** `src/pool/index.ts`

1. `export { PoolManager } from './manager.js';`
2. `export type { AllowCheckRequest, ConfigurePoolRequest, EvictPoolRequest, EvictPoolResult, InstallPoolRequest, InstallPoolResult, PoolManagerErrorCode, PoolManagerOptions, ReconcileResult, ScoreUpdate } from './manager.js';`

Acceptance: typecheck clean; the package barrel re-exports the manager surface via `./pool/index.js`.

### Task 3: Land `tests/pool/manager.test.ts`

**Depends on:** Tasks 1, 2 | **Files:** `tests/pool/manager.test.ts`

1. In-memory `PoolFilesystem` matching the Phase 3a harness (records `read | write | rename | mkdir` ops, persists writes into a `Record<string, string>` map).
2. Recorded-call `InstallAdapter` stub: `{ installs: [], evicts: [], lists: [], inspects: [] }` plus per-method response queues so each test scripts the failure path it needs.
3. Frozen clock via `now: () => DATE.getTime()`; the manager's `installedAt` / `lastUsedAt` are assertable.
4. Table-driven cases for OT1 through OT25; final smoke test asserts the full happy-path round-trip (allowlist OK → inspect OK → budget OK → install OK → persist OK → snapshot reflects the new entry).
5. Assert that `installer.install` / `installer.evict` / `installer.inspect` recorded calls match the documented invariants in each branch.

Acceptance: every OT row asserts the documented behavior; the recorded fs op log is asserted where the spec mentions it (e.g. OT5 single write+rename).

### Task 4: Wire barrel + tests pass + changeset + README

**Depends on:** Tasks 1–3 | **Files:** `.changeset/lmlm-phase3c-pool-manager.md`, `packages/local-models/README.md`

1. `pnpm --filter @harness-engineering/local-models build && pnpm --filter @harness-engineering/local-models typecheck && pnpm --filter @harness-engineering/local-models lint && pnpm --filter @harness-engineering/local-models test`.
2. `pnpm exec harness validate` — no new local-models findings against the pre-existing baseline.
3. `.changeset/lmlm-phase3c-pool-manager.md` — minor bump mirroring the Phase 3a / 3b changeset tone (what landed, what's still deferred to which phase).
4. README — replace the Phase 3b status note with a Phase 3c note that lists `PoolManager` alongside the existing modules and notes what still defers to later phases.

Acceptance: every command exits 0; the README diff matches the Phase 3a / 3b precedent (single paragraph + bullet for the new module).
