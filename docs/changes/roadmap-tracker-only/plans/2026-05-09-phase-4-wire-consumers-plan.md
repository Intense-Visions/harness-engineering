# Plan: Phase 4 — Wire file-less mode through each consumer

**Date:** 2026-05-09
**Spec:** `docs/changes/roadmap-tracker-only/proposal.md` (Phase 4, "Implementation Order")
**Tasks:** 22
**Time:** ~95 minutes
**Integration Tier:** medium
**Session:** `changes--roadmap-tracker-only--proposal`

## Goal

Replace each of the six "file-less roadmap mode is not yet wired in …" stubs (S1–S6) with a real, mode-gated `RoadmapTrackerClient`-backed implementation, leaving every file-backed code path byte-for-byte unchanged.

## Scope Notes (read first)

1. **Phase 3 stub set is the contract.** After this phase, `rg 'file-less roadmap mode is not yet wired in' packages/{cli,core,dashboard,orchestrator}/src` MUST return zero matches. That grep is the audit gate (Task 22).
2. **Surfaces produced by Phase 1 + Phase 2 are reused, not redesigned.**
   - Phase 1: `IssueTrackerClient` (small, 6 methods) — kept for orchestrator's existing file-backed path.
   - Phase 2: `RoadmapTrackerClient` (wide, 10 methods) + `TrackedFeature` + `ConflictError` + `createTrackerClient` + `getRoadmapMode` — used everywhere file-less is reached.
3. **Decisions surfaced for sign-off.**
   - **D-P4-A (S5/S6 mutator endpoints):** Translate to wide-interface methods (option **a**, with a fallback that surfaces "operation not supported in file-less mode" only when no straightforward translation exists). See §"Decision: S5/S6 endpoint translation".
   - **D-P4-B (Dashboard frontend changes):** Server-side first; client UX (toast, scroll-to-row) deferred to a follow-up issue. The server returns a stable JSON contract for 409 conflicts in this phase. See §"Decision: Dashboard frontend scope".
   - **D-P4-C (Pilot D4 sort change):** Implement a new `scoreRoadmapCandidatesFileLess(features, options)` that operates on `TrackedFeature[]` (not the file-backed `Roadmap` shape) and sorts by `priority` (P0 < P1 < P2 < P3 < null) then `createdAt` ascending. Keep `scoreRoadmapCandidates` for file-backed callers. Wire dispatch via `scoreRoadmapCandidatesForMode`.
   - **D-P4-D (Per-request fs reads):** Extract a single `loadProjectRoadmapMode(projectRoot)` helper to `@harness-engineering/core` and reuse from S1, S3, S5, S6. Phase 4 keeps per-request reads (tracker creation cost dwarfs `fs.readFile`); a future phase can add a startup-cached variant if profiling shows hotspots. (Carry-forward I-1 from Phase 3 review.)
   - **D-P4-E (Orchestrator factory location):** Keep the file-less guard at `createTracker()` (the actual factory dispatch site at `orchestrator.ts:446–459`). The `tracker.kind` enum widens from `'roadmap'` to `'roadmap' | 'github-issues'`; the `'github-issues'` branch instantiates a thin **`GitHubIssuesIssueTrackerAdapter`** that wraps `RoadmapTrackerClient` and satisfies the orchestrator's small `IssueTrackerClient` interface. (Phase 3 stub at constructor was correct; the typed factory branch lives in `createTracker` itself.)
   - **D-P4-F (Brainstorming):** No code change. `harness:brainstorming` Phase 4 step 7 routes through `manage_roadmap add`; once S1 is wired, brainstorming inherits file-less behavior. Verified by an integration smoke test in Task 19.
4. **Plan boundaries.** Out of scope per the proposal's Phase 4 entry: `harness roadmap migrate` (Phase 5), ADRs / docs / knowledge graph (Phase 6), and updates to `docs/roadmap.md` for the Tracker-Only feature row (stays at `planned` until Phase 6).
5. **Test strategy.** Every consumer wiring task is TDD: failing test for the file-less branch first, then implementation. Each consumer also gets a `file-backed regression` assertion proving the existing path is untouched.

## Decisions

| #      | Decision                                                                                                                                                                                                                                                   | Rationale                                                                                                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P4-A | S5/S6 mutator endpoints translate to wide-interface methods. `roadmap-status` → `client.update(externalId, { status })`. `roadmap-append` → `client.create(NewFeatureInput)`. The route signature/contract is unchanged, only the storage backend differs. | Option (b) "no-op in file-less" silently breaks dashboard UX. Option (c) "still 501" makes file-less unusable. Option (a) gives users the same UX in both modes — the proposal's Goal #3.                                                           |
| D-P4-B | Dashboard frontend changes (conflict toast, scroll-to-row) deferred to a follow-up. Phase 4 ships the server contract: HTTP 409, body `{ error, code: 'TRACKER_CONFLICT', externalId, conflictedWith?, refreshHint }`.                                     | Frontend changes touch React + WebSocket broadcast and would double the surface of this phase. The contract is stable and small; client follow-up can be its own integration tier change.                                                           |
| D-P4-C | Pilot file-less sort: primary key `priority` (P0 < P1 < P2 < P3 < null), secondary key `createdAt` ascending. Implemented in a NEW `scoreRoadmapCandidatesFileLess` function operating on `TrackedFeature[]`.                                              | The proposal's D4 explicitly drops positional ordering. Reusing `scoreRoadmapCandidates` would require synthesizing a fake `Roadmap` (with milestones) which mis-models the file-less reality. A typed-shape function is cleaner and more testable. |
| D-P4-D | A single `loadProjectRoadmapMode(projectRoot)` helper consolidates the four per-request fs reads (S1, S3, S5, S6). Lives in `@harness-engineering/core`.                                                                                                   | Today four near-identical helpers exist (cli, dashboard, orchestrator x2). One helper reduces duplication and standardizes the failure mode. Per-request reads stay because tracker setup cost dwarfs the fs read.                                  |
| D-P4-E | Orchestrator file-less guard moves from `createTracker()`-throw to `createTracker()`-dispatch on `tracker.kind: 'github-issues'`. The constructor's `this.roadmapMode` resolution is unchanged.                                                            | The Phase 3 stub at line 450 was correctly placed; Phase 4's job is to replace the throw with a real branch, not relocate it. The widened `tracker.kind` enum is the typed plumbing the proposal called for.                                        |
| D-P4-F | No code change in `harness:brainstorming`. The skill calls `manage_roadmap add`; once S1 is wired, brainstorming inherits file-less behavior automatically. An integration smoke test asserts this.                                                        | The proposal's table explicitly states "Unchanged — `manage_roadmap` is the abstraction layer." Verifying this saves a phase from drift.                                                                                                            |

## Decision: S5/S6 endpoint translation (full rationale)

The proposal asks Phase 4 to "wire" S5 (`POST /api/dashboard/roadmap-status`) and S6 (`POST /api/roadmap/append`). Both currently parse-mutate-write `docs/roadmap.md`. In file-less mode, that file does not exist. Three options:

| Option | Description                                                                          | Pro                                                           | Con                                                                                                               |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **a**  | Translate to wide-interface call. `update(id, {status})`, `create(NewFeatureInput)`. | Same UX in both modes; proposal Goal #3 satisfied.            | Adds two more wiring tasks; semantic translation must be precise (status enum, milestone/backlog handling).       |
| b      | No-op (return ok with a warning).                                                    | Simplest; signals "operation moot when tracker is canonical." | Breaks dashboard buttons silently; surprises end users.                                                           |
| c      | Continue to return 501.                                                              | Conservative; preserves Phase 3 contract.                     | Leaves file-less stubs in production paths after the phase whose explicit job is removing them. Audit grep fails. |

**Chosen: a.** The translation is well-defined:

- `roadmap-status` maps `feature` (name) → `externalId` via `client.fetchAll()` lookup, then calls `client.update(externalId, { status: <validated> })`. Conflict surfaces as HTTP 409 with the standard body shape.
- `roadmap-append` reads its `AppendRoadmapRequestSchema`-validated payload, builds a `NewFeatureInput`, and calls `client.create(input)`. Returns 201 with `{ ok: true, featureName, externalId }` (externalId is new — additive to the response).

## Decision: Dashboard frontend scope

The dashboard server contract for the conflict path:

```ts
// HTTP 409 Conflict
{
  error: string;          // human-readable, e.g. "claimed by alice"
  code: 'TRACKER_CONFLICT';
  externalId: string;
  conflictedWith?: { assignee?: string | null; status?: string };
  refreshHint: 'reload-roadmap';   // stable string the client can switch on
}
```

The client (`packages/dashboard/src/client/`) currently does not handle 409 specially on the claim path. It will surface as a toast via the existing error path; **scroll-to-row + "claimed by X — refresh" toast wording** is captured as `roadmap-tracker-only-followup-conflict-ux` and explicitly out of scope for this phase. A test asserts the server response shape (Task 14); a manual verification step in handoff documents the deferred client work.

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** A grep `rg 'file-less roadmap mode is not yet wired in' packages/{cli,core,dashboard,orchestrator}/src` shall return zero matches after this phase.

   _(Trace: Task 22.)_

2. **Event-driven (S1, manage_roadmap):** When `manage_roadmap` is invoked with `roadmap.mode: 'file-less'` and `action: 'show'`, the tool shall return a `Roadmap`-shaped response built from `client.fetchAll()` (no `docs/roadmap.md` read) and shall not throw. Verified by snapshot test against a stub `RoadmapTrackerClient`.

   _(Trace: Tasks 4, 5.)_

3. **Event-driven (S1, manage_roadmap):** When `manage_roadmap` is invoked with `action: 'add'` and `mode: 'file-less'`, the tool shall call `client.create(NewFeatureInput)` exactly once and return the resulting `TrackedFeature` in the MCP response. The fixture's `docs/roadmap.md` (if present) shall not be modified.

   _(Trace: Task 5.)_

4. **Event-driven (S1):** Sub-actions `update`, `remove` (mapped to a `complete`/archive equivalent for file-less; see Task 5), `query`, `sync` shall each map to one or more `RoadmapTrackerClient` methods per the table in §"S1 sub-action map" and pass the round-trip parity test in Task 6.

   _(Trace: Tasks 5, 6.)_

5. **Event-driven (S1, file-backed regression):** When `manage_roadmap` is invoked with `mode: 'file-backed'` (or no mode), every sub-action shall produce byte-for-byte the same response and on-disk file as before this phase. Verified by snapshot test against the existing fixture in `packages/cli/tests/mcp/tools/`.

   _(Trace: Task 6.)_

6. **Event-driven (S2, orchestrator):** When `WorkflowConfig.tracker.kind === 'github-issues'`, the orchestrator's `createTracker()` shall return an `IssueTrackerClient` whose `fetchCandidateIssues()` delegates to `RoadmapTrackerClient.fetchByStatus(activeStates)` and maps each `TrackedFeature` to an `Issue`. No throw.

   _(Trace: Tasks 7, 8.)_

7. **Event-driven (S2, file-backed regression):** When `WorkflowConfig.tracker.kind === 'roadmap'`, `createTracker()` shall return a `RoadmapTrackerAdapter` exactly as today (no behavior change). Verified by an existing-test snapshot.

   _(Trace: Task 8.)_

8. **Event-driven (S3, dashboard claim):** When `POST /api/dashboard/actions/claim` is called with `mode: 'file-less'`, the handler shall call `client.claim(externalId, assignee)` and return 200 with `ClaimResponse` on success, or 409 with the body shape defined in §"Decision: Dashboard frontend scope" on `ConflictError`. No file lock is acquired and `docs/roadmap.md` is not read or written.

   _(Trace: Tasks 13, 14.)_

9. **Event-driven (S3, file-backed regression):** When `mode: 'file-backed'` (or unset), the existing file-locked claim flow shall execute unchanged. Verified by existing dashboard claim test passing.

   _(Trace: Task 14.)_

10. **Event-driven (S4, pilot scoring):** When `scoreRoadmapCandidatesForMode(roadmap, options, config)` is called with `config` resolving to `'file-less'`, it shall NOT throw; it shall delegate to `scoreRoadmapCandidatesFileLess(features, options)` where `features` is sourced from `roadmap` (the current signature carries them). The result list shall be sorted by `priority` ascending (P0 < P1 < P2 < P3 < null), then `createdAt` ascending.

    _(Trace: Tasks 9, 10.)_

11. **Event-driven (S4, file-backed regression):** When `mode === 'file-backed'`, `scoreRoadmapCandidatesForMode` shall delegate to the existing `scoreRoadmapCandidates` and produce identical output (positional sort within priority tiers preserved).

    _(Trace: Task 10.)_

12. **State-driven (D4 sort assertion):** While running over the same fixture (10 features mixed P0/P1/P2/null with mixed createdAt), file-backed and file-less modes shall produce DIFFERENT orderings, and the file-less ordering shall match a hand-computed (priority, createdAt) sort. Snapshot test required.

    _(Trace: Task 10.)_

13. **Event-driven (S5, dashboard roadmap-status):** When `POST /api/dashboard/actions/roadmap-status` is called with `mode: 'file-less'` and `{ feature: <name>, status: <status> }`, the handler shall (a) call `client.fetchAll()` to resolve `feature` → `externalId`, (b) call `client.update(externalId, { status })`, (c) return 200 with `{ ok, feature, status }` on success or 404 if the feature is unknown or 409 on conflict (with the standard conflict shape).

    _(Trace: Task 15.)_

14. **Event-driven (S6, orchestrator roadmap-append):** When `POST /api/roadmap/append` is called with `mode: 'file-less'` and a valid `AppendRoadmapRequestSchema` body, the handler shall call `client.create(NewFeatureInput)` (status defaulting to `'planned'`, milestone defaulting to `'Backlog'` if the proposal's milestone semantics dictate, otherwise omitted). It shall return 201 with `{ ok: true, featureName, externalId }`.

    _(Trace: Task 16.)_

15. **Event-driven (D-P4-D, helper consolidation):** A new `loadProjectRoadmapMode(projectRoot)` helper exported from `@harness-engineering/core` shall return the resolved `RoadmapMode` for a project root; S1, S3, S5, S6 each call it (replacing four near-identical local helpers). Verified by import-graph test.

    _(Trace: Tasks 2, 3.)_

16. **Event-driven (D-P4-F, brainstorming smoke):** When the brainstorming integration test invokes `manage_roadmap` with `action: 'add'` and `mode: 'file-less'`, it shall succeed without code changes to the brainstorming skill itself. (The skill is unchanged; this test exists to assert the contract holds.)

    _(Trace: Task 19.)_

17. **Event-driven (audit invariants):** After this phase, `harness validate` and `harness check-deps` shall both pass (zero new layer/import violations).

    _(Trace: Task 21.)_

18. **Unwanted:** If a Phase 4 consumer mode-branch is added without a paired test, the change shall be detected in code review (no automated check; explicit reviewer note in handoff).

19. **Unwanted:** If the `tracker.kind` schema is widened without updating `WorkflowConfigSchema` runtime validation, `harness validate` shall fail with a Zod parse error. (Belt-and-braces: Task 7 includes a schema test.)

20. **Ubiquitous:** Every test added in this phase shall use the existing `RoadmapTrackerClient` test-double pattern (manual `jest.fn()` / `vi.fn()` per Phase 2 conventions); no live GitHub calls.

## File Map

```
CREATE  packages/core/src/roadmap/load-mode.ts                                    (D-P4-D helper)
CREATE  packages/core/tests/roadmap/load-mode.test.ts
CREATE  packages/core/src/roadmap/pilot-scoring-file-less.ts                      (D-P4-C, NEW scoring fn)
CREATE  packages/core/tests/roadmap/pilot-scoring-file-less.test.ts
CREATE  packages/orchestrator/src/tracker/adapters/github-issues-issue-tracker.ts (S2, IssueTrackerClient wrapper around RoadmapTrackerClient)
CREATE  packages/orchestrator/tests/tracker/adapters/github-issues-issue-tracker.test.ts
CREATE  packages/cli/src/mcp/tools/roadmap-file-less.ts                           (S1, file-less branch impl + sub-action dispatcher)
CREATE  packages/cli/tests/mcp/tools/roadmap.file-less.test.ts                    (S1 sub-actions + parity)
CREATE  packages/dashboard/src/server/routes/actions-claim-file-less.ts           (S3, helper module)
CREATE  packages/dashboard/tests/server/routes/actions-claim.file-less.test.ts
CREATE  packages/dashboard/tests/server/routes/actions-roadmap-status.file-less.test.ts (S5)
CREATE  packages/orchestrator/tests/server/routes/roadmap-actions.file-less.test.ts     (S6)
MODIFY  packages/core/src/roadmap/index.ts                                        (export loadProjectRoadmapMode + scoreRoadmapCandidatesFileLess)
MODIFY  packages/core/src/roadmap/pilot-scoring.ts                                (S4: replace throw with file-less dispatch)
MODIFY  packages/cli/src/mcp/tools/roadmap.ts                                     (S1: replace throw with branch + dispatcher)
MODIFY  packages/orchestrator/src/orchestrator.ts                                 (S2: replace throw with `kind: 'github-issues'` branch)
MODIFY  packages/dashboard/src/server/routes/actions.ts                           (S3, S5: replace throws with branches)
MODIFY  packages/orchestrator/src/server/routes/roadmap-actions.ts                (S6: replace throw with branch)
MODIFY  packages/cli/src/config/schema.ts                                         (widen TrackerConfigSchema kind to include 'github-issues')
MODIFY  packages/types/src/orchestrator.ts                                        (TrackerConfig.kind type comment update — non-breaking; runtime stays string)
```

Files **not** touched in this phase:

- `packages/core/src/roadmap/{parse,serialize,sync,sync-engine,tracker-config}.ts` — file-backed plumbing, untouched.
- `packages/core/src/roadmap/tracker/**` — Phase 1 + 2 deliverables, untouched.
- `packages/orchestrator/src/tracker/adapters/roadmap.ts` — file-backed `RoadmapTrackerAdapter`, untouched.
- `docs/roadmap.md` — tracker-only feature row stays `planned` (Phase 6 ships docs).
- `packages/dashboard/src/client/**` — frontend conflict UX deferred (D-P4-B).
- Skills (`harness:brainstorming`, `harness:roadmap-pilot`) — unchanged per proposal table.

## Skeleton

1. Foundation helpers — `loadProjectRoadmapMode`, `scoreRoadmapCandidatesFileLess` (~3 tasks, ~12 min)
2. Wire S2 (orchestrator factory + tracker.kind enum) (~3 tasks, ~12 min)
3. Wire S4 (pilot scoring file-less branch) (~2 tasks, ~9 min)
4. Wire S1 (manage_roadmap MCP — sub-action dispatcher + tests) (~5 tasks, ~25 min)
5. Wire S3 + S5 (dashboard claim + roadmap-status) (~4 tasks, ~17 min)
6. Wire S6 (orchestrator roadmap-append) (~2 tasks, ~7 min)
7. Brainstorming smoke + audit + final validate (~3 tasks, ~13 min)

_Skeleton approved: implicit (standard rigor; user provided full scope context in invocation; task count 22 is at threshold — acceptance gate at end of plan presentation)._

## S1 sub-action map (for Task 5)

| Sub-action | File-less impl                                                                                                                                                                                                                      | Notes                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `show`     | `client.fetchAll()` → if `input.milestone` filter set, filter; if `input.status` filter set, filter. Build a synthetic `Roadmap` shape (single milestone "All" if no real milestones) and return as today.                          | Snapshot test asserts shape equivalence on a small fixture. Filtering logic mirrors today's `handleShow`.                                                                                                                    |
| `add`      | Validate input (existing `validateAddFields`), build `NewFeatureInput`, call `client.create()`, return MCP response containing the resulting `TrackedFeature`.                                                                      | The local `triggerExternalSync(projectPath, roadmapPath)` is skipped for file-less (the tracker IS the sync target). `shouldTriggerExternalSync` short-circuits when mode is file-less.                                      |
| `update`   | Resolve `input.feature` → `externalId` via `client.fetchAll()`. Build `FeaturePatch` from set fields. Call `client.update(externalId, patch)`. Surface `ConflictError` as MCP `isError: true` text response with the conflict diff. | Cascade behavior (`syncRoadmap` to flip blocked → planned) is **dropped** in file-less mode; cascade is a roadmap-graph operation that does not map cleanly to the tracker. Documented as a behavioral footnote in the test. |
| `remove`   | Resolve name → externalId; call `client.update(externalId, { status: 'done' })` with a comment via `appendHistory`. Today the file-backed path splices the feature out of milestone array — no analog in the tracker.               | The proposal does not explicitly cover `remove` semantics in file-less. Translating "remove" to "complete" preserves user intent (it's gone from the active list) without losing audit history. Flagged in handoff concerns. |
| `query`    | `client.fetchAll()` → filter by `input.filter` (status string or `milestone:<name>`). Return same shape as today.                                                                                                                   | Direct port of `handleQuery`'s post-parse logic.                                                                                                                                                                             |
| `sync`     | No-op in file-less. Returns `Ok({ changes: [], message: 'Roadmap is up to date (file-less mode; tracker is canonical).' })`.                                                                                                        | The sync action exists to reconcile `docs/roadmap.md` ↔ external tracker. In file-less, there is no `docs/roadmap.md`.                                                                                                       |

## Tasks

### Task 1: Confirm Phase 3 baseline + read existing surfaces

**Depends on:** none | **Files:** none (read-only)

1. Run `rg 'file-less roadmap mode is not yet wired in' packages/{cli,core,dashboard,orchestrator}/src` and verify it returns exactly 6 matches (S1–S6). If not 6, STOP and update the plan.
2. Run `pnpm --filter @harness-engineering/core test -- --run roadmap` and verify all Phase 1+2+3 tests pass.
3. Run `pnpm --filter @harness-engineering/orchestrator test -- --run tracker` and verify pass.
4. Run `harness validate` and `harness check-deps`. Both must pass.
5. No commit (this is a verification-only step). If anything fails, file the failure as a blocker on the parent session and stop.

[checkpoint:human-verify] — operator confirms baseline is green before any modifications.

### Task 2 (TDD): Add `loadProjectRoadmapMode` helper to core

**Depends on:** Task 1 | **Files:** `packages/core/src/roadmap/load-mode.ts`, `packages/core/tests/roadmap/load-mode.test.ts`

1. Create test file `packages/core/tests/roadmap/load-mode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadProjectRoadmapMode } from '../../src/roadmap/load-mode';

describe('loadProjectRoadmapMode', () => {
  it('returns file-backed when no harness.config.json exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpm-'));
    expect(loadProjectRoadmapMode(dir)).toBe('file-backed');
  });
  it('returns file-backed when config has no roadmap field', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpm-'));
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ version: 1 }));
    expect(loadProjectRoadmapMode(dir)).toBe('file-backed');
  });
  it('returns file-less when config sets it explicitly', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpm-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { mode: 'file-less' } })
    );
    expect(loadProjectRoadmapMode(dir)).toBe('file-less');
  });
  it('returns file-backed on malformed config', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpm-'));
    fs.writeFileSync(path.join(dir, 'harness.config.json'), '{ not json');
    expect(loadProjectRoadmapMode(dir)).toBe('file-backed');
  });
});
```

2. Run: `pnpm --filter @harness-engineering/core test -- --run load-mode` — observe FAIL.

3. Create implementation `packages/core/src/roadmap/load-mode.ts`:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRoadmapMode, type RoadmapMode } from './mode';

/**
 * Resolve the project's roadmap mode from `<projectRoot>/harness.config.json`.
 * Returns 'file-backed' on any error (missing file, invalid JSON, unreadable).
 *
 * D-P4-D: consolidates the four near-identical helpers across cli, dashboard,
 * and orchestrator. Per-request reads are kept (tracker setup cost dwarfs fs I/O).
 */
export function loadProjectRoadmapMode(projectRoot: string): RoadmapMode {
  try {
    const configPath = path.join(projectRoot, 'harness.config.json');
    if (!fs.existsSync(configPath)) return getRoadmapMode(null);
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Parameters<typeof getRoadmapMode>[0];
    return getRoadmapMode(parsed);
  } catch {
    return getRoadmapMode(null);
  }
}
```

4. Run test — observe PASS.
5. Run: `harness validate`.
6. Commit: `feat(core): add loadProjectRoadmapMode helper for consumer reuse`

### Task 3: Export `loadProjectRoadmapMode` from `@harness-engineering/core`

**Depends on:** Task 2 | **Files:** `packages/core/src/roadmap/index.ts`

1. Add to `packages/core/src/roadmap/index.ts` after the existing `getRoadmapMode` export:

```ts
/** Per-request loader: resolves roadmap.mode from <projectRoot>/harness.config.json. */
export { loadProjectRoadmapMode } from './load-mode';
```

2. Run `pnpm --filter @harness-engineering/core build` — observe PASS.
3. Run: `harness validate`.
4. Commit: `feat(core): export loadProjectRoadmapMode from package surface`

### Task 4 (TDD): Build `scoreRoadmapCandidatesFileLess` (D-P4-C)

**Depends on:** Task 1 | **Files:** `packages/core/src/roadmap/pilot-scoring-file-less.ts`, `packages/core/tests/roadmap/pilot-scoring-file-less.test.ts`

1. Create test file `packages/core/tests/roadmap/pilot-scoring-file-less.test.ts`. Test cases:
   - 5 features mixed P0/P1/null with mixed createdAt → expected order: [P0-earliest, P0-latest, P1-earliest, P1-latest, null].
   - 3 features same priority, different createdAt → ascending createdAt wins.
   - 1 feature `status: 'in-progress'` and 1 `status: 'planned'` → only `planned` and `backlog` are eligible (mirror today's eligibility).
   - Empty input → `[]`.

```ts
import { describe, it, expect } from 'vitest';
import { scoreRoadmapCandidatesFileLess } from '../../src/roadmap/pilot-scoring-file-less';
import type { TrackedFeature } from '../../src/roadmap/tracker';

const tf = (over: Partial<TrackedFeature>): TrackedFeature => ({
  externalId: over.externalId ?? 'github:o/r#1',
  name: over.name ?? 'F',
  status: over.status ?? 'planned',
  summary: '',
  spec: null,
  plans: [],
  blockedBy: [],
  assignee: null,
  priority: over.priority ?? null,
  milestone: null,
  createdAt: over.createdAt ?? '2026-01-01T00:00:00Z',
  updatedAt: null,
});

describe('scoreRoadmapCandidatesFileLess', () => {
  it('sorts by priority then createdAt ascending', () => {
    const features = [
      tf({ name: 'b-p1-late', priority: 'P1', createdAt: '2026-03-01' }),
      tf({ name: 'a-p0-early', priority: 'P0', createdAt: '2026-01-01' }),
      tf({ name: 'd-null', priority: null, createdAt: '2026-01-15' }),
      tf({ name: 'c-p1-early', priority: 'P1', createdAt: '2026-02-01' }),
      tf({ name: 'e-p0-late', priority: 'P0', createdAt: '2026-02-15' }),
    ];
    const order = scoreRoadmapCandidatesFileLess(features, {}).map((c) => c.feature.name);
    expect(order).toEqual(['a-p0-early', 'e-p0-late', 'c-p1-early', 'b-p1-late', 'd-null']);
  });
  it('filters non-eligible statuses', () => {
    const features = [
      tf({ name: 'in-progress', status: 'in-progress' }),
      tf({ name: 'planned', status: 'planned' }),
      tf({ name: 'backlog', status: 'backlog' }),
      tf({ name: 'done', status: 'done' }),
    ];
    const names = scoreRoadmapCandidatesFileLess(features, {}).map((c) => c.feature.name);
    expect(names).toEqual(['planned', 'backlog']);
  });
  it('returns empty for empty input', () => {
    expect(scoreRoadmapCandidatesFileLess([], {})).toEqual([]);
  });
});
```

2. Run test — observe FAIL.
3. Create `packages/core/src/roadmap/pilot-scoring-file-less.ts`:

```ts
import type { TrackedFeature } from './tracker';
import type { Priority } from '@harness-engineering/types';
import type { PilotScoringOptions } from './pilot-scoring';

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export interface FileLessScoredCandidate {
  feature: TrackedFeature;
  priorityTier: number | null;
}

/**
 * D4: Drop positional ordering in file-less mode; sort by Priority then issue
 * creation order (createdAt ascending). Only `planned` and `backlog` features
 * are eligible (parity with file-backed `isEligibleCandidate`). `blockedBy`
 * filtering: a feature is excluded if any blocker name is in the input set
 * AND that blocker is not 'done'. Caller is responsible for passing the full
 * feature set so the function can compute this.
 */
export function scoreRoadmapCandidatesFileLess(
  features: TrackedFeature[],
  _options: PilotScoringOptions
): FileLessScoredCandidate[] {
  const allNames = new Set(features.map((f) => f.name.toLowerCase()));
  const doneNames = new Set(
    features.filter((f) => f.status === 'done').map((f) => f.name.toLowerCase())
  );
  const eligible = features.filter((f) => {
    if (f.status !== 'planned' && f.status !== 'backlog') return false;
    return !f.blockedBy.some((b) => {
      const k = b.toLowerCase();
      return allNames.has(k) && !doneNames.has(k);
    });
  });
  const candidates: FileLessScoredCandidate[] = eligible.map((f) => ({
    feature: f,
    priorityTier: f.priority ? PRIORITY_RANK[f.priority] : null,
  }));
  candidates.sort((a, b) => {
    const ap = a.priorityTier;
    const bp = b.priorityTier;
    if (ap !== null && bp === null) return -1;
    if (ap === null && bp !== null) return 1;
    if (ap !== null && bp !== null && ap !== bp) return ap - bp;
    return a.feature.createdAt.localeCompare(b.feature.createdAt);
  });
  return candidates;
}
```

4. Run test — observe PASS.
5. Run: `harness validate`.
6. Commit: `feat(core): add scoreRoadmapCandidatesFileLess (D4 priority+createdAt sort)`

### Task 5 (TDD): Wire S4 — pilot scoring file-less dispatch

**Depends on:** Task 4 | **Files:** `packages/core/src/roadmap/pilot-scoring.ts`, `packages/core/tests/roadmap/pilot-scoring-mode-stub.test.ts` (rename to `pilot-scoring-mode.test.ts` semantically — keep filename), `packages/core/src/roadmap/index.ts`

1. Update `packages/core/tests/roadmap/pilot-scoring-mode-stub.test.ts`:
   - Replace the "throws on file-less" assertion with: "delegates to file-less scorer producing priority+createdAt sort".
   - Add a regression assertion: file-backed mode produces the same output as `scoreRoadmapCandidates(roadmap, options)`.
   - File-backed and file-less on the same input produce DIFFERENT orderings (D4 break).

2. Run test — observe FAIL on the now-updated assertions.

3. Modify `packages/core/src/roadmap/pilot-scoring.ts`:

```ts
// Replace the throw block in scoreRoadmapCandidatesForMode at line ~242:
import { scoreRoadmapCandidatesFileLess } from './pilot-scoring-file-less';
// ...
if (mode === 'file-less') {
  // Source TrackedFeatures from the roadmap parameter (carrier; the file-less
  // caller supplies a synthesized roadmap whose milestones[].features carry
  // tracker fields including createdAt and priority).
  const flat: TrackedFeature[] = roadmap.milestones.flatMap((m) =>
    m.features.map(featureToTrackedFeature)
  );
  const fileLess = scoreRoadmapCandidatesFileLess(flat, options);
  // Map back to ScoredCandidate shape so the public signature is preserved.
  return fileLess.map((c) => ({
    feature: roadmap.milestones.flatMap((m) => m.features).find((f) => f.name === c.feature.name)!,
    milestone: '',
    positionScore: 0,
    dependentsScore: 0,
    affinityScore: 0,
    weightedScore: 0,
    priorityTier: c.priorityTier,
  }));
}
```

Add a `featureToTrackedFeature(f: RoadmapFeature): TrackedFeature` adapter local to the file (createdAt: `f.createdAt ?? '1970-01-01T00:00:00Z'` if absent — flagged as a defensive default).

4. Export the new file-less scorer from `packages/core/src/roadmap/index.ts`:

```ts
export { scoreRoadmapCandidatesFileLess } from './pilot-scoring-file-less';
export type { FileLessScoredCandidate } from './pilot-scoring-file-less';
```

5. Run test — observe PASS. Run full pilot-scoring suite — observe PASS (no regression).
6. Run: `harness validate`.
7. Commit: `feat(core): replace S4 pilot-scoring file-less throw with D4-sorted dispatch`

### Task 6 (TDD): Add `IssueTrackerClient` wrapper around `RoadmapTrackerClient` (S2)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/tracker/adapters/github-issues-issue-tracker.ts`, `packages/orchestrator/tests/tracker/adapters/github-issues-issue-tracker.test.ts`

1. Create test file. The wrapper takes a `RoadmapTrackerClient` and exposes the small `IssueTrackerClient` (Phase 1) interface. Tests:
   - `fetchCandidateIssues()` calls `RoadmapTrackerClient.fetchByStatus(activeStates)` once and maps each `TrackedFeature` to an `Issue`.
   - `fetchIssuesByStates(states)` matches above with arbitrary states.
   - Map `TrackedFeature.externalId` → `Issue.externalId`; `TrackedFeature.name` → `Issue.title`; `TrackedFeature.status` → `Issue.state`.
   - Error propagation: when `fetchByStatus` returns `Err`, `fetchCandidateIssues` returns the same `Err`.
   - Methods that are unsupported in this thin wrapper (e.g. `transitionToTerminal` — orchestrator currently writes to roadmap.md directly) translate to `client.complete(externalId)` with a TODO note that orchestrator's full surface needs revisiting in a later phase.

```ts
import { describe, it, expect, vi } from 'vitest';
import { GitHubIssuesIssueTrackerAdapter } from '../../../src/tracker/adapters/github-issues-issue-tracker';
// build a minimal RoadmapTrackerClient stub
// assert call shape
```

2. Run test — observe FAIL (file does not exist).
3. Create `packages/orchestrator/src/tracker/adapters/github-issues-issue-tracker.ts`. The class implements `IssueTrackerClient` (small) and delegates to `RoadmapTrackerClient` (wide). Each delegation includes a precise TypeScript type assertion. Use `Result.map` style; do not throw.

4. Run test — observe PASS.
5. Run: `harness validate`.
6. Commit: `feat(orchestrator): add GitHubIssuesIssueTrackerAdapter (S2 wrapper)`

### Task 7: Widen `tracker.kind` to include `'github-issues'` in CLI schema

**Depends on:** Task 6 | **Files:** `packages/cli/src/config/schema.ts`, `packages/cli/tests/config/schema.tracker-kind.test.ts` (new)

1. Create the test asserting:
   - `kind: 'roadmap'` parses (today's behavior).
   - `kind: 'github-issues'` parses (NEW).
   - `kind: 'unknown'` is accepted (current schema is a string; this preserves the documented behavior in `types/orchestrator.ts:233`).

2. Run test — observe whether existing schema accepts both. If not, FAIL on the new case.

3. Modify `packages/cli/src/config/schema.ts` `TrackerConfigSchema`:
   - Locate the `kind` field. If currently `z.string()`, leave runtime check broad but add a JSDoc note enumerating the supported values: `'roadmap' | 'github-issues'`.
   - If currently `z.enum(['roadmap'])`, widen to `z.enum(['roadmap', 'github-issues'])`.

4. Run test — observe PASS.
5. Run: `harness validate`.
6. Commit: `feat(cli): widen TrackerConfigSchema kind to include github-issues`

### Task 8 (TDD): Wire S2 — orchestrator factory dispatches on `kind: 'github-issues'`

**Depends on:** Tasks 6, 7 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/tests/tracker/file-less-stub.test.ts` (REPLACE Phase 3 stub test with wired test)

1. Update `packages/orchestrator/tests/tracker/file-less-stub.test.ts`:
   - Replace "createTracker throws when mode is file-less" with: "createTracker returns a `GitHubIssuesIssueTrackerAdapter` when `tracker.kind === 'github-issues'` AND mode is file-less".
   - Add: "createTracker returns a `RoadmapTrackerAdapter` when `tracker.kind === 'roadmap'` (regression)".
   - The test injects via `overrides` or test-instance pattern (mirror existing patterns). If full instantiation is too heavy, factor `createTracker` into a free function that takes `(config, mode)` and test it directly.

2. Run test — observe FAIL.

3. Modify `packages/orchestrator/src/orchestrator.ts` `createTracker()` (lines 446–459):

```ts
private createTracker(): IssueTrackerClient {
  if (this.config.tracker.kind === 'github-issues') {
    // file-less wiring (S2)
    const tokenEnv = process.env.GITHUB_TOKEN;
    const trackerCfg: TrackerClientConfig = {
      kind: 'github-issues',
      repo: this.config.tracker.projectSlug ?? '',
      ...(this.config.tracker.apiKey ? { token: this.config.tracker.apiKey } : {}),
      ...(this.config.tracker.endpoint ? { apiBase: this.config.tracker.endpoint } : {}),
    };
    const clientResult = createTrackerClient(trackerCfg);
    if (!clientResult.ok) throw clientResult.error;
    return new GitHubIssuesIssueTrackerAdapter(clientResult.value, this.config.tracker);
  }
  if (this.config.tracker.kind === 'roadmap') {
    return new RoadmapTrackerAdapter(this.config.tracker);
  }
  throw new Error(`Unsupported tracker kind: ${this.config.tracker.kind}`);
}
```

Imports added at top of file:

```ts
import { createTrackerClient, type TrackerClientConfig } from '@harness-engineering/core';
import { GitHubIssuesIssueTrackerAdapter } from './tracker/adapters/github-issues-issue-tracker';
```

Note: the Phase 3 `if (this.roadmapMode === 'file-less') throw …` block at line 450 is REMOVED. The `tracker.kind` switch is now the dispatch point (D-P4-E). Mode-vs-kind consistency is enforced by `validateRoadmapMode` (Phase 3).

4. Run test — observe PASS.
5. Run full orchestrator test suite: `pnpm --filter @harness-engineering/orchestrator test`. Verify no regressions.
6. Run: `harness validate` AND `harness check-deps`.
7. Commit: `feat(orchestrator): wire S2 — github-issues tracker.kind dispatches to wide adapter`

### Task 9 (TDD): Build S1 file-less helper module — read paths

**Depends on:** Task 3 | **Files:** `packages/cli/src/mcp/tools/roadmap-file-less.ts`, `packages/cli/tests/mcp/tools/roadmap.file-less.test.ts`

1. Create the test file. Cases for read sub-actions:
   - `show` with no filter → returns Roadmap-shaped result built from `client.fetchAll()`.
   - `show` with `milestone:Foo` filter → returns only matching milestone.
   - `show` with `status:'planned'` filter → returns only planned features.
   - `query` with `filter:'in-progress'` → returns only in-progress.
   - `query` with `filter:'milestone:Foo'` → matches by milestone.
   - Tracker `fetchAll` returns `Err` → MCP response is `isError: true`.

Use a `MakeStubTrackerClient` helper local to this test that returns canned `TrackedFeature[]`.

2. Run test — observe FAIL.
3. Create `packages/cli/src/mcp/tools/roadmap-file-less.ts` with a `handleManageRoadmapFileLess(input, client)` function. Implements show + query for now (write actions in Task 10).
4. Run test — observe PASS for read sub-actions.
5. Run: `harness validate`.
6. Commit: `feat(cli): add S1 file-less reads (show, query)`

### Task 10 (TDD): S1 file-less write paths — add, update, remove, sync

**Depends on:** Task 9 | **Files:** `packages/cli/src/mcp/tools/roadmap-file-less.ts`, `packages/cli/tests/mcp/tools/roadmap.file-less.test.ts`

1. Extend the test file with cases per the §"S1 sub-action map" table:
   - `add`: validates required fields, calls `client.create()` with the right `NewFeatureInput`, returns the resulting `TrackedFeature`.
   - `update`: resolves name → externalId via `fetchAll`, builds `FeaturePatch`, calls `client.update()`. ConflictError → MCP `isError: true` with diff.
   - `remove`: resolves name → externalId, calls `client.update(id, { status: 'done' })`, appends history event.
   - `sync`: returns no-op message.

2. Run test — observe FAIL.
3. Extend `roadmap-file-less.ts` to add write handlers. Reuse `validateAddFields` from `roadmap.ts` (export it as a named export from a new shared module if needed; otherwise duplicate inline since the validation is small).
4. Run test — observe PASS for write sub-actions.
5. Run: `harness validate`.
6. Commit: `feat(cli): add S1 file-less writes (add, update, remove, sync)`

### Task 11: Replace S1 throw with file-less dispatch in `roadmap.ts`

**Depends on:** Task 10 | **Files:** `packages/cli/src/mcp/tools/roadmap.ts`, `packages/cli/tests/mcp/tools/roadmap.file-less-stub.test.ts` (replace stub test)

1. Update existing `roadmap.file-less-stub.test.ts`: replace "throws" assertions with "dispatches to file-less handler when mode is file-less". Verify file-backed regression.

2. Modify `packages/cli/src/mcp/tools/roadmap.ts` `handleManageRoadmap()` at lines 459–505:

```ts
import { handleManageRoadmapFileLess } from './roadmap-file-less';
import { createTrackerClient, loadProjectRoadmapMode } from '@harness-engineering/core';
// ...
export async function handleManageRoadmap(input: ManageRoadmapInput) {
  const projectPath = sanitizePath(input.path);
  const mode = loadProjectRoadmapMode(projectPath);

  if (mode === 'file-less') {
    const trackerCfg = loadTrackerClientConfigFromProject(projectPath);
    if (!trackerCfg.ok) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${trackerCfg.error.message}` }],
        isError: true,
      };
    }
    const clientResult = createTrackerClient(trackerCfg.value);
    if (!clientResult.ok) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${clientResult.error.message}` }],
        isError: true,
      };
    }
    return handleManageRoadmapFileLess(input, clientResult.value);
  }

  // existing file-backed branch — UNCHANGED below this line
  try {
    // ... existing code ...
  }
}

function shouldTriggerExternalSync(input: ManageRoadmapInput, response: McpResponse, mode: RoadmapMode): boolean {
  if (mode === 'file-less') return false; // tracker IS the sync target
  // existing logic
}
```

(`loadTrackerClientConfigFromProject` is a small local helper that reads `harness.config.json` and shapes a `TrackerClientConfig` — it can live in this same module or in `roadmap-file-less.ts`. Pick one location and document.)

3. Run the stub test — observe PASS for both branches.
4. Run full cli MCP test suite. Verify no regressions on file-backed path.
5. Run: `harness validate`.
6. Commit: `feat(cli): wire S1 — manage_roadmap dispatches on roadmap.mode`

### Task 12 (TDD): Build dashboard claim file-less helper (S3)

**Depends on:** Task 3 | **Files:** `packages/dashboard/src/server/routes/actions-claim-file-less.ts`, `packages/dashboard/tests/server/routes/actions-claim.file-less.test.ts`

1. Create the test file. Cases:
   - Successful claim (resolve name → externalId via fetchAll, then `client.claim(id, assignee)`, returns 200 with `ClaimResponse`-shaped body).
   - Feature not found → 404 `{ error: 'Feature <name> not found' }`.
   - `ConflictError` from `client.claim()` → 409 with the standard conflict body shape:
     ```ts
     { error, code: 'TRACKER_CONFLICT', externalId, conflictedWith?, refreshHint: 'reload-roadmap' }
     ```
   - Tracker fetch error → 502 `{ error: <message> }`.

2. Run test — observe FAIL.
3. Create `packages/dashboard/src/server/routes/actions-claim-file-less.ts` exporting `handleClaimFileLess(c, ctx, body)`.
4. Run test — observe PASS.
5. Run: `harness validate`.
6. Commit: `feat(dashboard): add S3 file-less claim helper with 409 conflict shape`

### Task 13: Replace S3 throw with file-less dispatch in `actions.ts`

**Depends on:** Task 12 | **Files:** `packages/dashboard/src/server/routes/actions.ts`, `packages/dashboard/tests/server/routes/actions.file-less-stub.test.ts` (replace)

1. Update existing `actions.file-less-stub.test.ts`: replace 501 assertion with "dispatches to file-less helper". Add file-backed regression.

2. Modify `actions.ts` `handleClaim()`:
   - Replace the local `loadProjectConfig` call + 501 block with: `const mode = await loadProjectRoadmapMode(ctx.projectPath)` (use the new core helper).
   - When `mode === 'file-less'`, dispatch to `handleClaimFileLess(c, ctx, body)` and return.
   - Keep the entire file-backed flow below unchanged.

3. Update the local `loadProjectConfig` function: delete it. All callers in this file (line 154 and the new claim site) now use `loadProjectRoadmapMode` from core. (S5 is updated in Task 15; remove the local helper at the same time to avoid duplication.)

4. Run the stub test — observe PASS for both branches.
5. Run full dashboard test suite. Verify no regressions.
6. Run: `harness validate` AND `harness check-deps`.
7. Commit: `feat(dashboard): wire S3 — claim dispatches on roadmap.mode`

### Task 14 (TDD): Build dashboard roadmap-status file-less helper (S5)

**Depends on:** Task 3 | **Files:** `packages/dashboard/src/server/routes/actions-claim-file-less.ts` (extend with `handleRoadmapStatusFileLess`), `packages/dashboard/tests/server/routes/actions-roadmap-status.file-less.test.ts`

1. Create test file with cases:
   - Valid status update: resolve name → externalId, call `client.update(id, { status })`, return 200 `{ ok, feature, status }`.
   - Feature not found → 404.
   - Invalid status (already validated by `VALID_STATUSES` — this test asserts the existing validation is preserved).
   - `ConflictError` → 409 with the conflict shape.

2. Run test — observe FAIL.
3. Add `handleRoadmapStatusFileLess(c, ctx, body)` to the helper module from Task 12.
4. Run test — observe PASS.
5. Run: `harness validate`.
6. Commit: `feat(dashboard): add S5 file-less roadmap-status helper`

### Task 15: Replace S5 throw with file-less dispatch in `actions.ts`

**Depends on:** Task 14 | **Files:** `packages/dashboard/src/server/routes/actions.ts`, `packages/dashboard/tests/server/routes/actions.roadmap-status.file-less-stub.test.ts` (replace)

1. Update the existing roadmap-status stub test to assert dispatch (not 501).
2. Modify `actions.ts` `handleRoadmapStatus()`: replace the 501 block with a `handleRoadmapStatusFileLess` dispatch.
3. Run stub test — observe PASS.
4. Run: `harness validate`.
5. Commit: `feat(dashboard): wire S5 — roadmap-status dispatches on roadmap.mode`

### Task 16 (TDD): Wire S6 — orchestrator roadmap-append

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/server/routes/roadmap-actions.ts`, `packages/orchestrator/tests/server/routes/roadmap-actions.file-less-stub.test.ts` (replace)

1. Update the existing stub test:
   - Replace 501 assertion with: "calls `client.create()` and returns 201 with `{ ok, featureName, externalId }`".
   - Conflict path (the `client.create()` route has no conflict semantics; if `Err` is returned, surface 502).
   - Add file-backed regression.

2. Run test — observe FAIL.

3. Modify `roadmap-actions.ts`:
   - Replace `loadProjectConfigFromRoadmapPath` with `loadProjectRoadmapMode(projectRoot)` (use the projectRoot derived from the roadmapPath, same logic).
   - Replace the 501 block with a file-less branch:
     ```ts
     if (mode === 'file-less') {
       const trackerCfg = loadTrackerClientConfigFromProject(projectRoot);
       if (!trackerCfg.ok) {
         sendJSON(res, 500, { error: trackerCfg.error.message });
         return;
       }
       const clientR = createTrackerClient(trackerCfg.value);
       if (!clientR.ok) {
         sendJSON(res, 500, { error: clientR.error.message });
         return;
       }
       const body = await readBody(req);
       const parseResult = AppendRoadmapRequestSchema.safeParse(JSON.parse(body));
       if (!parseResult.success) {
         sendJSON(res, 400, { error: parseResult.error.issues[0]?.message ?? 'Invalid' });
         return;
       }
       const input: NewFeatureInput = {
         name: parseResult.data.title,
         summary:
           parseResult.data.enrichedSpec?.intent ??
           parseResult.data.summary ??
           parseResult.data.title,
         status: 'planned',
       };
       const r = await clientR.value.create(input);
       if (!r.ok) {
         sendJSON(res, 502, { error: r.error.message });
         return;
       }
       sendJSON(res, 201, { ok: true, featureName: r.value.name, externalId: r.value.externalId });
       return;
     }
     ```

4. Run test — observe PASS.
5. Run: `harness validate`.
6. Commit: `feat(orchestrator): wire S6 — roadmap-append dispatches on roadmap.mode`

### Task 17: Consolidate per-request fs reads (D-P4-D cleanup pass)

**Depends on:** Tasks 11, 13, 15, 16 | **Files:** `packages/cli/src/mcp/tools/roadmap.ts`, `packages/dashboard/src/server/routes/actions.ts`, `packages/orchestrator/src/server/routes/roadmap-actions.ts`

1. Verify each file no longer defines a local `loadProjectConfig` / `loadProjectConfigFromRoadmapPath`. They should all call `loadProjectRoadmapMode` from `@harness-engineering/core`.
2. Run `rg "function loadProjectConfig|function loadProjectConfigFromRoadmapPath" packages/{cli,dashboard,orchestrator}/src` — verify zero matches.
3. Run full test suite for each touched package.
4. Run: `harness validate` AND `harness check-deps`.
5. Commit: `refactor: consolidate per-request roadmap-mode loaders into core helper`

### Task 18 (TDD): S1 file-backed regression snapshot

**Depends on:** Task 11 | **Files:** `packages/cli/tests/mcp/tools/roadmap.test.ts` (extend) or new test file

1. Add a regression test that runs `handleManageRoadmap` with `mode: 'file-backed'` (default config) on a fixture roadmap and snapshots the response for `show`, `add`, `update`, `remove`, `query`, `sync`. Snapshot must match the pre-Phase-4 baseline.
2. Run test — observe baseline pass.
3. Run: `harness validate`.
4. Commit: `test(cli): pin S1 file-backed regression snapshot`

### Task 19: Brainstorming smoke test (D-P4-F)

**Depends on:** Task 11 | **Files:** `packages/cli/tests/mcp/tools/brainstorming-file-less-smoke.test.ts` (new)

1. Create the test:
   - Set up an in-memory fixture project with `harness.config.json` carrying `roadmap.mode: 'file-less'` and a stub `RoadmapTrackerClient`.
   - Invoke `handleManageRoadmap` with `action: 'add'` and the same arguments brainstorming would supply (title, milestone, status, summary).
   - Assert: stub `client.create()` was called once with the expected `NewFeatureInput`; response is `isError: false`.
   - The brainstorming SKILL is NOT loaded; this is a contract test confirming `manage_roadmap` is the abstraction layer the proposal claims.

2. Run test — observe PASS.
3. Run: `harness validate`.
4. Commit: `test(cli): brainstorming → manage_roadmap file-less contract smoke`

### Task 20: Update package barrel exports (audit pass)

**Depends on:** Tasks 5, 8, 11, 13, 15, 16 | **Files:** `packages/core/src/roadmap/index.ts` (verify), `packages/orchestrator/src/index.ts` (verify GitHubIssuesIssueTrackerAdapter not exported — internal)

1. Confirm `packages/core/src/roadmap/index.ts` exports `loadProjectRoadmapMode` and `scoreRoadmapCandidatesFileLess`.
2. Confirm `GitHubIssuesIssueTrackerAdapter` is NOT exported from `packages/orchestrator` public surface (it's an internal detail; the `tracker.kind` config is the public surface).
3. Run: `pnpm --filter @harness-engineering/core build && pnpm --filter @harness-engineering/orchestrator build`.
4. Run: `harness validate`.
5. No code change if step 1+2 already pass; otherwise add the missing exports and re-run. Commit only if changes made.

### Task 21: Full-suite + integration validation pass

**Depends on:** Tasks 1–20 | **Files:** none (verification only)

1. Run `pnpm test` at the repo root or per-package: `core`, `cli`, `dashboard`, `orchestrator`. Capture pass/fail counts.
2. Run `harness validate`. Must pass.
3. Run `harness check-deps`. Must pass.
4. Run `pnpm --filter @harness-engineering/cli typecheck` (or equivalent) to catch type-level regressions in `roadmap.ts`.
5. If any pre-existing failures (e.g. graph.test.ts, glob-helper.test.ts noted in Phase 3 handoff) reproduce, document but do NOT block.
6. Capture results in handoff `evidence` field. No commit.

[checkpoint:human-verify] — operator confirms full-suite results before audit grep.

### Task 22: Stub-replacement audit + final commit

**Depends on:** Task 21 | **Files:** none (verification only)

1. Run: `rg 'file-less roadmap mode is not yet wired in' packages/{cli,core,dashboard,orchestrator}/src`. Expected: ZERO matches. If non-zero, STOP and report which stubs remain.
2. Run: `rg 'see Phase 4' packages/{cli,core,dashboard,orchestrator}/src` — expected zero (or only in comments that have been intentionally left as historical markers; if any, file as a follow-up to remove in the doc phase).
3. Run: `rg 'function loadProjectConfig\(' packages/{cli,dashboard}/src && rg 'function loadProjectConfigFromRoadmapPath\(' packages/orchestrator/src` — expected zero (D-P4-D consolidation).
4. Run final `harness validate` and `harness check-deps`. Both must pass.
5. Capture grep output in handoff `evidence.audit` field.
6. No commit (audit is verification).

[checkpoint:human-verify] — final go/no-go before APPROVE_PLAN handoff.

## Uncertainties

- **[ASSUMPTION]** `RoadmapFeature` (file-backed) carries enough information (`createdAt`, `priority`) for Task 5's `featureToTrackedFeature` adapter to work without lossy defaults. If `createdAt` is absent, the file-less sort degenerates to "all equal createdAt → undefined order". Mitigation: Task 4 fixture asserts createdAt is present in test data; production flag noted in handoff.

- **[ASSUMPTION]** Orchestrator `IssueTrackerClient` interface (Phase 1, 6 methods) maps cleanly onto a wrapper over `RoadmapTrackerClient`. If a method has no analog (e.g. file-mutating `transitionToTerminal`), the wrapper translates to `client.complete()`. If that translation does not satisfy a downstream caller's contract, Task 6 may need a small extension. Mitigation: Task 6 enumerates each method in tests.

- **[DEFERRABLE]** Dashboard frontend conflict toast wording and scroll-to-row behavior. Captured as `roadmap-tracker-only-followup-conflict-ux`; not blocking.

- **[DEFERRABLE]** S1 `remove` semantic (translated to `complete`) may surprise users who expect the feature to disappear from queries. Documented as a behavioral footnote; flagged in handoff concerns.

- **[BLOCKING — none]** No blockers.

## Risks

| #   | Risk                                                                                                                                                                   | Mitigation                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Cascading status flips (`syncRoadmap` blocked → planned) are dropped in file-less mode. Users relying on this implicit behavior may be surprised.                      | Documented in §"S1 sub-action map". A future phase can implement an equivalent walk over `client.fetchAll()` results. Not in scope here.                                                              |
| R2  | The pilot D4 sort is a behavioral break: same fixture produces different recommendations in the two modes.                                                             | Test 12 (Task 5) asserts the divergence is intentional. A migration-time release note will document this — captured in Phase 6's docs scope.                                                          |
| R3  | `tracker.kind: 'github-issues'` config selection may collide with `roadmap.tracker.kind: 'github'` (file-backed sync engine). Two near-identical strings invite typos. | The Phase 3 validator already enforces mode + tracker consistency. Task 7 adds a schema test asserting both kinds are accepted independently. Documentation in Phase 6 will spell out the difference. |
| R4  | `GitHubIssuesIssueTrackerAdapter` (orchestrator wrapper) duplicates code that lives close to `RoadmapTrackerClient` in core but cannot live in core (layer rules).     | Wrapper is thin (~80 LOC). Phase 6 ADR will explain why the wrapper lives in orchestrator.                                                                                                            |
| R5  | Per-request `fs.readFile` for `loadProjectRoadmapMode` adds ~1-2ms latency to every claim/append/status request.                                                       | Acceptable: tracker setup costs ~50-100ms per invocation (factory + adapter). Profiling can reduce this in a future phase via startup cache + SIGHUP refresh.                                         |
| R6  | Tests in Task 19 (brainstorming smoke) pass but the brainstorming skill in production diverges silently. Skill source is in `agents/`, not packages/.                  | Smoke test is a contract test on `manage_roadmap` (the boundary). If the skill changes how it calls `manage_roadmap`, that's a separate failure mode caught by E2E testing in a later phase.          |
| R7  | A consumer's helper consolidation (Task 17) accidentally changes the `loadProjectConfig` call semantics (e.g. error fallback differs).                                 | `loadProjectRoadmapMode` is itself fully tested (Task 2) with the four edge cases. Each consumer's existing stub-test exercises the new helper transitively.                                          |

## Concerns (raised for APPROVE_PLAN)

These are the "human eyeball" items captured for the handoff `concerns[]` array. Each has a recommended resolution but is surfaced for explicit operator sign-off.

1. **D-P4-A: S5/S6 endpoints translate to wide-interface calls.** The proposal's text leaves this open. The plan picks option (a) "translate" with a fallback "operation not supported in file-less" only when no straightforward translation exists. Reviewer should confirm.

2. **D-P4-B: Dashboard frontend (toast, scroll-to-row) deferred.** Server contract is stable; client follow-up is a separate change. Reviewer should confirm this scope cut is acceptable, or expand the plan with 3-4 more tasks for the React/SSE work.

3. **D-P4-C: Pilot D4 sort is a behavioral break for file-less mode.** Same fixture → different recommendations between modes. Reviewer should confirm this is the intended semantic per proposal D4.

4. **D-P4-D: Per-request fs reads consolidated, not eliminated.** Task 5 (Risk R5). Acceptable on latency grounds; reviewer should confirm.

5. **S1 `remove` translation to `complete`.** No native "delete" in file-less; mapping `remove` to `client.update(id, {status:'done'})` preserves audit history but may surprise users. Reviewer should confirm or request a different mapping (e.g. close + label `archived`).

6. **Brainstorming skill is not modified in this phase.** The plan asserts via Task 19 that `manage_roadmap` is the abstraction layer. If brainstorming has any direct file reads of `docs/roadmap.md` we missed, it will silently break in file-less. Mitigation: spec says it doesn't; smoke test catches it if it does.

## Session State

| Section       | Read | Write | Purpose                                                     |
| ------------- | ---- | ----- | ----------------------------------------------------------- |
| terminology   | yes  | no    | "file-less", "wide interface", "small interface" consistent |
| decisions     | yes  | yes   | Inherits Phase 1-3 decisions; adds D-P4-A through D-P4-F    |
| constraints   | yes  | yes   | Layer rules (core / cli / orchestrator / dashboard) honored |
| risks         | yes  | yes   | R1–R7 above                                                 |
| openQuestions | yes  | yes   | Concerns 1–6 surface for APPROVE_PLAN                       |
| evidence      | yes  | yes   | Each task captures grep / test output in handoff.evidence   |

## Architectural Constraints (verified)

- `packages/core` does not import from `cli`, `orchestrator`, `dashboard`. ✓
- `packages/cli/src/mcp/tools/roadmap-file-less.ts` imports from `@harness-engineering/core` (RoadmapTrackerClient, ConflictError, types) and `@harness-engineering/types` (FeatureStatus, Result). ✓
- `packages/orchestrator/src/tracker/adapters/github-issues-issue-tracker.ts` imports from `@harness-engineering/core` (RoadmapTrackerClient) and locally from `./roadmap` (existing IssueTrackerClient interface via `@harness-engineering/core`). ✓
- `packages/dashboard/src/server/routes/actions-claim-file-less.ts` imports from `@harness-engineering/core` (RoadmapTrackerClient, ConflictError, createTrackerClient, loadProjectRoadmapMode). ✓
- `packages/types` not modified except a comment update (TrackerConfig.kind documents `'roadmap' | 'github-issues'` enumeration; runtime stays `string` for forward compatibility). ✓

## Harness Integration

- `harness validate` runs in Tasks 1, 2, 3, 4, 5, 6, 7, 8, 11, 13, 15, 16, 17, 21, 22.
- `harness check-deps` runs in Tasks 8, 13, 17, 21, 22.
- Plan path: `docs/changes/roadmap-tracker-only/plans/2026-05-09-phase-4-wire-consumers-plan.md`.
- Session-scoped handoff: `.harness/sessions/changes--roadmap-tracker-only--proposal/handoff.json`.

## Success Criteria

- All 6 stubs (S1–S6) replaced with mode-gated, tested implementations.
- `rg 'file-less roadmap mode is not yet wired in' packages/{cli,core,dashboard,orchestrator}/src` returns zero matches (Task 22).
- `harness validate` and `harness check-deps` pass (Task 21, 22).
- All Phase 1+2+3 tests still pass (Task 21).
- Each consumer has a file-backed regression test asserting no semantic drift (Tasks 6, 8, 13, 14, 16, 18).
- Dashboard 409 conflict shape is documented and asserted (Task 12).
- D4 sort divergence (file-backed vs file-less) is asserted on a single fixture (Task 5).
- D-P4-D helper is consolidated; four local helpers are deleted (Task 17).
- Brainstorming smoke contract holds (Task 19).
- Plan + handoff written; APPROVE_PLAN gate awaits human review.

## Gates

- **No vague tasks.** Every task has exact file paths, exact code, and exact commands.
- **No tasks larger than one context window.** Every task is 2–5 minutes; the largest (S1 dispatcher) is split into Tasks 9, 10, 11.
- **No skipping TDD.** Every code-producing task starts with a failing test.
- **No file-backed behavior change.** Every wiring task includes a file-backed regression assertion.
- **No frontend changes in this phase.** Server contract is the boundary (D-P4-B).
- **Audit grep is the contract.** Task 22 is the merge gate.
