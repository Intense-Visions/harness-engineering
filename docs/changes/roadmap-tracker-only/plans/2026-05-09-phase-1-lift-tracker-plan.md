# Plan: Phase 1 — Lift the Tracker Abstraction into Core

**Date:** 2026-05-09
**Spec:** `docs/changes/roadmap-tracker-only/proposal.md` (Phase 1, "Implementation Order")
**Tasks:** 9
**Time:** ~28 minutes
**Integration Tier:** small

## Goal

Establish `packages/core/src/roadmap/tracker/` as the canonical home for the `IssueTrackerClient` abstraction and its companion shared types — without changing any runtime behavior — and switch the orchestrator's existing consumers (including `RoadmapTrackerAdapter`) to import from the new core location, so that all existing orchestrator tests pass unchanged.

## Scope Notes (read first)

This plan executes the lift literally and minimally:

1. **Today's reality** — `IssueTrackerClient`, `Issue`, `BlockerRef`, `TrackerConfig` are exported from `@harness-engineering/types` (`packages/types/src/orchestrator.ts:196`). The orchestrator package consumes them but does not own them. The proposal's phrase "lifted from orchestrator into core" describes the _intent_ (give non-orchestrator consumers a stable home in `core`); Phase 1 implements that intent by giving the symbols a public address inside `core/roadmap/tracker/` and routing all callers through it.
2. **Implementation choice (decision D-P1-A in this plan)** — The new `core/roadmap/tracker/types.ts` **re-exports** `IssueTrackerClient`, `Issue`, `BlockerRef`, `TrackerConfig` from `@harness-engineering/types` rather than physically relocating the definitions. Reasons:
   - `types` is the foundational layer; physically moving the interface would orphan it from `WorkflowConfig` and `TrackerConfig` (which conceptually belong with the tracker types).
   - Re-exporting preserves the layer rules in `harness.config.json` (`core` already depends on `types`).
   - The proposal's Phase 2 will introduce a _new_ expanded interface (with `fetchAll`/`create`/`update`/`claim`/`release`/`complete`/`appendHistory`/etc.) — that lands as a separate type _next to_ the re-export, without disturbing today's interface.
   - No behavior change. No test changes. Smallest blast radius consistent with the goal.
3. **`packages/core/src/roadmap/adapters/github-issues.ts` (existing) is not touched.** It implements `TrackerSyncAdapter` (the bidirectional sync engine), not `IssueTrackerClient`. It will remain at its current path. The Phase 2 tracker adapter will live at `packages/core/src/roadmap/tracker/adapters/github-issues.ts` (different directory, different interface — they coexist). This recommendation is documented here, not enacted in this plan.
4. **Phase 1 explicitly does NOT include**: building the GitHub Issues _tracker_ adapter, ETag layer, body-metadata module, conflict policy, factory, config schema changes, mode plumbing, migration command, ADRs, or knowledge graph entries. Those are Phases 2–6.

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** The system shall export `IssueTrackerClient`, `Issue`, `BlockerRef`, and `TrackerConfig` from `@harness-engineering/core` (verified by an importable test file).
2. **Ubiquitous:** `packages/core/src/roadmap/tracker/index.ts` shall exist and re-export the four lifted symbols by routing through a sibling `types.ts`.
3. **Ubiquitous:** `packages/core/src/roadmap/tracker/types.ts` shall re-export the four lifted symbols from `@harness-engineering/types` (no duplicate definitions).
4. **Ubiquitous:** `packages/orchestrator/src/tracker/adapters/roadmap.ts` shall import `IssueTrackerClient`, `Issue`, `BlockerRef`, and `TrackerConfig` from `@harness-engineering/core` (and continue importing `Result`, `Ok`, `Err`, `FeatureStatus`, `RoadmapFeature` from `@harness-engineering/types` since those are out-of-scope for this lift).
5. **Ubiquitous:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/core/claim-manager.ts`, and `packages/orchestrator/src/types/orchestrator-context.ts` shall import `IssueTrackerClient` (and `Issue` where used) from `@harness-engineering/core`.
6. **Event-driven:** When `pnpm --filter @harness-engineering/orchestrator test` runs, all existing tracker tests (`tests/tracker/roadmap.test.ts`, `tests/integration/file-backed-coordination.test.ts`, `tests/integration/claim-coordination.test.ts`, etc.) shall pass with **zero modifications** to their assertions or fixtures.
7. **Event-driven:** When `pnpm --filter @harness-engineering/core test` runs, the new smoke test `packages/core/tests/roadmap/tracker/index.test.ts` shall pass, asserting the four lifted symbols resolve via `@harness-engineering/core`.
8. **Event-driven:** When `harness validate` runs, it shall pass with no new errors.
9. **Event-driven:** When `harness check-deps` runs, it shall report zero new layer or forbidden-import violations.
10. **Event-driven:** When `pnpm run generate:barrels:check` runs, it shall pass.
11. **Unwanted:** If any file under `packages/core/src/roadmap/tracker/` imports from `packages/orchestrator/src/**` or any other higher-layer package, then `harness check-deps` shall report a layer violation.

## File Map

```
CREATE packages/core/src/roadmap/tracker/types.ts
CREATE packages/core/src/roadmap/tracker/index.ts
CREATE packages/core/tests/roadmap/tracker/index.test.ts
MODIFY packages/core/src/roadmap/index.ts             (add: export * from './tracker')
MODIFY packages/orchestrator/src/tracker/adapters/roadmap.ts          (switch imports for IssueTrackerClient/Issue/BlockerRef/TrackerConfig)
MODIFY packages/orchestrator/src/types/orchestrator-context.ts        (switch import for IssueTrackerClient)
MODIFY packages/orchestrator/src/core/claim-manager.ts                (switch imports for IssueTrackerClient/Issue)
MODIFY packages/orchestrator/src/orchestrator.ts                      (switch imports for IssueTrackerClient/Issue)
```

Files **not** touched in this phase:

- `packages/core/src/index.ts` — auto-generated; the new sub-module flows through the existing `export * from './roadmap'` line. Verified via `pnpm run generate:barrels:check` in Task 9.
- `packages/core/src/roadmap/adapters/github-issues.ts` — sync adapter, not tracker adapter. Out of scope.
- `packages/types/src/orchestrator.ts` — interface definition stays put under decision D-P1-A.
- All orchestrator tests — they import `RoadmapTrackerAdapter` directly and pass through the existing `TrackerConfig` from `@harness-engineering/types`; both continue to work after the lift.

## Skeleton

1. Foundation: create `core/roadmap/tracker/` `types.ts` and `index.ts` (~2 tasks, ~7 min)
2. Wire core barrel and verify export surface (~2 tasks, ~5 min)
3. Switch orchestrator imports to lifted location (~3 tasks, ~10 min)
4. Verify orchestrator tests pass + `harness validate` + `harness check-deps` (~2 tasks, ~6 min)

_Skeleton approved: implicit (standard rigor; user provided full scope context in invocation)._

## Decisions

| #      | Decision                                                                                                                                                                               | Rationale                                                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P1-A | Phase 1 lifts the _current_ `IssueTrackerClient` (the small interface with `fetchCandidateIssues`/`markIssueComplete`/`claimIssue`/`releaseIssue`), not the proposal's redesigned one. | The proposal mandates "no behavior change" and "all existing orchestrator tests pass unchanged." The redesigned interface (with `fetchAll`/`create`/etc.) ships in Phase 2 with the GH adapter.    |
| D-P1-B | Re-export `IssueTrackerClient` etc. from `@harness-engineering/types` via `core/roadmap/tracker/types.ts`, rather than physically relocating the definition.                           | Keeps `types` the layer of record for shared interfaces, preserves layer topology, avoids cross-cutting changes to `WorkflowConfig`/`TrackerConfig` consumers. Smallest blast radius for the lift. |
| D-P1-C | Leave `packages/core/src/roadmap/adapters/github-issues.ts` (the sync adapter) where it is. Do not move into `tracker/adapters/`.                                                      | Different interface (`TrackerSyncAdapter`), different consumers, different lifecycle. Phase 2's GH _tracker_ adapter will live at `tracker/adapters/github-issues.ts`. They coexist by directory.  |
| D-P1-D | Add a smoke test in `packages/core/tests/roadmap/tracker/index.test.ts` that imports the four symbols from `@harness-engineering/core`.                                                | Locks in the new public surface so future refactors detect accidental removal. Cheap (one file, ~25 lines).                                                                                        |

## Uncertainties

- **[ASSUMPTION → confirmed by spec re-read]** Phase 1 lifts the _existing_ small interface, not the redesigned proposal interface. See D-P1-A. If incorrect, the entire plan changes and Phase 2 work folds in.
- **[DEFERRABLE]** Eventual rename of `packages/core/src/roadmap/adapters/github-issues.ts`. Not addressed here. Captured under D-P1-C.

## Tasks

---

### Task 1: Create `packages/core/src/roadmap/tracker/types.ts` re-exporting the lifted symbols

**Depends on:** none
**Files:** `packages/core/src/roadmap/tracker/types.ts` (CREATE)

1. Create the directory: `mkdir -p packages/core/src/roadmap/tracker`
2. Create `packages/core/src/roadmap/tracker/types.ts` with **exactly** this content:

   ```ts
   /**
    * Tracker abstraction — shared types.
    *
    * This module re-exports the canonical tracker interface and its
    * companion types from `@harness-engineering/types`, giving them a
    * stable, public home inside `@harness-engineering/core` for
    * non-orchestrator consumers (CLI, dashboard, MCP, skills).
    *
    * Design note: the definitions live in `@harness-engineering/types`
    * to keep them at the foundational layer alongside `WorkflowConfig`
    * and `TrackerConfig`. Re-exporting from core (rather than
    * physically relocating the definitions) preserves the layer
    * topology while satisfying the public-surface goal of Phase 1
    * of the file-less roadmap proposal.
    *
    * @see docs/changes/roadmap-tracker-only/proposal.md
    */
   export type {
     IssueTrackerClient,
     Issue,
     BlockerRef,
     TrackerConfig,
   } from '@harness-engineering/types';
   ```

3. Run: `pnpm --filter @harness-engineering/core typecheck` — observe pass (no new errors).
4. Run: `harness validate` — observe pass.
5. Commit:

   ```bash
   git add packages/core/src/roadmap/tracker/types.ts
   git commit -m "$(cat <<'EOF'
   feat(core): seed roadmap/tracker/types.ts with lifted IssueTrackerClient surface

   Phase 1 of the file-less roadmap proposal. Re-exports IssueTrackerClient,
   Issue, BlockerRef, and TrackerConfig from @harness-engineering/types into
   the new core/roadmap/tracker/ home so non-orchestrator consumers have a
   stable import path. No behavior change; definitions stay in the types
   layer.
   EOF
   )"
   ```

---

### Task 2: Create `packages/core/src/roadmap/tracker/index.ts` barrel

**Depends on:** Task 1
**Files:** `packages/core/src/roadmap/tracker/index.ts` (CREATE)

1. Create `packages/core/src/roadmap/tracker/index.ts` with **exactly** this content:

   ```ts
   /**
    * Tracker abstraction — public entry point.
    *
    * Phase 1 surface: IssueTrackerClient, Issue, BlockerRef, TrackerConfig.
    * Phase 2 will add: factory(), body-metadata helpers, ETag store,
    * conflict types, and the GitHub Issues adapter.
    *
    * @see docs/changes/roadmap-tracker-only/proposal.md
    */
   export type { IssueTrackerClient, Issue, BlockerRef, TrackerConfig } from './types';
   ```

2. Run: `pnpm --filter @harness-engineering/core typecheck` — observe pass.
3. Run: `harness validate` — observe pass.
4. Commit:

   ```bash
   git add packages/core/src/roadmap/tracker/index.ts
   git commit -m "$(cat <<'EOF'
   feat(core): add roadmap/tracker/index.ts barrel

   Public entry point for the tracker submodule. Phase 1 re-exports the
   four lifted symbols. Phase 2 will widen this surface with factory,
   body-metadata, ETag store, conflict types, and the GitHub adapter.
   EOF
   )"
   ```

---

### Task 3 (TDD): Add smoke test asserting `@harness-engineering/core` exports the lifted symbols

**Depends on:** Task 2
**Files:** `packages/core/tests/roadmap/tracker/index.test.ts` (CREATE)

1. Create the test directory: `mkdir -p packages/core/tests/roadmap/tracker`
2. Create `packages/core/tests/roadmap/tracker/index.test.ts` with **exactly** this content:

   ```ts
   import { describe, it, expectTypeOf } from 'vitest';
   import type {
     IssueTrackerClient,
     Issue,
     BlockerRef,
     TrackerConfig,
   } from '@harness-engineering/core';

   describe('roadmap/tracker public surface', () => {
     it('exposes IssueTrackerClient with the Phase 1 method shape', () => {
       type Methods = keyof IssueTrackerClient;
       // Phase 1 keeps the existing four operations. Phase 2 will add more
       // (fetchAll, create, update, claim, release, complete, appendHistory).
       expectTypeOf<Methods>().toEqualTypeOf<
         | 'fetchCandidateIssues'
         | 'fetchIssuesByStates'
         | 'fetchIssueStatesByIds'
         | 'markIssueComplete'
         | 'claimIssue'
         | 'releaseIssue'
       >();
     });

     it('exposes Issue with required core fields', () => {
       expectTypeOf<Issue>().toHaveProperty('id');
       expectTypeOf<Issue>().toHaveProperty('title');
       expectTypeOf<Issue>().toHaveProperty('state');
       expectTypeOf<Issue>().toHaveProperty('blockedBy');
     });

     it('exposes BlockerRef and TrackerConfig as types', () => {
       expectTypeOf<BlockerRef>().toHaveProperty('id');
       expectTypeOf<TrackerConfig>().toHaveProperty('kind');
       expectTypeOf<TrackerConfig>().toHaveProperty('activeStates');
       expectTypeOf<TrackerConfig>().toHaveProperty('terminalStates');
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/core test -- roadmap/tracker/index.test.ts` — observe **fail** (the symbols are not yet flowing through `@harness-engineering/core` because `roadmap/index.ts` does not re-export `tracker/`).
4. (Tasks 4 and 5 will make this pass; do not commit yet.)

> **Note:** This task intentionally leaves the test failing in isolation. Task 4 wires the export and Task 5 commits the working state. This preserves a clean TDD red→green sequence within the plan even though the commit boundary is at Task 5.

---

### Task 4: Wire `tracker/` into `core/roadmap/index.ts`

**Depends on:** Task 3
**Files:** `packages/core/src/roadmap/index.ts` (MODIFY)

1. Open `packages/core/src/roadmap/index.ts`.
2. Append **at the end of the file** (after the final `export type { ScoredCandidate, PilotScoringOptions } from './pilot-scoring';` line):

   ```ts
   /**
    * Tracker abstraction — IssueTrackerClient and shared types.
    * See packages/core/src/roadmap/tracker/index.ts.
    */
   export type { IssueTrackerClient, Issue, BlockerRef, TrackerConfig } from './tracker';
   ```

3. Run: `pnpm --filter @harness-engineering/core typecheck` — observe pass.
4. Run: `pnpm --filter @harness-engineering/core test -- roadmap/tracker/index.test.ts` — observe **pass** (the symbols now flow through `@harness-engineering/core`).
5. Run: `harness validate` — observe pass.
6. **Do not commit yet** — Task 5 wraps Tasks 3+4 into one commit (the test and its wiring belong together).

---

### Task 5: Commit the test + wiring as a TDD pair

**Depends on:** Task 4
**Files:** `packages/core/src/roadmap/index.ts`, `packages/core/tests/roadmap/tracker/index.test.ts`

1. Stage the two files together:
   ```bash
   git add packages/core/tests/roadmap/tracker/index.test.ts packages/core/src/roadmap/index.ts
   ```
2. Run: `pnpm --filter @harness-engineering/core test -- roadmap/tracker/index.test.ts` — observe pass (sanity check before commit).
3. Run: `harness validate` — observe pass.
4. Commit:

   ```bash
   git commit -m "$(cat <<'EOF'
   feat(core): re-export tracker submodule from roadmap barrel + smoke test

   Wires packages/core/src/roadmap/index.ts to re-export the new
   tracker/ public surface. Adds a smoke test verifying that
   IssueTrackerClient, Issue, BlockerRef, and TrackerConfig resolve
   via @harness-engineering/core. Locks the Phase 1 method shape so
   future refactors detect accidental removal.
   EOF
   )"
   ```

> **[checkpoint:human-verify]** After this commit, an importer using `import { IssueTrackerClient } from '@harness-engineering/core'` in any package within layer `core` or higher should resolve. Pause here to confirm the new public surface looks right before touching the orchestrator.

---

### Task 6: Switch `RoadmapTrackerAdapter` imports to `@harness-engineering/core`

**Depends on:** Task 5
**Files:** `packages/orchestrator/src/tracker/adapters/roadmap.ts` (MODIFY)

1. Open `packages/orchestrator/src/tracker/adapters/roadmap.ts`.
2. Replace the existing import block (lines 1–14):

   ```ts
   import * as fs from 'node:fs/promises';
   import { createHash } from 'node:crypto';
   import { parseRoadmap, serializeRoadmap } from '@harness-engineering/core';
   import {
     Result,
     Ok,
     Err,
     Issue,
     IssueTrackerClient,
     TrackerConfig,
     BlockerRef,
     FeatureStatus,
     RoadmapFeature,
   } from '@harness-engineering/types';
   ```

   …with **exactly** this:

   ```ts
   import * as fs from 'node:fs/promises';
   import { createHash } from 'node:crypto';
   import {
     parseRoadmap,
     serializeRoadmap,
     // Phase 1 of the file-less roadmap proposal: the tracker abstraction
     // now has its public home in @harness-engineering/core/roadmap/tracker.
     // The four lifted symbols below resolve through that home.
     type Issue,
     type IssueTrackerClient,
     type TrackerConfig,
     type BlockerRef,
   } from '@harness-engineering/core';
   import {
     type Result,
     Ok,
     Err,
     type FeatureStatus,
     type RoadmapFeature,
   } from '@harness-engineering/types';
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` — observe pass.
4. Run: `pnpm --filter @harness-engineering/orchestrator test -- tests/tracker/roadmap.test.ts` — observe all assertions pass with **zero modifications** to the test file.
5. Run: `harness validate` — observe pass.
6. Run: `harness check-deps` — observe zero new violations.
7. Commit:

   ```bash
   git add packages/orchestrator/src/tracker/adapters/roadmap.ts
   git commit -m "$(cat <<'EOF'
   refactor(orchestrator): import lifted tracker types from core

   Switches RoadmapTrackerAdapter to import IssueTrackerClient, Issue,
   BlockerRef, and TrackerConfig from @harness-engineering/core (their
   new public home in roadmap/tracker/). Out-of-scope symbols (Result,
   Ok, Err, FeatureStatus, RoadmapFeature) continue importing from
   @harness-engineering/types. No behavior change; existing tracker
   tests pass unchanged.
   EOF
   )"
   ```

---

### Task 7: Switch `OrchestratorContext` import to `@harness-engineering/core`

**Depends on:** Task 6
**Files:** `packages/orchestrator/src/types/orchestrator-context.ts` (MODIFY)

1. Open `packages/orchestrator/src/types/orchestrator-context.ts`.
2. Replace line 1:

   ```ts
   import type { WorkflowConfig, IssueTrackerClient } from '@harness-engineering/types';
   ```

   …with **exactly**:

   ```ts
   import type { WorkflowConfig } from '@harness-engineering/types';
   import type { IssueTrackerClient } from '@harness-engineering/core';
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` — observe pass.
4. Run: `harness validate` — observe pass.
5. Run: `harness check-deps` — observe zero new violations.
6. Commit:

   ```bash
   git add packages/orchestrator/src/types/orchestrator-context.ts
   git commit -m "$(cat <<'EOF'
   refactor(orchestrator): import IssueTrackerClient from core in OrchestratorContext

   Aligns OrchestratorContext with the lifted tracker home. WorkflowConfig
   continues to come from @harness-engineering/types since it is a
   workflow-level type, not a tracker type.
   EOF
   )"
   ```

---

### Task 8: Switch `claim-manager.ts` and `orchestrator.ts` imports to `@harness-engineering/core`

**Depends on:** Task 7
**Files:** `packages/orchestrator/src/core/claim-manager.ts` (MODIFY), `packages/orchestrator/src/orchestrator.ts` (MODIFY)

1. Open `packages/orchestrator/src/core/claim-manager.ts`.
2. Replace lines 1–2:

   ```ts
   import type { IssueTrackerClient, Issue, Result } from '@harness-engineering/types';
   import { Ok } from '@harness-engineering/types';
   ```

   …with **exactly**:

   ```ts
   import type { IssueTrackerClient, Issue } from '@harness-engineering/core';
   import { type Result, Ok } from '@harness-engineering/types';
   ```

3. Open `packages/orchestrator/src/orchestrator.ts`.
4. Locate the existing import block (around lines 4–9):

   ```ts
   import {
     WorkflowConfig,
     Issue,
     IssueTrackerClient,
     AgentBackend,
   } from '@harness-engineering/types';
   ```

   Replace it with **exactly**:

   ```ts
   import { WorkflowConfig, AgentBackend } from '@harness-engineering/types';
   import type { Issue, IssueTrackerClient } from '@harness-engineering/core';
   ```

5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` — observe pass.
6. Run: `pnpm --filter @harness-engineering/orchestrator test` — observe all tests pass with **zero modifications** to test files. (This is the comprehensive verification — `tests/core/claim-manager.test.ts`, `tests/integration/claim-coordination.test.ts`, `tests/integration/file-backed-coordination.test.ts`, etc.)
7. Run: `harness validate` — observe pass.
8. Run: `harness check-deps` — observe zero new violations.
9. Commit:

   ```bash
   git add packages/orchestrator/src/core/claim-manager.ts packages/orchestrator/src/orchestrator.ts
   git commit -m "$(cat <<'EOF'
   refactor(orchestrator): import IssueTrackerClient/Issue from core in orchestrator and claim-manager

   Completes the Phase 1 lift on the orchestrator side. ClaimManager and
   the Orchestrator class now import the tracker types from their new
   public home in @harness-engineering/core. Result/Ok/AgentBackend/
   WorkflowConfig continue importing from @harness-engineering/types.
   All orchestrator tests pass unchanged.
   EOF
   )"
   ```

> **[checkpoint:human-verify]** All four orchestrator consumers now import `IssueTrackerClient` from `core`. Verify with:
>
> ```bash
> grep -rn "IssueTrackerClient" packages/orchestrator/src/ | grep "from '@harness-engineering/types'"
> ```
>
> Expected output: **empty** (no remaining type-package imports of `IssueTrackerClient` from orchestrator src).

---

### Task 9: Final verification — barrel check, full validate, full check-deps

**Depends on:** Task 8
**Files:** none (verification only)

1. Run: `pnpm run generate:barrels:check` — observe pass.
   - Rationale: confirms the auto-generated `packages/core/src/index.ts` does not need regeneration. The new `tracker/` submodule flows through the existing `export * from './roadmap'` line plus the explicit re-export added in Task 4.
2. Run: `harness validate` — observe pass.
3. Run: `harness check-deps` — observe zero violations and confirm output specifically does not flag any `core → orchestrator`, `core → intelligence`, or `core → cli` import.
4. Run: `pnpm --filter @harness-engineering/orchestrator test` — observe full suite green.
5. Run: `pnpm --filter @harness-engineering/core test` — observe full suite green (including the new smoke test from Task 5).
6. (No new commit; this task is verification only.)

> **[checkpoint:human-verify]** Phase 1 complete. The lift is in place; orchestrator behavior is unchanged. Confirm with the user that the new public surface meets the proposal's intent before unblocking Phase 2.

---

## Dependency Graph

```
Task 1 (types.ts re-export)
  └─► Task 2 (index.ts barrel)
        └─► Task 3 (smoke test, red)
              └─► Task 4 (wire roadmap/index.ts, green)
                    └─► Task 5 (commit test+wiring) ──[checkpoint]──┐
                                                                    │
                                                                    ▼
                                                            Task 6 (RoadmapTrackerAdapter imports)
                                                                    │
                                                                    ▼
                                                            Task 7 (OrchestratorContext imports)
                                                                    │
                                                                    ▼
                                                            Task 8 (claim-manager + orchestrator) ──[checkpoint]──┐
                                                                                                                  │
                                                                                                                  ▼
                                                                                                          Task 9 (final verify) ──[checkpoint]
```

No parallelism in Phase 1 — every task either creates a file the next task references, or modifies a file whose changes affect downstream type resolution. Sequential execution is the safest path.

## Risks

| #   | Risk                                                                                                                                                                     | Mitigation                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A test file (e.g. `tests/integration/file-backed-coordination.test.ts`) imports `IssueTrackerClient` directly from `types` and breaks when the orchestrator src changes. | Tests do not need to change — the symbol is a re-export with identical shape. Verified by Task 6 step 4 and Task 8 step 6 running the full orchestrator test suite without test-file edits.                                                                                                                               |
| R2  | The `pnpm run generate:barrels:check` script flags an inconsistency because it does not auto-pick up the new `tracker/` directory.                                       | The auto-generator works at the `core/src/<dir>/` level (`./roadmap`) — `tracker/` is nested inside `roadmap/` and is wired manually in Task 4. The check should pass. If it fails, regenerate via `pnpm run generate:barrels` and commit the result as a tail step. (Documented as a fallback, not expected to trigger.) |
| R3  | A CI lint rule blocks "type-only imports mixed with value imports" in Task 6's combined `parseRoadmap`/`type Issue` import.                                              | If ESLint complains, split into two separate `import` statements (one value, one type-only). Specified literally in Task 6 step 2; if that exact form is rejected, use two statements.                                                                                                                                    |
| R4  | `IssueTrackerClient` is referenced from `WorkflowConfig` indirectly via `tracker: TrackerConfig`, raising a circular concern.                                            | No circularity is introduced. `core` already depends on `types`; re-exporting a type from `core` does not invert the dependency. Verified by `harness check-deps` in Tasks 6, 7, 8, 9.                                                                                                                                    |

## Evidence

- `packages/types/src/orchestrator.ts:196` — `export interface IssueTrackerClient { ... }` (current home of the lifted interface)
- `packages/types/src/index.ts:112` — `IssueTrackerClient,` re-export from `@harness-engineering/types`
- `packages/orchestrator/src/tracker/adapters/roadmap.ts:4-14` — orchestrator's existing import block (the one Task 6 rewrites)
- `packages/orchestrator/src/types/orchestrator-context.ts:1` — `import type { WorkflowConfig, IssueTrackerClient } from '@harness-engineering/types';`
- `packages/orchestrator/src/core/claim-manager.ts:1-2` — `IssueTrackerClient`/`Issue`/`Result`/`Ok` imports
- `packages/orchestrator/src/orchestrator.ts:4-9` — `WorkflowConfig`/`Issue`/`IssueTrackerClient`/`AgentBackend` import block
- `packages/core/src/roadmap/index.ts:1-52` — current contents (auto-generated via line `export type { ScoredCandidate, PilotScoringOptions } from './pilot-scoring';` at end)
- `packages/core/src/index.ts:116` — `export * from './roadmap';`
- `harness.config.json:36-39` — orchestrator layer rules (`allowedDependencies: ["types", "core", "intelligence"]`)
- `harness.config.json:78-87` — `forbiddenImports` rule guarding `core → orchestrator`/`intelligence`/`cli`
- `packages/orchestrator/tests/tracker/roadmap.test.ts` — existing tracker tests that must pass unchanged

## Integration Tier Justification

**Tier: small.** This is a structural lift with:

- 3 new files (2 source + 1 test), all in core
- 4 modified files, all in orchestrator (each a single-line / single-block import switch)
- No new exports beyond the re-export of existing types
- No config changes, no CLI commands, no docs (those are Phases 3–6)
- No knowledge-graph or ADR work (Phase 6)
- No new behavior, no new public API surface

Wiring checks (`harness validate`, `harness check-deps`, barrel check) are sufficient. Project updates (roadmap, changelog, docs) are deferred to later phases as the proposal directs.

## Success Criteria (recap)

- [ ] All 9 tasks complete; 6 commits land (Tasks 1, 2, 5, 6, 7, 8 each commit; Tasks 3, 4, 9 do not).
- [ ] `harness validate` passes after every commit.
- [ ] `harness check-deps` reports zero new violations after every orchestrator-touching commit.
- [ ] `pnpm --filter @harness-engineering/orchestrator test` passes with **zero** test-file edits.
- [ ] `pnpm --filter @harness-engineering/core test` passes including the new smoke test.
- [ ] `pnpm run generate:barrels:check` passes.
- [ ] `grep -rn "IssueTrackerClient" packages/orchestrator/src/ | grep "from '@harness-engineering/types'"` returns no matches.
- [ ] Human checkpoint approvals at end of Task 5, Task 8, and Task 9.

## What This Phase Does NOT Do (deferred to later phases)

- ❌ Build the GitHub Issues _tracker_ adapter (`tracker/adapters/github-issues.ts`) — Phase 2
- ❌ Implement `factory.ts`, `body-metadata.ts`, `etag-store.ts`, `conflict.ts` — Phase 2
- ❌ Add the redesigned `IssueTrackerClient` interface (`fetchAll`/`create`/`update`/`claim`/`release`/`complete`/`appendHistory`) — Phase 2
- ❌ Add `roadmap.mode` to `harness.config.json` schema or `validateHarnessConfig` rules — Phase 3
- ❌ Branch any consumer (`manage_roadmap`, dashboard, orchestrator factory, pilot scoring) on file-less mode — Phase 4
- ❌ Ship `harness roadmap migrate` — Phase 5
- ❌ Write ADRs, update guides/CHANGELOG/AGENTS.md, or seed `docs/knowledge/roadmap/` — Phase 6
- ❌ Move `packages/core/src/roadmap/adapters/github-issues.ts` (sync adapter) — see D-P1-C

These are explicitly out-of-scope and any Task that drifts toward them should be rejected.
