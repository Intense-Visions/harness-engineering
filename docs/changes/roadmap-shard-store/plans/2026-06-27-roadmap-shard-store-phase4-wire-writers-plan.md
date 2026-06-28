# Plan: Phase 4 — Wire writers through the RoadmapStore

**Date:** 2026-06-27 | **Spec:** docs/changes/roadmap-shard-store/proposal.md (Phase 4) | **Tasks:** 24 | **Time:** ~95 min | **Integration Tier:** large

## Goal

Route every roadmap writer and content-reader through `RoadmapStore` so that, in
sharded mode, each logical mutation rewrites exactly one shard file (conflict-free by
construction), while monolith mode is byte-for-byte unchanged — shrinking the
`ROADMAP_READ_ALLOWLIST` "Phase 4: remove" subset to empty without breaking the
read-source invariant (R) guard test.

## Observable Truths (Acceptance Criteria)

1. **Monolith parity (ubiquitous).** With no `docs/roadmap.d/`, `manage_roadmap`
   `add`/`update`/`remove`/`promote`/`sync`/`groom` and `autoSyncRoadmap` produce a
   `roadmap.md` byte-identical to pre-Phase-4 behavior (regression fixtures pass).
2. **Single-shard writes (event-driven).** When a writer mutates feature X while
   `docs/roadmap.d/` exists, the system shall rewrite only `docs/roadmap.d/<slug-X>.md`
   (and regenerate the aggregate) — never any other shard. Verified by a write-scope
   test asserting exactly one shard mtime/content changes per single-feature mutation.
3. **Remove deletes one shard.** `manage_roadmap remove` in sharded mode deletes exactly
   `docs/roadmap.d/<slug>.md` and no other file.
4. **#667 preserved (state-driven).** While the event-sourced snapshot drives status,
   `autoSyncRoadmap` shall load via the store, run `syncRoadmap` (unchanged), apply
   changes per-shard, and still fire external sync — and the assignee-lifecycle invariant
   (`assignee ≠ null ⟺ in-progress`) shall hold on every write.
5. **sync-engine per-shard writeback.** `fullSync` writeback in sharded mode patches only
   the rows whose status/fields changed, each its own shard.
6. **Readers read the source.** `prediction-engine`, `publish-analyses`, and
   `sync-analyses` obtain their `Roadmap` from `resolveRoadmapStore().load()` (shards when
   sharded), not a direct `roadmap.md` parse.
7. **Invariant R guard green + subset empty.** `roadmap-read-source.repo.test.ts` passes
   and no entry in `ROADMAP_READ_ALLOWLIST` carries the `// Phase 4: remove` annotation.
8. **Gates held.** `harness validate` = 365 (post-merge baseline), `harness check-deps` = 2
   (pre-existing cli cycles). No NEW findings.
9. **Store API extended.** New exports `removeFeature` (interface + both backends),
   `resolveRoadmapStore`, `applyRoadmapDiff`, and a core node-fs IO adapter pass unit tests
   including store-parity (factory picks `ShardStore` iff `docs/roadmap.d/` exists).

## Uncertainties

- **[ASSUMPTION → DECISION T1]** A minimal `resolveRoadmapStore` factory (detect by
  presence of `docs/roadmap.d/`) is pulled FORWARD into Phase 4. The spec puts full
  `sharded` mode detection in `load-mode.ts` in Phase 6. Phase 4 writers cannot work in
  both modes without detection now, so a minimal, presence-based factory is the cleanest
  approach; Phase 6 can later fold it into `load-mode.ts`. If rejected, every writer task
  needs an alternative mode signal and the plan changes materially. **Recommended: accept.**
- **[BLOCKING → DECISION T1]** `RoadmapStore` has no `removeFeature` and no multi-row
  operation. `remove`, `groom`, and `sync` cannot be expressed with `patchFeature`/
  `addFeature` alone. Plan assumes we (a) add `removeFeature(slug)` to the interface + both
  backends and (b) add an `applyRoadmapDiff(store, before, after)` helper that diffs the
  in-memory `Roadmap` and emits per-shard add/patch/remove calls. Without this the
  multi-row writers cannot migrate. **Recommended: accept (foundation milestone 4A).**
- **[BLOCKING → DECISION T19]** The invariant-R detector matches only the literal
  `roadmap.md` substring. Four real readers/writers thread the path through a variable and
  are therefore NOT on the allowlist and NOT flagged: `packages/dashboard/src/server/
  routes/actions.ts` (writer), `packages/dashboard/src/server/gather/roadmap.ts` (reader),
  `packages/orchestrator/src/server/routes/roadmap-actions.ts` (writer),
  `packages/orchestrator/src/tracker/adapters/roadmap.ts` (writer). Migrating only the
  allowlisted files makes the guard pass but does NOT actually establish invariant R.
  Decision: migrate these in Phase 4 (recommended — they are independent contention
  writers) OR defer them AND tighten the detector to catch path-variable threading so they
  are tracked. **Recommended: migrate dashboard + orchestrator content writers in 4E.**
- **[ASSUMPTION → DECISION T1]** Sharded writes regenerate the aggregate `roadmap.md`
  immediately after a single-shard patch (cheap, keeps the aggregate fresh for same-process
  readers and matches "regenerate aggregate" in the auto-sync requirement), in addition to
  the Phase-3 git hook. If rejected, rely on the hook only and accept transient staleness
  (cosmetic per R). **Recommended: regenerate-after-write inside the factory's patch path.**
- **[DEFERRABLE]** Some allowlist entries name `roadmap.md` as a legitimate *file* path
  (orchestrator seed/watch paths, the file-less `migrate/run` archive, the `roadmap-mode`
  existence check) — these are NOT content reads and do not violate R. They are
  re-annotated PERMANENT-permitted rather than migrated (T23).

## File Map

### Core — store foundation (4A)
- MODIFY packages/core/src/roadmap/store/roadmap-store.ts (add `removeFeature` to interface)
- MODIFY packages/core/src/roadmap/store/monolith-store.ts (implement `removeFeature`)
- MODIFY packages/core/src/roadmap/store/shard-store.ts (implement `removeFeature`; extend `ShardIO` with `deleteFile`)
- CREATE packages/core/src/roadmap/store/node-io.ts (`createNodeRoadmapIO` — fs-backed FileIO+ShardIO+delete for core writers)
- CREATE packages/core/src/roadmap/store/node-io.test.ts
- CREATE packages/core/src/roadmap/store/factory.ts (`resolveRoadmapStore`)
- CREATE packages/core/src/roadmap/store/factory.test.ts
- CREATE packages/core/src/roadmap/store/apply-diff.ts (`applyRoadmapDiff`)
- CREATE packages/core/src/roadmap/store/apply-diff.test.ts
- MODIFY packages/core/src/roadmap/store/index.ts (barrel exports)
- MODIFY packages/core/src/roadmap/store/monolith-store.test.ts / shard-store.test.ts (removeFeature)

### CLI — manage_roadmap (4B)
- MODIFY packages/cli/src/mcp/tools/roadmap.ts (read/write seams → store; all 6 handlers)
- MODIFY packages/cli/src/mcp/tools/roadmap.test.ts (parity + sharded-scope cases)

### Auto-sync + sync-engine (4C)
- MODIFY packages/cli/src/mcp/tools/roadmap-auto-sync.ts
- MODIFY packages/cli/src/mcp/tools/roadmap-auto-sync.test.ts
- MODIFY packages/core/src/roadmap/sync-engine.ts (writeback via store; signature)
- MODIFY packages/core/src/roadmap/sync-engine.test.ts

### Readers (4D)
- MODIFY packages/core/src/architecture/prediction-engine.ts
- MODIFY packages/cli/src/commands/publish-analyses.ts
- MODIFY packages/cli/src/commands/sync-analyses.ts
- (+ their tests)

### Dashboard + orchestrator hidden writers (4E, conditional on T19)
- MODIFY packages/dashboard/src/server/context.ts, gather/roadmap.ts, routes/actions.ts
- MODIFY packages/orchestrator/src/server/routes/roadmap-actions.ts, tracker/adapters/roadmap.ts

### Allowlist sweep + rewording (4E)
- MODIFY packages/core/src/validation/roadmap-read-source.ts (shrink allowlist; re-annotate permanents)
- MODIFY (reword incidental refs) packages/core/src/roadmap/{pilot-scoring,health,assignee-lifecycle,mode}.ts, packages/core/src/roadmap/migrate/{plan-builder,types}.ts, packages/cli/src/config/schema.ts, packages/cli/src/mcp/tools/roadmap-file-less.ts, packages/orchestrator/src/core/candidate-selection.ts, packages/types/src/orchestrator.ts
- CREATE .changeset/roadmap-shard-store-phase4.md

## Skeleton (standard rigor, >= 8 tasks → produced)

1. **4A Store foundation** — interface `removeFeature`, core node-fs IO, `resolveRoadmapStore` factory, `applyRoadmapDiff`, regen-after-write (~5 tasks, ~22 min)
2. **4B manage_roadmap** — read/write seam + 6 handler migrations + allowlist drop (~7 tasks, ~30 min)
3. **4C auto-sync + sync-engine** — #667-coupled writeback, external-sync rework (~2 tasks, ~14 min)
4. **4D content readers** — prediction-engine, publish-analyses, sync-analyses (~3 tasks, ~12 min)
5. **4E allowlist sweep** — scope decision, dashboard/orchestrator writers, reword incidentals, re-annotate permanents, final guard sweep + changeset (~7 tasks, ~17 min)

**Estimated total:** 24 tasks, ~95 min. _Skeleton approval: PENDING (single-shot planning — present to the human alongside the scope decisions T1/T19 before executing 4A)._

> **Milestone boundaries for pausing:** after 4A (foundation lands, no caller changed),
> after 4B (manage_roadmap fully on store), after 4C (highest-risk #667 path done). Each
> boundary leaves the tree green and gates at baseline.

---

## Tasks

### Task 1: [checkpoint:decision] Lock the foundation shape

**Depends on:** none | **Files:** none (decision only)

Present and confirm, in one decision, the four foundation choices that gate every later
task (see Uncertainties). Do NOT write code until confirmed.

1. **Factory pulled forward:** add minimal `resolveRoadmapStore({ projectRoot })` →
   `ShardStore` iff `docs/roadmap.d/` exists, else `MonolithStore`. (Phase 6 later folds
   into `load-mode.ts`.)
2. **Interface extension:** add `removeFeature(slug)` + an `applyRoadmapDiff(store,
   before, after)` helper for multi-row writers (`sync`, `groom`).
3. **Regenerate-after-write:** in sharded mode the store patch path regenerates the
   aggregate `roadmap.md` immediately (in addition to the git hook).
4. **Recommended option set = accept all four.**

Record the outcome in the session `decisions` state. If rejected, STOP and re-plan 4A.

---

### Task 2: Add `removeFeature` to the store interface and both backends

**Depends on:** Task 1 | **Files:** store/roadmap-store.ts, store/monolith-store.ts, store/shard-store.ts, store/index.ts, + backend tests

1. Write tests first (`monolith-store.test.ts`, `shard-store.test.ts`):
   - MonolithStore.removeFeature("known-slug") → load() no longer contains it; whole-file
     rewrite; unknown slug → `Err`.
   - ShardStore.removeFeature("known-slug") → `io.deleteFile` called for
     `<shardDir>/known-slug.md` only; unknown slug → `Err` (read fails / not found).
2. Run the two test files — observe failures.
3. Implement:
   - `roadmap-store.ts`: add `removeFeature(slug: string): Promise<Result<void>>;` to the
     `RoadmapStore` interface (JSDoc: "Delete exactly one feature/shard").
   - `shard-store.ts`: extend `ShardIO` with `deleteFile(path: string): Promise<void>;`.
     Implement `removeFeature` = resolve `<shardDir>/<slug>.md`, `await io.deleteFile(path)`
     wrapped in try/Err (mirror `patchFeature`'s not-found error wording).
   - `monolith-store.ts`: implement `removeFeature` = `load()` → splice the feature whose
     `matchSlug` is true from its milestone → `write(roadmap)`; `Err` if none matched
     (mirror `patchFeature`'s "no feature resolves to slug" error).
4. Run both tests — observe pass.
5. Run: `harness validate`
6. Commit: `feat(roadmap): add removeFeature to RoadmapStore and both backends`

### Task 3: Core node-fs IO adapter (`createNodeRoadmapIO`)

**Depends on:** Task 2 | **Files:** store/node-io.ts (CREATE), store/node-io.test.ts (CREATE), store/index.ts

Core writers (sync-engine, prediction-engine) need an fs-backed `ShardIO` without
depending on the CLI's `createNodeShardIO`. Mirror `packages/cli/src/commands/roadmap/
shard-io.ts` but in core.

1. Write `node-io.test.ts`: round-trips a temp dir — `writeFile`/`readFile`/`listDir`/
   `deleteFile` against `node:fs/promises` in an `os.tmpdir()` scratch dir.
2. Run — observe failure.
3. Implement `node-io.ts`: `export function createNodeRoadmapIO(): ShardIO` returning
   `{ readFile, writeFile, listDir, deleteFile }` over `node:fs/promises` (`readFile` utf-8;
   `writeFile` with `mkdir(dirname,{recursive:true})`; `listDir` = `readdir`; `deleteFile`
   = `rm`). Export from `store/index.ts`.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(roadmap): add core node-fs RoadmapIO adapter`

### Task 4: `resolveRoadmapStore` factory (mode detection pulled forward)

**Depends on:** Task 3 | **Files:** store/factory.ts (CREATE), store/factory.test.ts (CREATE), store/index.ts

1. Write `factory.test.ts`:
   - Given a temp project with `docs/roadmap.d/` present → returns a `ShardStore` whose
     `load()` assembles from shards.
   - Given a temp project with only `docs/roadmap.md` → returns a `MonolithStore`.
   - Injectable `exists`/`io` so the test needs no real fs where possible.
2. Run — observe failure.
3. Implement `resolveRoadmapStore({ projectRoot, io? })`:
   - `shardDir = <projectRoot>/docs/roadmap.d`; `roadmapPath = <projectRoot>/docs/roadmap.md`.
   - If shardDir exists (sync `fs.existsSync` is fine here) → `new ShardStore({ shardDir, io
     ?? createNodeRoadmapIO() })`, wrapped so each `patchFeature`/`addFeature`/`removeFeature`
     regenerates `roadmap.md` via `writeRegeneratedRoadmap(shardDir, roadmapPath, io)` after
     the per-shard write (decision T1.3). Else `new MonolithStore({ roadmapPath, io })`.
   - Export from barrel. This file legitimately names `roadmap.md` (path constant) → add to
     allowlist as PERMANENT in Task 23.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `feat(roadmap): add resolveRoadmapStore mode-detection factory`

### Task 5: `applyRoadmapDiff` helper (per-shard multi-row writes)

**Depends on:** Task 4 | **Files:** store/apply-diff.ts (CREATE), store/apply-diff.test.ts (CREATE), store/index.ts

The seam that lets whole-`Roadmap` producers (`sync`, `groom`, promote-cascade) persist as
single-shard writes.

1. Write `apply-diff.test.ts`:
   - before/after with one changed feature → exactly one `patchFeature(slug)`; no other call.
   - added feature → one `addFeature`. removed feature → one `removeFeature`.
   - unchanged features → zero calls (verify via a spy store).
2. Run — observe failure.
3. Implement `applyRoadmapDiff(store, before, after): Promise<Result<void>>`:
   - Build slug→feature maps for both (slug = `slugifyFeatureName(feature.name)`; document
     the D2 slug-identity assumption in a comment).
   - For slugs only in `after` → `addFeature`. Only in `before` → `removeFeature`.
   - In both but `!deepEqual(beforeFeature, afterFeature)` → `patchFeature(slug, () =>
     afterFeature)`. Short-circuit on first `Err`.
   - Export from barrel.
4. Run — observe pass.
5. Run: `harness validate` && `harness check-deps`
6. Commit: `feat(roadmap): add applyRoadmapDiff per-shard writeback helper`

> **Milestone 4A complete** — foundation lands; no caller changed; gates at baseline.

---

### Task 6: manage_roadmap read/write seam → store

**Depends on:** Task 5 | **Files:** packages/cli/src/mcp/tools/roadmap.ts, roadmap.test.ts

Introduce the store seam WITHOUT changing any handler's mutation logic yet — swap the
shared persistence helpers so the read path and the eventual write path go through
`resolveRoadmapStore`. This isolates risk: handler logic (claim/setStatus/cascade/promote/
groom) is untouched.

1. Write tests: a monolith-mode `add` produces byte-identical `roadmap.md` to a golden
   fixture (parity); a sharded-mode fixture project loads through the store.
2. Run — observe failures.
3. Implement: add a module-level `loadRoadmap(projectPath)` =
   `resolveRoadmapStore({ projectRoot: projectPath }).load()` and a
   `persistRoadmap(projectPath, before, after)` = `applyRoadmapDiff(store, before, after)`.
   Replace `readRoadmapFile`+`parseRoadmap` read sites in `handleShow`/`handleQuery` with
   `loadRoadmap`. Keep `readRoadmapFile`/`writeRoadmapFile` temporarily for handlers not yet
   migrated (Tasks 7–12 remove them one by one). `handleShow`/`handleQuery` are read-only —
   no write.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `refactor(mcp): route manage_roadmap reads through RoadmapStore`

### Task 7: Migrate `handleAdd` → `addFeature`

**Depends on:** Task 6 | **Files:** roadmap.ts (handleAdd ~L270), roadmap.test.ts

1. Test: monolith parity for `add`; sharded `add` creates exactly one new shard
   `docs/roadmap.d/<slug>.md` and regenerates the aggregate; no other shard touched.
2. Run — observe failure.
3. Implement: `handleAdd` builds the feature (`buildFeatureFromInput`), resolves milestone
   from a fresh `loadRoadmap`, then `store.addFeature({ slug: slugifyFeatureName(name),
   milestone, order, feature })`. Bump `lastManualEdit` via a meta patch path (monolith:
   load→set→write; sharded: meta is regenerated). Drop the direct `writeRoadmapFile` for this
   handler.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `refactor(mcp): manage_roadmap add writes via store.addFeature`

### Task 8: Migrate `handleUpdate` → patch + diff (preserve #610 + #667)

**Depends on:** Task 7 | **Files:** roadmap.ts (handleUpdate L332–422), roadmap.test.ts

1. Test: monolith parity for status/assignee/spec edits; **first-claim-wins** refusal path
   still returns `claimRefusedResponse` and writes nothing; the #610 unblock-only cascade
   still flips dependents planned and does NOT re-block bystanders; the async `syncRoadmap`
   (#667) is awaited; sharded mode patches only the edited row's shard (+ any cascade-flipped
   dependents, each its own shard).
2. Run — observe failure.
3. Implement: keep the entire in-memory mutation block verbatim (setStatus/claim/release/
   cascade). Capture `before = structuredClone(roadmap)` right after `loadRoadmap`. Replace
   the terminal `writeRoadmapFile(serializeRoadmap(roadmap))` with `persistRoadmap(projectPath,
   before, roadmap)`. The refusal path still returns early with no persist.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `refactor(mcp): manage_roadmap update persists via applyRoadmapDiff`

### Task 9: Migrate `handleRemove` → `removeFeature`

**Depends on:** Task 8 | **Files:** roadmap.ts (handleRemove L424+), roadmap.test.ts

1. Test: monolith parity; sharded `remove` deletes exactly `docs/roadmap.d/<slug>.md` and
   regenerates; unknown feature → unchanged error response, no deletion.
2. Run — observe failure.
3. Implement: resolve the matched feature's slug from `loadRoadmap`, then
   `store.removeFeature(slug)`; map `Err` → existing not-found response. Drop the splice +
   `writeRoadmapFile`.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `refactor(mcp): manage_roadmap remove deletes via store.removeFeature`

### Task 10: Migrate `handlePromote` → add/patch

**Depends on:** Task 9 | **Files:** roadmap.ts (handlePromote ~L486), roadmap.test.ts

1. Test: monolith parity for both promote transitions (existing backlog→planned, and the
   Intake new-row creation); sharded mode — existing-row promote patches one shard, new-row
   promote `addFeature`s exactly one new Intake shard.
2. Run — observe failure.
3. Implement: keep `promoteFeature` producing `nextRoadmap`; capture `before` from
   `loadRoadmap`; persist via `persistRoadmap(projectPath, before, nextRoadmap)` (the diff
   handles the new Intake row as an `addFeature`). Drop the direct `writeRoadmapFile`.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `refactor(mcp): manage_roadmap promote persists via applyRoadmapDiff`

### Task 11: Migrate `handleSync` → load + applyRoadmapDiff

**Depends on:** Task 10 | **Files:** roadmap.ts (handleSync ~L586), roadmap.test.ts

1. Test: monolith parity (sync changes serialized identically); sharded mode — only rows
   whose status actually changed are patched (assert N patched shards == N changes).
2. Run — observe failure.
3. Implement: `loadRoadmap` → `before = structuredClone`; run `syncRoadmap` + `applySyncChanges`
   (unchanged); `persistRoadmap(projectPath, before, roadmap)`. Drop `writeRoadmapFile`.
4. Run — observe pass.
5. Run: `harness validate`
6. Commit: `refactor(mcp): manage_roadmap sync persists per-shard via applyRoadmapDiff`

### Task 12: Migrate `handleGroom` → diff + archive; drop roadmap.ts from allowlist

**Depends on:** Task 11 | **Files:** roadmap.ts (handleGroom ~L622, appendToArchive L142), roadmap.test.ts, validation/roadmap-read-source.ts

1. Test: monolith parity (groom demotes + archives identically); sharded mode — archived
   rows are `removeFeature`'d from the shard dir (one delete per archived row), demoted rows
   patched, and `docs/roadmap-archive.md` still appended (archive stays whole-file — it is
   NOT sharded). After this task, `findRoadmapReadSourceViolations` must not list
   `packages/cli/src/mcp/tools/roadmap.ts`.
2. Run — observe failures.
3. Implement: `groomRoadmap` produces `groomed` + the archived list; `appendToArchive`
   unchanged (whole-file archive write is acceptable and out of scope for sharding);
   `persistRoadmap(projectPath, before, groomed)` for the live roadmap. Remove the
   now-unused `readRoadmapFile`/`writeRoadmapFile`/`roadmapPath` helpers if no handler still
   uses them. Remove `'packages/cli/src/mcp/tools/roadmap.ts'` from `ROADMAP_READ_ALLOWLIST`.
4. Run the repo guard test: `npx vitest run packages/core/src/validation/roadmap-read-source.repo.test.ts` — observe green.
5. Run: `harness validate`
6. Commit: `refactor(mcp): manage_roadmap groom per-shard; drop from read allowlist`

> **Milestone 4B complete** — manage_roadmap fully on the store.

---

### Task 13: [checkpoint:human-verify] Migrate `autoSyncRoadmap` (#667 path)

**Depends on:** Task 12 | **Files:** packages/cli/src/mcp/tools/roadmap-auto-sync.ts, roadmap-auto-sync.test.ts

This is the highest-risk migration: it runs after every state transition and couples to
`syncRoadmap` (now reading the event-sourcing snapshot, #667) and to external sync.

1. Test: in monolith mode, behavior byte-identical (load→syncRoadmap→applySyncChanges→write
   →external sync) including the "no local changes still attempts external sync" branch;
   assignee-lifecycle invariant holds after sync; in sharded mode, only changed rows'
   shards are patched + aggregate regenerated; best-effort swallow still holds (a thrown
   error never propagates).
2. Run — observe failures.
3. Implement: replace `fs.readFileSync(roadmapFile)`+`parseRoadmap` with
   `resolveRoadmapStore({ projectRoot: projectPath }).load()`; `before = structuredClone`;
   keep `syncRoadmap`/`applySyncChanges`; replace `fs.writeFileSync(serializeRoadmap)` with
   `applyRoadmapDiff(store, before, roadmap)`. Rework `triggerExternalSync` to take
   `projectPath` (not a single `roadmapFile`) — see Task 14 for the `fullSync` signature it
   now calls. Keep the `fs.existsSync` "no roadmap — nothing to sync" short-circuit but base
   it on `resolveRoadmapStore` resolving a real source (either `docs/roadmap.d/` or
   `docs/roadmap.md`).
4. Run — observe pass.
5. **[checkpoint:human-verify]** Show: monolith parity diff + a sharded-mode run touching
   only the changed shard. Wait for confirmation that the #667 snapshot behavior and
   assignee invariant are preserved.
6. Run: `harness validate`
7. Commit: `refactor(mcp): autoSyncRoadmap routes through RoadmapStore (preserves #667)`

### Task 14: Migrate `sync-engine` writeback to the store; rebuild core

**Depends on:** Task 13 | **Files:** packages/core/src/roadmap/sync-engine.ts, sync-engine.test.ts; then `pnpm --filter @harness-engineering/core build`

`fullSync` currently takes a bare `roadmapPath`, reads it, mutates in place, and
`fs.writeFileSync`s the whole file (L249–271). In sharded mode there is no single file to
rewrite.

1. Test: monolith mode — push/pull writeback byte-identical; the `syncMutex` serialization
   preserved; sharded mode — only rows changed by push/pull are patched (per-shard). Parse
   errors still return the `errors:[{featureOrId:'*'}]` envelope.
2. Run — observe failures.
3. Implement: change the entry signature to accept a project root (or a `RoadmapStore`)
   instead of `roadmapPath`. Load via `resolveRoadmapStore`; capture `before`; run
   `syncToExternal`/`syncFromExternal` (unchanged, they mutate the in-memory `roadmap`);
   replace the final `fs.writeFileSync(roadmapPath, serializeRoadmap(roadmap))` with
   `applyRoadmapDiff(store, before, roadmap)`. Update `triggerExternalSync` (Task 13) and any
   other `fullSync` callers to the new signature. Remove
   `'packages/core/src/roadmap/sync-engine.ts'` from the allowlist.
4. Run: `npx vitest run packages/core/src/roadmap/sync-engine.test.ts` and the repo guard test — observe pass/green.
5. `pnpm --filter @harness-engineering/core build` (CLI tests resolve core via dist — see Phase 2 learnings).
6. Run: `harness validate` && `harness check-deps`
7. Commit: `refactor(roadmap): sync-engine writeback via RoadmapStore; drop from allowlist`

> **Milestone 4C complete** — #667-coupled write path on the store.

---

### Task 15: Migrate `prediction-engine` reader → store.load()

**Depends on:** Task 14 | **Files:** packages/core/src/architecture/prediction-engine.ts (L457–459), its test

1. Test: prediction reads the same `Roadmap` in monolith mode; in a sharded fixture it reads
   from shards.
2. Run — observe failure.
3. Implement: replace `fs.readFileSync(roadmapPath)`+`parseRoadmap` (L457–459) with
   `await resolveRoadmapStore({ projectRoot: this.rootDir }).load()`. Note `rootDir` here is
   already the docs-parent root; verify the path math (currently `path.join(this.rootDir,
   'roadmap.md')` — the factory expects `<root>/docs/...`; adjust `projectRoot` accordingly).
   Remove `prediction-engine.ts` from the allowlist.
4. Run its test + repo guard — observe pass/green.
5. Run: `harness validate`
6. Commit: `refactor(architecture): prediction-engine reads via RoadmapStore`

### Task 16: Migrate `publish-analyses` reader → store.load()

**Depends on:** Task 15 | **Files:** packages/cli/src/commands/publish-analyses.ts (L84–94), its test

1. Test: external-id mapping unchanged from a monolith fixture; sharded fixture reads shards;
   the "No docs/roadmap.md found" error path preserved as "no roadmap source found".
2. Run — observe failure.
3. Implement: replace the `require('@harness-engineering/core').parseRoadmap` +
   `fs.readFileSync` block with `resolveRoadmapStore({ projectRoot: projectPath }).load()`.
   Remove from allowlist. (Note: this file uses `require`; keep CJS-compat import style.)
4. Run test + guard — pass/green.
5. Run: `harness validate`
6. Commit: `refactor(cli): publish-analyses reads via RoadmapStore`

### Task 17: Migrate `sync-analyses` reader → store.load()

**Depends on:** Task 16 | **Files:** packages/cli/src/commands/sync-analyses.ts (L119–129), its test

1. Test: feature-with-externalId discovery unchanged (monolith); sharded fixture reads shards.
2. Run — observe failure.
3. Implement: same swap as Task 16 (L119–129). Remove from allowlist.
4. Run test + guard — pass/green.
5. Run: `harness validate`
6. Commit: `refactor(cli): sync-analyses reads via RoadmapStore`

> **Milestone 4D complete** — content readers on the store.

---

### Task 18: [checkpoint:decision] Dashboard + orchestrator hidden writers — scope boundary

**Depends on:** Task 17 | **Files:** none (decision only)

Present the detector blind-spot (Uncertainties → BLOCKING T19). Four real readers/writers
thread `roadmap.md` through `ctx.roadmapPath` / config and are NOT flagged by the guard:
`dashboard/.../routes/actions.ts` (write), `dashboard/.../gather/roadmap.ts` (read),
`orchestrator/.../server/routes/roadmap-actions.ts` (write),
`orchestrator/.../tracker/adapters/roadmap.ts` (write).

Decide:
- **A) Migrate them now (Tasks 19–20 run).** Recommended — they are independent contention
  writers; leaving them un-migrated means invariant R is not truly established.
- **B) Defer + tighten the detector** to catch path-variable threading and add them
  (annotated) to the allowlist, with a tracked follow-up.

Record in session `decisions`. If B, skip Tasks 19–20 and instead add a detector-tightening
sub-task + annotated allowlist entries in Task 22.

### Task 19: (if T18=A) Migrate dashboard roadmap read/write → store

**Depends on:** Task 18 | **Files:** packages/dashboard/src/server/context.ts, gather/roadmap.ts, routes/actions.ts, + tests

1. Test: dashboard overview reads the same data (monolith + sharded fixtures); a status-set
   action writes only the affected shard in sharded mode, whole file in monolith; the
   existing `withFileLock(ctx.roadmapPath)` serialization is preserved (lock on the resolved
   source).
2. Run — observe failures.
3. Implement: thread a resolved `RoadmapStore` (or `projectPath`) through `context.ts`
   instead of (or alongside) `roadmapPath`; `gather/roadmap.ts` → `store.load()`;
   `routes/actions.ts` `updateRoadmapContent` / serialize+write → `applyRoadmapDiff`.
4. Run dashboard tests — observe pass.
5. Run: `harness validate`
6. Commit: `refactor(dashboard): roadmap read/write via RoadmapStore`

### Task 20: (if T18=A) Migrate orchestrator roadmap writers → store

**Depends on:** Task 19 | **Files:** packages/orchestrator/src/server/routes/roadmap-actions.ts, tracker/adapters/roadmap.ts, + tests

1. Test: orchestrator roadmap action writeback patches only changed rows (sharded); monolith
   parity.
2. Run — observe failures.
3. Implement: replace the `serializeRoadmap`+write sites with `applyRoadmapDiff` over a
   resolved store. Leave orchestrator *seed-path* / *file-watch* references (orchestrator.ts,
   workflow/config.ts, workspace/manager.ts) untouched — they name the aggregate as a file to
   copy/watch, not a content read (handled in Task 22 re-annotation).
4. Run orchestrator tests — observe pass.
5. Run: `harness validate` && `harness check-deps`
6. Commit: `refactor(orchestrator): roadmap writeback via RoadmapStore`

### Task 21: Reword incidental references; drop them from the allowlist

**Depends on:** Task 20 | **Files:** packages/core/src/roadmap/{pilot-scoring,health,assignee-lifecycle,mode}.ts, migrate/{plan-builder,types}.ts, packages/cli/src/config/schema.ts, packages/cli/src/mcp/tools/roadmap-file-less.ts, packages/orchestrator/src/core/candidate-selection.ts, packages/types/src/orchestrator.ts, validation/roadmap-read-source.ts

These reference `roadmap.md` only in JSDoc/comments/error strings — not content reads.
Per the Phase-3 learning, reword to "roadmap aggregate" / "the roadmap" rather than
allowlisting non-readers.

1. For each file, reword the comment/JSDoc/error string to drop the literal `roadmap.md`
   token (e.g. `roadmap-file-less.ts` L75 error → "file-based roadmap mode"; `mode.ts`,
   `config/schema.ts` JSDoc → "the roadmap aggregate"; `pilot-scoring.ts`/`health.ts`/
   `assignee-lifecycle.ts`/`migrate/*`/`candidate-selection.ts`/`types/orchestrator.ts`
   comments likewise). Preserve meaning; no behavior change.
2. Remove all of these entries from `ROADMAP_READ_ALLOWLIST`.
3. Run the repo guard test — observe green (these files no longer match the detector).
4. Run: `harness validate`
5. Commit: `docs(roadmap): reword incidental roadmap.md refs; shrink read allowlist`

### Task 22: Re-annotate the legitimately-permanent path references

**Depends on:** Task 21 | **Files:** validation/roadmap-read-source.ts (+ orchestrator/workflow/config.ts, workspace/manager.ts, orchestrator.ts, dashboard/context.ts, migrate/run.ts, validation/roadmap-mode.ts if any literal remains)

Some references name `roadmap.md` as a real file path for non-content purposes (orchestrator
seed/watch paths; the file-less `migrate/run` archive move; the `roadmap-mode` existence
check; the factory's path constant from Task 4; the dashboard default path if T18=B). These
do NOT violate invariant R.

1. Move the `// Phase 4: remove …` entries that survive (only the legitimately-permanent
   ones) into the PERMANENT section of the allowlist with a clarified reason comment
   (e.g. "// seed/watch path, not a content read — permitted under R"). Add
   `store/factory.ts`.
2. Verify the `// Phase 4: remove` annotation appears ZERO times in the file (Observable
   Truth 7): `grep -c 'Phase 4: remove' packages/core/src/validation/roadmap-read-source.ts`
   → `0`.
3. Run the repo guard test — observe green.
4. Run: `harness validate`
5. Commit: `chore(roadmap): re-annotate permanent roadmap-aggregate path refs`

### Task 23: Final invariant + gate sweep; update guard-test comment

**Depends on:** Task 22 | **Files:** validation/roadmap-read-source.repo.test.ts (comment), full-suite run

1. Update the repo guard test's docstring: the allowlist has now shrunk to
   `{ regenerator, store, factory, Phase-3 git tooling, permitted path refs }` — remove the
   "shrinks toward { regenerator }" forward-looking wording, state the Phase-4 end state.
2. Run the core + cli roadmap suites and the repo guard:
   `npx vitest run packages/core/src/roadmap packages/core/src/validation/roadmap-read-source.repo.test.ts packages/cli/src/mcp/tools/roadmap.test.ts`
3. Run: `harness validate` (expect 365) && `harness check-deps` (expect 2). If validate
   moved off 365, diff the new findings — they must be zero NEW (baseline-relative).
4. Commit: `test(roadmap): finalize read-source guard for Phase 4 end state`

### Task 24: Changeset

**Depends on:** Task 23 | **Files:** .changeset/roadmap-shard-store-phase4.md (CREATE) | **Category:** integration

1. Create the changeset (minor for `@harness-engineering/core` + `@harness-engineering/cli`;
   include dashboard/orchestrator if T18=A): summarize "roadmap writers and content readers
   route through RoadmapStore — single-shard writes in sharded mode, monolith unchanged;
   added `removeFeature`, `resolveRoadmapStore`, `applyRoadmapDiff`, core node-fs IO."
2. Commit the changeset FIRST (`check:changesets` only sees committed files — Phase 3
   learning), then run: `pnpm run check:changesets`.
3. Commit: `chore(roadmap): add Phase 4 changeset`

> **Milestone 4E complete** — allowlist "Phase 4: remove" subset empty; invariant R holds.

---

## Sequencing notes

- 4A (Tasks 2–5) is pure foundation; 4B–4E depend on it. Tasks 7–12 are strictly ordered
  (they share `roadmap.ts`). Tasks 15–17 (readers) are mutually independent and could run in
  parallel after 4A. Tasks 19–20 are conditional on the Task 18 decision.
- Rebuild `@harness-engineering/core` (`pnpm --filter ... build`) after any core change that
  CLI tests consume (Tasks 5, 14) — CLI vitest resolves core via `dist`.
- Watch the hex-color FP (`/#[0-9a-fA-F]{3,8}\b/`) in fixtures with 1–2 digit issue refs
  (e.g. `#527`) — keep fixture issue numbers ≥ 3 digits or non-hex where the design-token
  validator runs.

## Known-failure cross-check

`.harness/failures.md` not consulted programmatically here — execution must read it (Phase 4
VALIDATE step). Specific live hazards already encoded above: the literal-only detector
blind-spot (T18), the `check:changesets` committed-only discovery (T24), the dist-resolution
rebuild requirement (T14), and the per-commit non-blocking `arch: fail` noise on store code.
