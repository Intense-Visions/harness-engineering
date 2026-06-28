# Plan: Event-Sourced State Model — Phase 6 (Docs + ADRs + Cleanup)

**Date:** 2026-06-27 | **Spec:** docs/changes/event-sourced-state-model/proposal.md | **Tasks:** 12 | **Time:** ~50 min | **Integration Tier:** large

## Goal

Close out the event-sourced state model (#598) with documentation, two ADRs, knowledge-graph entries, the deferred code carry-forwards from Phases 1–5, and the GH-580 roadmap-row close — leaving the codebase fully migrated, documented, and green with zero new validate findings or dependency cycles.

## Observable Truths (Acceptance Criteria)

1. `docs/knowledge/decisions/0048-*.md` exists documenting D2 (event log authoritative; snapshot derived), with required ADR sections and a pointer to the spec's Decisions Made (no decision-text duplication).
2. `docs/knowledge/decisions/0049-*.md` exists documenting D4 (guarded lane state machine; core owns it, orchestrator/autopilot consume it).
3. A knowledge concept doc under `docs/knowledge/core/` documents the six new concepts (append-only event log, projection/read-model, materialized snapshot, lane state machine, transition guards, genesis migration) and the three relationship edges (snapshot —derived-from→ log; lanes-projection —uses→ guards; audit-projection —subsumes→ GH-580).
4. `docs/knowledge/core/state-management.md` no longer describes a mutated `state.json` / schemaVersion-1 model; it describes the event-sourced model and cross-links the new concept doc.
5. `AGENTS.md` describes the event-sourced model, the new `.harness/` on-disk files (`state.events.jsonl`, `state.events.blobs/`, `state.snapshot.json`, `metrics/skill-events.jsonl`) and the retirement of `events.jsonl`, and documents the `manage_state` `task-transition` action plus the snapshot-derived read / event-append write semantics.
6. `packages/core/src/roadmap/sync.ts` `inferStatus` reads root progress via `eventSourcing.readSnapshot` + `toHarnessState` (not `fs.readFileSync('.harness/state.json')`); `syncRoadmap` is async; all production callers `await` it; a core test proves status is inferred from event-sourced progress.
7. `packages/core/src/state/stream-resolver.ts` stream migration moves the event-log files (`state.events.jsonl`, `state.snapshot.json`, `state.events.blobs/`) into `streams/default/`, covered by a test.
8. The `@deprecated` `saveState`/`loadState` definitions and their `state/index.ts` barrel re-export are deleted; the regenerated core barrel no longer exports them; the SC1 guard test asserts they are gone (definition + export), not merely uncalled.
9. The GH-580 roadmap row (Append-Only Session Audit Trail) is closed as subsumed by #598, in its own isolated, prettier-clean commit.
10. `harness validate` shows no new findings vs the 353 baseline; `harness check-deps` shows only the 2 pre-existing cycles; full core/cli/orchestrator suites, `tsc`, and `generate:barrels:check` are green.

## Uncertainties

- [ASSUMPTION] The knowledge pipeline ingests `docs/knowledge/<domain>/*.md` and `docs/knowledge/decisions/NNNN-*.md` from prose + frontmatter; there is no separate machine-readable edge-file format (none found in the repo). Edges are expressed as prose + cross-links in the concept doc. If a knowledge-map index requires an explicit entry, `harness validate` (`validateKnowledgeMap`) will flag it and Task 3 adds the entry.
- [ASSUMPTION] Making `syncRoadmap` async does not ripple beyond `roadmap.ts`, `roadmap-auto-sync.ts`, and their tests (grep found no other production callers; orchestrator does not call it).
- [DEFERRABLE] Exact ADR slug wording.
- [BLOCKING — pre-resolved] Closing GH-580 (Task 11) depends on the Phase 5 Task 17 `[checkpoint:human-verify]` (the SC5 subsumption artifact). The Phase-5 handoff confirms SC5 is GREEN but stopped _before_ that human-verify. Task 11 therefore carries its own `[checkpoint:human-verify]` re-confirming the SC5 artifact before mutating the roadmap.

## File Map

```
CREATE docs/knowledge/decisions/0048-event-log-authoritative-snapshot-derived.md
CREATE docs/knowledge/decisions/0049-guarded-lane-state-machine.md
CREATE docs/knowledge/core/event-sourced-state.md
MODIFY docs/knowledge/core/state-management.md
MODIFY AGENTS.md
MODIFY packages/core/src/state/stream-resolver.ts
MODIFY packages/core/tests/state/stream-resolver.test.ts
MODIFY packages/core/src/roadmap/sync.ts
MODIFY packages/core/tests/roadmap/sync.test.ts
MODIFY packages/cli/src/mcp/tools/roadmap.ts
MODIFY packages/cli/src/mcp/tools/roadmap-auto-sync.ts
MODIFY packages/cli/tests/mcp/tools/roadmap.test.ts
MODIFY packages/core/tests/state/state-manager.test.ts
MODIFY packages/core/tests/state/session-resolution.test.ts
MODIFY packages/core/tests/state/session-sections.test.ts
MODIFY packages/cli/tests/mcp/tools/gather-context.test.ts
DELETE (defs within) packages/core/src/state/state-persistence.ts  (loadState, saveState)
MODIFY packages/core/src/state/index.ts  (remove loadState/saveState re-export)
MODIFY packages/cli/tests/mcp/tools/state-sc1-guard.test.ts  (tighten)
REGEN  packages/core/src/index.ts (+ generated barrels) via `pnpm generate:barrels`
MODIFY docs/roadmap.md  (GH-580 row → done, isolated commit)
```

## Skeleton

1. ADRs + knowledge docs (write-and-validate) — Tasks 1–5 (~18 min)
2. Code carry-forwards (TDD) — Tasks 6–10 (~25 min)
3. Roadmap close + final validation — Tasks 11–12 (~7 min)

**Estimated total:** 12 tasks, ~50 min.
_Skeleton approved: implied — the user supplied the phase scope and task breakdown directly._

## Conventions Found (for executor)

- **ADRs:** `docs/knowledge/decisions/NNNN-<slug>.md`, 4-digit sequential. Highest existing = `0047`; next = **0048**, **0049**. Frontmatter: `number, title, date, status: accepted, tier, source, supersedes?`. Required sections: **Context**, **Decision**, **Consequences**. Auto-ingested as `decision` graph nodes. See `docs/knowledge/decisions/README.md`.
- **Knowledge concepts/edges:** markdown under `docs/knowledge/<domain>/` with frontmatter `type: business_concept|business_process`, `domain`, `tags`. Edges = prose + cross-links (no separate edge format). Ingested by the knowledge pipeline.
- **Barrel regen:** `pnpm generate:barrels` (check via `pnpm generate:barrels:check`). Core public API flows through `packages/core/src/index.ts` (`export * from './state'`, line 97).
- **On-disk constants:** `packages/core/src/state/event-sourcing/constants.ts` — `EVENT_LOG_FILE='state.events.jsonl'`, `EVENT_BLOBS_DIR='state.events.blobs'`, `SNAPSHOT_FILE='state.snapshot.json'`, `MAX_LINE_BYTES=4096`.

---

## Tasks

### Task 1: ADR 0048 — event log authoritative, snapshot derived (D2)

**Depends on:** none | **Files:** `docs/knowledge/decisions/0048-event-log-authoritative-snapshot-derived.md` | **Category:** integration

1. Create the file with frontmatter:
   ```yaml
   ---
   number: 0048
   title: Event Log Is Authoritative; Snapshot Is Derived
   date: 2026-06-27
   status: accepted
   tier: large
   source: docs/changes/event-sourced-state-model/proposal.md
   ---
   ```
2. **Context:** the codebase has assumed mutated `.harness/state.json` ownership since `schemaVersion: 1`; last-write-wins clobbering under parallel/autopilot. Reference spec §Overview and §Goals (cite, do not restate).
3. **Decision:** record D2 — the append-only event log is the single source of truth; `state.snapshot.json` (`schemaVersion: 2`, `{ coreState, lanes, audit, meta.lastSeq }`) is a _derived_ cache; `reduce(loadEvents(scope)) === readSnapshot(scope)`; a missing/stale/corrupt snapshot is a cache miss (readers fall back to `reduce(loadEvents())`). **Pointer only** to the spec's Decisions Made table (D2/D3/D6/D7) — per spec-craft SPEC-R004, do not duplicate decision text.
4. **Consequences:** all readers migrate to `toHarnessState(readSnapshot(...).coreState)`; `materialize` is the sole snapshot writer; scalar fields resolve by deterministic last-event-wins on `(seq, writerId)`.
5. Run: `harness validate` (expect ≤ 353 baseline; resolve any `validateKnowledgeMap` flag for the new file).
6. Commit: `docs(event-sourced-state): add ADR 0048 event-log-authoritative`

### Task 2: ADR 0049 — guarded lane state machine (D4)

**Depends on:** none | **Files:** `docs/knowledge/decisions/0049-guarded-lane-state-machine.md` | **Category:** integration

1. Create the file, frontmatter `number: 0049`, `title: Guarded Lane State Machine`, same shape as Task 1.
2. **Context:** orchestrator lifecycle had a pure-but-ephemeral, unguarded `applyEvent`; no dependency/evidence/forced-transition discipline. Cite spec §Overview and §Technical Design → Lane state machine.
3. **Decision:** record D4 — harness-native lane machine `planned → claimed → in_progress → in_review → done` + `blocked`/`canceled`, with `dependencyGuard` / `evidenceGuard` / `forceGuard`; **core owns** `lane-machine.ts`, orchestrator/autopilot **consume** it via `transitionLane` and the `manage_state task-transition` action — a new cross-package contract. Pointer to Decisions Made (D4); do not duplicate.
4. **Consequences:** illegal transitions are `Err` (never silent); `→ done` requires evidence; off-table transitions require `force + actor + reason` recorded on the `lane_transitioned` event; terminal lanes `done`/`canceled`.
5. Run: `harness validate`.
6. Commit: `docs(event-sourced-state): add ADR 0049 guarded-lane-state-machine`

### Task 3: Knowledge concept doc — concepts + edges

**Depends on:** Tasks 1, 2 | **Files:** `docs/knowledge/core/event-sourced-state.md` | **Category:** integration

1. Create the concept doc:
   ```yaml
   ---
   type: business_process
   domain: core
   tags: [event-sourcing, projections, snapshot, lane-machine, guards, migration, provenance]
   ---
   ```
2. Document the **six concepts** (one short section each), grounded in spec §Technical Design:
   - **Append-only event log** (`state.events.jsonl`, lock-free `O_APPEND`, `(seq, writerId)` order, INV-1/INV-2).
   - **Projection / read-model** (`projectCoreState`/`projectLanes`/`projectAudit`, each pure `(events)→subDoc`).
   - **Materialized snapshot** (`state.snapshot.json`, derived, `materialize` sole writer, staleness fallback).
   - **Lane state machine** (transition table; terminal lanes).
   - **Transition guards** (dependency / evidence-for-terminal / forced).
   - **Genesis migration** (single `state_imported` event; idempotent on "a `state_imported` event already present", crash-safe).
3. Document the **three edges** as a "Relationships" section with cross-links:
   - `snapshot` **—derived-from→** `event log` (→ ADR 0048).
   - `lanes-projection` **—uses→** `transition guards` (→ ADR 0049).
   - `audit-projection` **—subsumes→** GH-580 (→ spec §Success Criteria 5).
4. Cross-link ADR 0048, ADR 0049, and the spec. Reference, do not restate decision text.
5. Run: `harness validate` (resolve any knowledge-map entry requirement).
6. Commit: `docs(event-sourced-state): add event-sourced-state knowledge concepts`

### Task 4: Refresh state-management.md knowledge doc

**Depends on:** Task 3 | **Files:** `docs/knowledge/core/state-management.md` | **Category:** integration

1. Replace the legacy mutated-state language:
   - "HarnessState Structure" / "Self-Healing Reads": drop "Updated by orchestrators between skill turns" and "schema version 1"; describe `coreState` as a projection over the event log, `toHarnessState` as the legacy-shape bridge, and snapshot-as-cache fallback.
2. Add a short pointer paragraph linking to `event-sourced-state.md` and ADRs 0048/0049 as the authoritative description.
3. Keep the Stream-Based Isolation, Session Layering, and Handoff Protocol sections (still accurate).
4. Run: `harness validate`.
5. Commit: `docs(event-sourced-state): update state-management for event-sourced model`

### Task 5: AGENTS.md — model, on-disk layout, manage_state reference

**Depends on:** Tasks 3, 4 | **Files:** `AGENTS.md` | **Category:** integration

1. Grep first: `state.json` (line ~84), the `state` module bullet (line ~220), and the `manage_roadmap` MCP paragraph (line ~769) as anchors.
2. Update the **state module** bullet (~line 220) to add the `event-sourcing/` module: authoritative append-only log + deterministic reducer/projections (`projectCoreState`/`projectLanes`/`projectAudit`) + materialized snapshot + guarded lane machine; note `toHarnessState` legacy bridge.
3. Add an **on-disk layout** note documenting the new files: `state.events.jsonl` (authoritative log), `state.events.blobs/<hash>.json` (spilled oversized payloads), `state.snapshot.json` (derived snapshot, `schemaVersion: 2`), `metrics/skill-events.jsonl` (relocated skill telemetry), and that `events.jsonl` is **retired** (born-deduplicated, discarded — not imported).
4. Add a **`manage_state`** reference note: the `task-transition` action wraps `transitionLane` (`taskId`, `toLane`, `dependsOn?`, `evidence?`, `force?`+`actor?`+`reason?`); mutating actions **append events**; read actions read the **snapshot/projection** (`toHarnessState(readSnapshot(...).coreState)`).
5. Correct the line-84 `.harness/state.json` `init.strategy.declined` reference to reflect event-sourced persistence (decision recorded as an event / read via snapshot), or generalize to ".harness state".
6. Run: `harness validate`.
7. Commit: `docs(event-sourced-state): document event-sourced model and manage_state in AGENTS.md`

### Task 6: stream-resolver — migrate event-log files into streams (TDD)

**Depends on:** none | **Files:** `packages/core/src/state/stream-resolver.ts`, `packages/core/tests/state/stream-resolver.test.ts`

1. **Test first** — in `stream-resolver.test.ts`, add a case under the migration describe: seed a pre-stream-index `.harness/` with `state.events.jsonl`, `state.snapshot.json`, and a `state.events.blobs/<hash>.json` dir+file at the harness root, call `migrateToStreams(projectPath)`, assert all three now live under `.harness/streams/default/` (file contents preserved; blobs dir moved with its file) and are gone from root.
2. Run: `npx vitest run packages/core/tests/state/stream-resolver.test.ts` — observe failure.
3. Implement in `stream-resolver.ts`: extend the migration to include the event-log artifacts. Add the two flat files to `STATE_FILES`:
   ```ts
   const STATE_FILES = [
     'state.json',
     'handoff.json',
     'learnings.md',
     'failures.md',
     'state.events.jsonl',
     'state.snapshot.json',
   ];
   ```
   and move the blobs **directory** alongside (it is a dir, so handle it explicitly — `fs.existsSync` + `fs.renameSync` works for dirs; add `'state.events.blobs'` to the moved set, or a parallel `STATE_DIRS = ['state.events.blobs']` moved with the same rename loop). Keep `state.json` (genesis import still reads it post-move).
4. Run the test — observe pass. Run: `npx vitest run packages/core/tests/state/migration.test.ts` (no regression).
5. Run: `harness validate`.
6. Commit: `fix(core): migrate event-log files into stream layout`

### Task 7: sync.ts — event-sourced status inference + async ripple (TDD) `[checkpoint:human-verify]`

**Depends on:** none | **Files:** `packages/core/src/roadmap/sync.ts`, `packages/core/tests/roadmap/sync.test.ts`, `packages/cli/src/mcp/tools/roadmap.ts`, `packages/cli/src/mcp/tools/roadmap-auto-sync.ts`, `packages/cli/tests/mcp/tools/roadmap.test.ts`

> **RISKIEST TASK — atomic async-signature ripple.** Touches 5 files because making `syncRoadmap` async must land in one commit to keep the build green; it cannot be split without a throwaway shim. Justified exception to the 3-file guideline. Pause for human review of the diff before committing.

1. **Test first** — in `sync.test.ts`: (a) make existing cases `await syncRoadmap(...)`; (b) add a case that, instead of writing `.harness/state.json`, seeds the event log via `eventSourcing.emitEvent(tmpDir, { type: 'progress_set', ... })` (or the test's existing event helper) so a task's progress is `complete`, links a plan to a single feature, and asserts `syncRoadmap` infers `done`. Import `eventSourcing` from `@harness-engineering/core` (or relative `../../src`).
2. Run: `npx vitest run packages/core/tests/roadmap/sync.test.ts` — observe failure (sync still reads state.json; not async).
3. Implement in `sync.ts`:
   - Make `inferStatus` `async`. Replace block **3a** (lines ~112–127, the `fs.readFileSync(rootStatePath)` + `JSON.parse`) with:
     ```ts
     if (useRootState) {
       const snap = await eventSourcing.readSnapshot(projectPath);
       if (snap.ok) {
         const progress = eventSourcing.toHarnessState(snap.value.coreState).progress;
         if (progress) for (const status of Object.values(progress)) allTaskStatuses.push(status);
       }
     }
     ```
     Import `eventSourcing` (namespace) at top of `sync.ts`. Remove the now-unused `RootState`/`fs`/`path` state.json reads if they become dead (keep `path`/`fs` if still used by session-scan block 3b).
   - Make `syncRoadmap` `async` (returns `Promise<Result<SyncChange[]>>`); `await inferStatus(...)` inside the loop.
4. Ripple CLI callers (same commit, to stay green):
   - `roadmap.ts`: make `handleUpdate` and `handleSync` `async` (return `Promise<McpResponse>`); `await syncRoadmap(...)` at both call sites (~400, ~582); update the dispatch in `handleManageRoadmap` to `await` them; update the `RoadmapDeps.syncRoadmap` type if needed (already `Awaited<...>['syncRoadmap']`, which now resolves to the async type — verify).
   - `roadmap-auto-sync.ts`: `await syncRoadmap(...)` at ~line 32 (`autoSyncRoadmap` is already async).
   - `roadmap.test.ts`: update the mocked `deps.syncRoadmap` to return `Promise.resolve(Ok(...))` so the awaited type matches.
5. Run: `npx vitest run packages/core/tests/roadmap/sync.test.ts packages/cli/tests/mcp/tools/roadmap.test.ts` — observe pass. Run `tsc` for core + cli (0 errors).
6. **`[checkpoint:human-verify]`** — show the 5-file diff; confirm no other `syncRoadmap` callers were missed and behavior is unchanged for file-based roadmaps.
7. Run: `harness validate` && `harness check-deps` (no new cycles).
8. Commit: `refactor(core): infer roadmap status from event-sourced snapshot`

### Task 8: Migrate core tests off saveState/loadState (TDD)

**Depends on:** none | **Files:** `packages/core/tests/state/state-manager.test.ts`, `packages/core/tests/state/session-resolution.test.ts`, `packages/core/tests/state/session-sections.test.ts`

1. `state-manager.test.ts`: remove the `loadState`/`saveState` describe blocks and drop them from the import (keep the `appendLearning` tests). The state read/write behavior is now covered by `event-sourcing/migrate.test.ts` + core-state projection tests.
2. `session-resolution.test.ts`: convert the `saveState`→`loadState` scope round-trip (lines ~154–157) to the event API: `await eventSourcing.emitEvent(tmpDir, <progress event>, { session: 'my-session' })` then `await eventSourcing.readSnapshot(tmpDir, { session: 'my-session' })` + `toHarnessState`, asserting the session-scoped value resolves (preserving the scope-resolution coverage).
3. `session-sections.test.ts`: convert the combined state+sections case (lines ~309–322) the same way, or drop the state half if redundant with the sections-only assertions.
4. Run: `npx vitest run packages/core/tests/state/` — observe green (these now use the event API; no `saveState`/`loadState` imports remain).
5. Run: `harness validate`.
6. Commit: `test(core): migrate state tests off deprecated saveState/loadState`

### Task 9: Migrate gather-context test off loadState (TDD)

**Depends on:** none | **Files:** `packages/cli/tests/mcp/tools/gather-context.test.ts`

1. At line ~194, replace the `await loadState(tmpDir)` direct read with `toHarnessState((await eventSourcing.readSnapshot(tmpDir)).value.coreState)` (guard `.ok`), keeping the same assertion intent. Update imports.
2. Run: `npx vitest run packages/cli/tests/mcp/tools/gather-context.test.ts` — observe green.
3. Run: `harness validate`.
4. Commit: `test(cli): migrate gather-context test off deprecated loadState`

### Task 10: Delete dead saveState/loadState + barrel + tighten SC1 guard (TDD)

**Depends on:** Tasks 8, 9 | **Files:** `packages/core/src/state/state-persistence.ts`, `packages/core/src/state/index.ts`, `packages/cli/tests/mcp/tools/state-sc1-guard.test.ts`, regenerated barrels

1. **Pre-check:** `grep -rn "saveState\|loadState" packages/*/src packages/*/tests` confirms zero remaining non-definition references (Tasks 8–9 cleared the test callers; SC1 guard already proves zero production calls).
2. **Tighten the guard test first** — in `state-sc1-guard.test.ts`: remove `state-persistence.ts` and `state/index.ts` from `ALLOWED_FILES` (so the existing zero-call assertions now also cover those files), and add an assertion that the symbols are no longer **defined/exported** (e.g., grep `state-persistence.ts` for `export async function (saveState|loadState)` → none; grep `state/index.ts` for the re-export → none).
3. Run: `npx vitest run packages/cli/tests/mcp/tools/state-sc1-guard.test.ts` — observe failure (defs still present).
4. Implement: delete `loadState` and `saveState` from `state-persistence.ts` (if the file is left with no exports, delete the file and drop its other imports; otherwise keep the file). Remove the re-export at `state/index.ts:21`.
5. Regenerate barrels: `pnpm generate:barrels` (updates `packages/core/src/index.ts`); verify `loadState`/`saveState` no longer in the core public surface.
6. Run: `npx vitest run packages/cli/tests/mcp/tools/state-sc1-guard.test.ts` — observe pass. Run `tsc` core + cli (0 errors) and `pnpm generate:barrels:check`.
7. Run: `harness validate`.
8. Commit: `refactor(core): remove dead saveState/loadState definitions`

### Task 11: Close GH-580 roadmap row as subsumed `[checkpoint:human-verify]`

**Depends on:** none (isolated) | **Files:** `docs/roadmap.md` | **Category:** integration

> **Roadmap mutations are hazardous (lossy serialize).** Do this in its **own commit**, mutate via `manage_roadmap`, then `prettier --write docs/roadmap.md`.

1. **`[checkpoint:human-verify]`** — re-confirm the Phase 5 SC5 subsumption artifact is GREEN (the `interaction.test.ts` SC5 round-trip recovering `user_input_captured` + `approval_requested` + `approval_resolved` via `projectAudit`) before mutating the roadmap. This is the deferred Phase-5 Task-17 gate.
2. Use the `manage_roadmap` MCP tool (`action: update`, `feature: "Append-Only Session Audit Trail"`, `status: done`) to flip the GH-580 row. Do **not** hand-edit the row body beyond status.
3. Run `npx prettier --write docs/roadmap.md` (pre-push `format:check` drifts on the live roadmap — format it the same way it will be checked).
4. Verify only the GH-580 row's `Status:` changed (`git diff docs/roadmap.md`); no unrelated rows/prose dropped by the serializer.
5. Run: `harness validate`.
6. Commit (isolated): `chore(roadmap): close GH-580 audit trail subsumed by #598`

### Task 12: Final validation sweep `[checkpoint:human-verify]`

**Depends on:** Tasks 1–11 | **Files:** none (verification) | **Category:** integration

1. Run: `harness validate` — confirm no new findings vs the 353 baseline.
2. Run: `harness check-deps` — confirm only the 2 pre-existing cycles (`drift/catalog`, `shared/craft/llm`); no new cycles.
3. Run full suites: `pnpm -F @harness-engineering/core test`, `pnpm -F @harness-engineering/cli test`, `pnpm -F @harness-engineering/orchestrator test` — all green.
4. Run: `tsc` (core/cli/orchestrator → 0) and `pnpm generate:barrels:check` (up to date).
5. **`[checkpoint:human-verify]`** — present the validate/check-deps/test/tsc/barrel results for sign-off; confirm Phase 6 (and #598) is complete.
6. No commit (verification only); if any drift fixed, commit `chore(event-sourced-state): phase 6 final validation`.
