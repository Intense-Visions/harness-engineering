# Plan: Phase 2 — Core-State Projection + Snapshot

**Date:** 2026-06-27 | **Spec:** docs/changes/event-sourced-state-model/proposal.md | **Tasks:** 6 | **Time:** ~35 min | **Integration Tier:** medium

## Goal

Add a pure `projectCoreState` reducer (the legacy `HarnessState` bridge) plus a derived `state.snapshot.json` materialization layer (`reduce`, `materialize`, `readSnapshot`, staleness detection), proving the spec's core invariant `reduce(loadEvents(scope)) === readSnapshot(scope)` — strictly additive, replacing no existing `saveState`/`loadState` caller.

## Scope Discipline

In scope (Phase 2 only): `projectCoreState`, `toHarnessState` adapter, `Snapshot` type with placeholder `lanes`/`audit`, `reduce`, `materialize`, `readSnapshot`, staleness + corruption fallback, debounced schedule. **Out of scope** (Phases 3-6, do NOT touch): the lane machine / `projectLanes`, `projectAudit`, genesis migration cutover, rewiring `manage_state`/`recordInteraction`, removing `saveState` mutations, retiring `events.jsonl`. No existing `loadState`/`saveState` caller changes in this phase.

## Observable Truths (Acceptance Criteria)

1. **(SC2 — core invariant)** For arbitrary generated core-state event sequences across multiple `writerId`s, `reduce(loadEvents(scope))` deep-equals `readSnapshot(scope)` on the computed path; and after `materialize(scope)`, a subsequent up-to-date `readSnapshot(scope)` still deep-equals `reduce(loadEvents(scope))`.
2. **(Field-merge)** When concurrent writers append, `decisions` and `blockers` **union** (keyed by id — no append is lost); scalar fields (`position`, a `progress` entry's status, a `blocker`'s status) resolve by **deterministic last-event-wins on highest `(seq, writerId)`**.
3. **(Purity)** `projectCoreState(events)` performs no IO and returns identical output for any input ordering (it defensively sorts by `(seq asc, writerId asc)` internally), and seeds its baseline from a `state_imported` genesis event's `legacyState`.
4. **(Legacy bridge)** `toHarnessState(readSnapshot(scope).coreState)` returns a value that `HarnessStateSchema.parse()` accepts (`schemaVersion: 1`, `position` `{phase?,task?}`, `decisions`, `blockers`, `progress`, optional `lastSession`).
5. **(Corruption recovery)** A garbage / unparseable `state.snapshot.json` causes `readSnapshot` to fall back to `reduce(loadEvents())`, returns `Ok`, and **never throws**.
6. **(Staleness, read path never writes)** When `tailSeq > snapshot.meta.lastSeq` (or the snapshot is absent), `readSnapshot` returns the freshly `reduce`-computed result and does **not** mutate `state.snapshot.json` synchronously on the read path (it schedules a debounced `materialize`).
7. **(Sole writer, atomic, additive subdocuments)** `materialize` is the only writer of `state.snapshot.json`; it writes atomically (temp + rename, matching `state-persistence.ts:54`) a `{ coreState, lanes: {}, audit: {}, meta: { lastSeq } }` (`schemaVersion: 2`) where `lanes`/`audit` are empty placeholders typed so Phases 4-5 extend them additively.
8. **(Additive / Phase 1 green)** The full `event-sourcing` module test suite stays green; no legacy `saveState`/`loadState` caller is modified.
9. **(Health)** `harness validate` reports no new findings vs. the pre-existing baseline; `generate:barrels:check` is green.

## File Map

- MODIFY `packages/core/src/state/event-sourcing/events.ts` (additive schema: reshape `position_set` payload to a superset, add `context?` to `decision_recorded`, add `blocker_opened` / `blocker_resolved` / `progress_set` / `session_summarized`; extend `StoredEventSchema` enum, `EventInput`, `EventSchema`)
- MODIFY `packages/core/src/state/event-sourcing/constants.ts` (add `SNAPSHOT_FILE`)
- CREATE `packages/core/src/state/event-sourcing/projections/core-state.ts` (`CoreStateProjection` type, `projectCoreState`, `toHarnessState`)
- CREATE `packages/core/src/state/event-sourcing/snapshot.ts` (`Snapshot` / `LanesProjection` / `AuditProjection` types, `reduce`, `materialize`, `readSnapshot`, `isStale`, debounced `scheduleMaterialize`, `__resetMaterializeTimersForTests`)
- MODIFY `packages/core/src/state/event-sourcing/index.ts` (barrel exports)
- CREATE `packages/core/tests/state/event-sourcing/projections/core-state.test.ts`
- CREATE `packages/core/tests/state/event-sourcing/snapshot.test.ts`
- CREATE `packages/core/tests/state/event-sourcing/snapshot.property.test.ts`
- MODIFY `packages/core/tests/state/event-sourcing/events.test.ts` (assert new variants parse; `position_set` superset back-compat)

## Skeleton

_Not produced — standard rigor, task count (6) is below the skeleton threshold (8)._

## Key Design Decisions (carried into tasks)

- **DP1 — `position_set` stays additive via a superset payload.** Phase 1 stored `position_set` as `{ position: string }` and 24+ Phase-1 fixtures rely on it. Rather than reshaping (which would force a 5-file atomic commit and break Phase 1 fixtures), the payload becomes `{ phase?: string; task?: string; position?: string }`. `projectCoreState` reads `phase`/`task` into the legacy `position` object and ignores the vestigial `position` string. Phase 3 reauthors the generic fixtures and drops `position`.
- **DP2 — `lanes`/`audit` are empty placeholder subdocuments.** Typed as empty object interfaces in Phase 2 so the `Snapshot` shape is stable and Phases 4-5 extend them additively. `reduce` sets `lanes: {}` and `audit: {}` with a `// Phase 4/5` marker; no `projections/lanes.ts` or `projections/audit.ts` is created.
- **DP3 — `eventLogPaths` stays module-internal** (per Phase 1 finding I3). `snapshot.ts` imports `eventLogPaths` and `readTailSeq` from `./log` directly (same module) to resolve the log path for staleness — it is not re-exported from the barrel.
- **DP4 — `readSnapshot` never writes on the read path.** On stale/absent/corrupt snapshot it returns `reduce(loadEvents())` and calls `scheduleMaterialize` (debounced). `materialize` is the sole writer. Snapshot is non-authoritative, so a torn/lost materialize is a cache miss, not data loss.
- **DP5 — no fast-check dependency.** The repo has none; the SC2 property test uses a hand-rolled seeded PRNG generating many randomized valid event sequences.

## Tasks

### Task 1: Extend the event schema additively with core-state variants (TDD)

**Depends on:** none | **Files:** `packages/core/src/state/event-sourcing/events.ts`, `packages/core/tests/state/event-sourcing/events.test.ts`

1. Add to `events.test.ts` (after existing cases) a `describe('phase-2 core-state variants')` block asserting `EventSchema.safeParse(...)` **succeeds** for one well-formed event of each new/extended type and `EventInput` compiles for each. Exact cases:
   - `position_set` with `{ phase: 'p1', task: 't1' }` → success; **and** legacy `{ position: 'P1' }` → success (back-compat, DP1).
   - `decision_recorded` with `{ id: 'd1', text: 'x', context: 'c' }` → success; legacy `{ id: 'd1', text: 'x' }` → success.
   - `blocker_opened` `{ id: 'b1', description: 'desc' }` → success; missing `description` → failure.
   - `blocker_resolved` `{ id: 'b1' }` → success.
   - `progress_set` `{ task: 't1', status: 'in_progress' }` → success; `status: 'bogus'` → failure.
   - `session_summarized` `{ summary: 's', lastSkill: 'k', pendingTasks: ['a'] }` → success; `{ summary: 's' }` → success.
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/events.test.ts` — observe failures (new types unknown).
3. Edit `events.ts`:
   - Replace `PositionSetPayload` with the superset:
     ```ts
     const PositionSetPayload = z.object({
       phase: z.string().optional(),
       task: z.string().optional(),
       position: z.string().optional(), // DP1: vestigial Phase-1 field, dropped in Phase 3
     });
     ```
   - Extend `DecisionRecordedPayload`:
     ```ts
     const DecisionRecordedPayload = z.object({
       id: z.string(),
       text: z.string(),
       context: z.string().optional(),
     });
     ```
   - Add payloads:
     ```ts
     const BlockerOpenedPayload = z.object({ id: z.string(), description: z.string() });
     const BlockerResolvedPayload = z.object({ id: z.string() });
     const ProgressSetPayload = z.object({
       task: z.string(),
       status: z.enum(['pending', 'in_progress', 'complete']),
     });
     const SessionSummarizedPayload = z.object({
       date: z.string().optional(),
       summary: z.string(),
       lastSkill: z.string().optional(),
       pendingTasks: z.array(z.string()).optional(),
     });
     ```
   - Add the four new members to the `EventSchema` discriminated union (envelopeShape + `type: z.literal(...)` + `payload`).
   - Extend `StoredEventSchema`'s `type` enum to include `'blocker_opened'`, `'blocker_resolved'`, `'progress_set'`, `'session_summarized'`.
   - Extend the `EventInput` union with the four new `{ type; payload }` members.
4. Run: `npx vitest run packages/core/tests/state/event-sourcing/` — observe the new cases pass AND all Phase 1 tests stay green (superset keeps legacy `position_set` valid).
5. Run: `npx tsc --noEmit -p packages/core` then `harness validate`.
6. Commit: `feat(core): extend event schema with phase-2 core-state variants`

### Task 2: Implement `projectCoreState` + `toHarnessState` with field-merge semantics (TDD)

**Depends on:** Task 1 | **Files:** `packages/core/src/state/event-sourcing/projections/core-state.ts`, `packages/core/tests/state/event-sourcing/projections/core-state.test.ts`

1. Create `core-state.test.ts` with these `describe` blocks (build `Event[]` literals directly — the projection takes in-memory events):
   - **happy path:** events for `position_set`, two `decision_recorded` (distinct ids), `blocker_opened` then `blocker_resolved` (same id), two `progress_set` (distinct tasks), `session_summarized` → assert `projectCoreState(events)` yields legacy-shaped `position`, `decisions` (2), `blockers` (1, status `resolved`), `progress` (2 keys), `lastSession`.
   - **genesis seed:** a `state_imported` event whose `payload.legacyState` is a full legacy `HarnessState` → assert its fields seed the baseline, and a later `position_set` overlays it.
   - **field-merge / union:** decisions from writers `a` and `b` (distinct ids, interleaved seqs) → both present (union, no loss). Blockers likewise.
   - **field-merge / scalar last-event-wins:** two `position_set` events `{seq:1,writerId:'b'}` and `{seq:1,writerId:'a'}` → `(1,'b')` wins (higher `writerId` tiebreak). Two `progress_set` on the same task with `{seq:2}` vs `{seq:3}` → seq 3 wins. `blocker_opened{seq:1}` + `blocker_resolved{seq:2}` → `resolved`; reversed seqs → `open`.
   - **purity / order independence:** shuffle the input array → identical output (defensive internal sort).
   - **toHarnessState:** `HarnessStateSchema.parse(toHarnessState(projectCoreState(events)))` does not throw and round-trips fields.
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/projections/core-state.test.ts` — observe failures (module missing).
3. Create `projections/core-state.ts`:
   - Export `interface CoreStateProjection { position: { phase?: string; task?: string }; decisions: Array<{ date: string; decision: string; context: string }>; blockers: Array<{ id: string; description: string; status: 'open' | 'resolved' }>; progress: Record<string, 'pending' | 'in_progress' | 'complete'>; lastSession?: { date: string; summary: string; lastSkill?: string; pendingTasks?: string[] } }`.
   - `export function projectCoreState(events: Event[]): CoreStateProjection` — copy + sort by `(seq asc, writerId asc)` (reuse the same comparator as `loadEvents`), seed from any `state_imported.legacyState` (loosely validated via `HarnessStateSchema.safeParse`; ignore if invalid), then fold:
     - `position_set` → overwrite `position = { phase, task }` from payload `phase`/`task` (ignore vestigial `position` string).
     - `decision_recorded` → upsert into a `Map<id, {date,decision,context}>` keyed by `payload.id`; `date = event.timestamp` (or its date portion), `decision = payload.text`, `context = payload.context ?? ''`. Emit `Array.from(map.values())`.
     - `blocker_opened` → upsert `Map<id, {id,description,status}>` with `status:'open'`; `blocker_resolved` → set that id's `status:'resolved'` (create a stub `{id, description:'', status:'resolved'}` if it does not yet exist).
     - `progress_set` → `progress[payload.task] = payload.status`.
     - `session_summarized` → overwrite `lastSession = { date: payload.date ?? event.timestamp, summary, lastSkill?, pendingTasks? }`.
   - Because input is sorted ascending, "later overwrites" gives last-event-wins on `(seq, writerId)` for scalars; the keyed Maps give union for decisions/blockers.
   - `export function toHarnessState(core: CoreStateProjection): HarnessState` — return `{ schemaVersion: 1, position: core.position, decisions: core.decisions, blockers: core.blockers, progress: core.progress, ...(core.lastSession ? { lastSession: core.lastSession } : {}) }` (import `HarnessState` from `../../types`).
4. Run the test file — observe pass. Run `npx vitest run packages/core/tests/state/event-sourcing/` — full suite green.
5. Run: `npx tsc --noEmit -p packages/core` then `harness validate`.
6. Commit: `feat(core): add projectCoreState reducer and toHarnessState bridge`

### Task 3: Compose `reduce` + write `materialize` (atomic, sole writer) (TDD)

**Depends on:** Task 2 | **Files:** `packages/core/src/state/event-sourcing/snapshot.ts`, `packages/core/src/state/event-sourcing/constants.ts`, `packages/core/tests/state/event-sourcing/snapshot.test.ts`

1. Add to `constants.ts`: `export const SNAPSHOT_FILE = 'state.snapshot.json';`
2. Create `snapshot.test.ts` (use `mkdtempSync` temp dirs as in `log.test.ts`; import `emitEvent`, `loadEvents`, `resetLocalCountersForTests` from `../../../src/state/event-sourcing/log` and `__resetWriterIdForTests`). Cases:
   - **reduce shape:** emit a few core-state events, then `const snap = reduce(events)` (events from `loadEvents`) → assert `snap.schemaVersion === 2`, `snap.coreState` equals `projectCoreState(events)`, `snap.lanes` deep-equals `{}`, `snap.audit` deep-equals `{}`, `snap.meta.lastSeq` equals the max `seq` (0 for empty).
   - **materialize writes atomically:** call `materialize(dir)` → assert `state.snapshot.json` exists, its parsed content deep-equals `reduce(loadEvents(dir))`, and no `*.tmp` sibling remains.
   - **materialize is reduce+write only:** materialize on an empty log → file written with default coreState and `meta.lastSeq: 0`.
3. Run: `npx vitest run packages/core/tests/state/event-sourcing/snapshot.test.ts` — observe failures.
4. Create `snapshot.ts`:
   - Types: `export interface LanesProjection {}` and `export interface AuditProjection {}` (empty placeholders, Phases 4-5 extend additively — add a `// Phase 4 / Phase 5` comment); `export interface Snapshot { schemaVersion: 2; coreState: CoreStateProjection; lanes: LanesProjection; audit: AuditProjection; meta: { lastSeq: number } }`.
   - `export function reduce(events: Event[]): Snapshot` → `{ schemaVersion: 2, coreState: projectCoreState(events), lanes: {}, audit: {}, meta: { lastSeq: events.reduce((m, e) => Math.max(m, e.seq), 0) } }`.
   - `export async function materialize(projectPath, options?): Promise<Result<void, Error>>` — resolve `dir` via `eventLogPaths(projectPath, options)` (import from `./log`), `loadEvents` → on `Err` return it; `reduce`; atomic write to `path.join(dir, SNAPSHOT_FILE)` via temp + `renameSync` (mirror `state-persistence.ts:52-56`); wrap in try/catch → `Err`.
5. Run the test file then the full module suite — observe pass.
6. Run: `npx tsc --noEmit -p packages/core` then `harness validate`.
7. Commit: `feat(core): add reduce composition and materialize (sole snapshot writer)`

### Task 4: `readSnapshot` — staleness, corruption fallback, debounced schedule (TDD)

**Depends on:** Task 3 | **Files:** `packages/core/src/state/event-sourcing/snapshot.ts`, `packages/core/tests/state/event-sourcing/snapshot.test.ts`

1. Add to `snapshot.test.ts`:
   - **fresh hit:** `materialize(dir)`, then tamper the on-disk `coreState` to a sentinel value and rewrite the file (keeping `meta.lastSeq === tailSeq`) → `readSnapshot(dir)` returns the **stored** (sentinel) snapshot, proving it did not recompute.
   - **staleness recompute, no write:** `materialize(dir)`, capture file mtime/content, then `emitEvent` a new event (tailSeq now > lastSeq) → `readSnapshot(dir)` returns a value deep-equal to `reduce(loadEvents(dir))` (fresh), AND the on-disk file is **unchanged immediately after the read** (assert content identical — truth #6).
   - **corruption fallback:** write `'{ not json'` to `state.snapshot.json` → `readSnapshot(dir)` returns `Ok` deep-equal to `reduce(loadEvents(dir))` and does not throw.
   - **missing fallback:** no snapshot file → `readSnapshot` returns `reduce(loadEvents(dir))`.
   - **schedule fires materialize:** with `vi.useFakeTimers()`, do a stale `readSnapshot`, assert file still stale, then `vi.runAllTimers()` + await the flushed materialize (via `__resetMaterializeTimersForTests` flush or awaiting the scheduled promise) → file now deep-equals `reduce`. Reset timers in `afterEach`.
2. Run the file — observe new cases fail.
3. Edit `snapshot.ts`:
   - `export function isStale(snapshot: Snapshot | null, tailSeq: number): boolean` → `snapshot === null || tailSeq > snapshot.meta.lastSeq`.
   - Module-level debounce: `const pendingTimers = new Map<string, NodeJS.Timeout>()` and `export const MATERIALIZE_DEBOUNCE_MS = 50;`. `function scheduleMaterialize(projectPath, options, key)` clears any existing timer for `key`, sets a new `setTimeout(() => { void materialize(projectPath, options); }, MATERIALIZE_DEBOUNCE_MS)`; `timer.unref?.()`.
   - `export function __resetMaterializeTimersForTests()` → clear all timers and the map (test-only, not barrel-exported — mirrors `__resetWriterIdForTests`).
   - `export async function readSnapshot(projectPath, options?): Promise<Result<Snapshot, Error>>`:
     - resolve `{ dir, logPath }` via `eventLogPaths`; `tailSeq = readTailSeq(logPath)`.
     - try to read + `JSON.parse` `state.snapshot.json`; on any read/parse error treat as `null` (corrupt = cache miss).
     - if `isStale(stored, tailSeq)` → `loadEvents` (on `Err` return it) → `const fresh = reduce(events)`; `scheduleMaterialize(projectPath, options, logPath)`; return `Ok(fresh)`. **Do not write here.**
     - else return `Ok(stored)`.
4. Run the file then full module suite — observe pass.
5. Run: `npx tsc --noEmit -p packages/core` then `harness validate`.
6. Commit: `feat(core): add readSnapshot with staleness, corruption fallback, debounced materialize`

### Task 5: SC2 property test — `reduce(events) === readSnapshot()` (TDD)

**Depends on:** Task 4 | **Files:** `packages/core/tests/state/event-sourcing/snapshot.property.test.ts`

[checkpoint:human-verify] After this task, show the green property-test output and the full `event-sourcing` suite to confirm the spec's central invariant (SC2) holds before proceeding.

1. Create `snapshot.property.test.ts`:
   - A small seeded PRNG (e.g., mulberry32) — no fast-check dependency (DP5).
   - For ~200 seeds: generate a random sequence of 0-30 core-state `EventInput`s with random types, random ids drawn from a small pool (to force union + scalar contention), then `emitEvent` each across 1-3 alternating `writerId`s (set via `HARNESS_EVENT_WRITER_ID` or `__resetWriterIdForTests` between writer switches) into a fresh temp dir.
   - Assert `expect(reduce(await loadEvents(dir))).toEqual((await readSnapshot(dir)).value)` (computed path, stale/missing snapshot).
   - Then `await materialize(dir)`, then assert an up-to-date `readSnapshot(dir)` still `.toEqual(reduce(await loadEvents(dir)))` (fresh-hit path).
   - Reset writer-id/local-counters/materialize timers per iteration.
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/snapshot.property.test.ts` — observe pass (write minimal then expand iteration count if any seed fails; a failing seed is a real reducer/snapshot bug to fix, not a test to weaken).
3. Run the full module suite: `npx vitest run packages/core/tests/state/event-sourcing/`.
4. Run: `harness validate`.
5. Commit: `test(core): add SC2 property test reduce(events) === readSnapshot()`

### Task 6: Barrel exports + barrels check (integration)

**Depends on:** Task 5 | **Files:** `packages/core/src/state/event-sourcing/index.ts` | **Category:** integration

1. Edit `index.ts` to add:
   - `export { projectCoreState, toHarnessState } from './projections/core-state';`
   - `export type { CoreStateProjection } from './projections/core-state';`
   - `export { reduce, materialize, readSnapshot, isStale, MATERIALIZE_DEBOUNCE_MS } from './snapshot';`
   - `export type { Snapshot, LanesProjection, AuditProjection } from './snapshot';`
   - (`SNAPSHOT_FILE` already flows via the existing `export * from './constants'`.)
   - Do **not** export `__resetMaterializeTimersForTests`, `scheduleMaterialize`, or `eventLogPaths` (test-only / module-internal per DP3).
   - The parent `packages/core/src/state/index.ts` already re-exports the module via `export * as eventSourcing from './event-sourcing'` — no change needed there.
2. Run: `npx tsc --noEmit -p packages/core`.
3. Run: `pnpm --filter @intense-visions/core run generate:barrels:check` (or the repo's `generate:barrels:check` script) — observe green.
4. Run: `npx vitest run packages/core/tests/state/event-sourcing/` — full suite green.
5. Run: `harness validate` — confirm no new findings vs. baseline.
6. Commit: `feat(core): export phase-2 core-state projection and snapshot API`

## Sequencing

Linear: Task 1 (schema) → Task 2 (projection) → Task 3 (reduce+materialize) → Task 4 (readSnapshot) → Task 5 (property) → Task 6 (barrel). No parallelism (Tasks 3-4 share `snapshot.ts`; Task 5 depends on the full read/write path). Estimated ~35 min total.

## Concerns

- **Phase 1 placeholder reshape (DP1):** keeping `position_set.position` as a vestigial superset field avoids a 5-file atomic commit and keeps Phase 1's 24+ fixtures green; Phase 3 must reauthor those fixtures and drop the field.
- **Placeholder subdocuments (DP2):** `lanes`/`audit` typed as empty interfaces; Phases 4-5 must extend them additively so the `Snapshot` envelope shape stays stable.
- **Debounce uses real timers:** single-process debounce only. Multi-process `materialize` races resolve as last-write-wins on an atomic rename of a non-authoritative derived file (safe — `readSnapshot` never trusts it blindly). Tests use `vi.useFakeTimers` + a `__reset` hook.
- **No fast-check (DP5):** SC2 uses a hand-rolled seeded PRNG; reviewers should note this is intentional (no new dependency).
- **`harness validate` baseline:** ~353 pre-existing findings + 2 pre-existing circular deps (`drift/...`, `craft/llm/...`) are unrelated to this module; "validate passes" means **no new** findings.
- **Pre-commit arch check** reports scope-mismatched module-size/dep-depth false positives (per Phase 1 handoff) — known-noise, non-blocking.
- **`state_imported` handling:** Phase 2's reducer must seed from `legacyState` so an imported log replays correctly, even though the genesis event itself is emitted in Phase 3 (forward-compatible).
