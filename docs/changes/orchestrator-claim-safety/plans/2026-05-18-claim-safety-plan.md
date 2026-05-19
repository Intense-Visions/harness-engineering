# Plan: Orchestrator Claim Safety for File-Backed Roadmap

**Date:** 2026-05-18 | **Spec:** none (bug-fix, derived from debug session
`.harness/debug/active/2026-05-18-orchestrator-roadmap-sync.md`) | **Tasks:**
6 | **Time:** ~25 min | **Integration Tier:** small

## Goal

Stop the file-backed roadmap orchestrator from claiming roadmap items that are
already assigned to another developer (or another orchestrator). Today
`isEligible` ignores `assignee`, and `RoadmapTrackerAdapter.claimIssue` blindly
overwrites it. After this change, third-party-assigned items are filtered out
of dispatch, and a racing claim write becomes a no-op so the existing verify
step in `ClaimManager.claimAndVerify` reports `'rejected'`.

## Observable Truths (Acceptance Criteria)

1. **When** `selectCandidates` runs over an issue with `assignee` equal to a
   non-null value that is not `selfAssignee`, **the system shall not** include
   it in the returned list.
2. **When** `selectCandidates` runs with `selfAssignee` omitted (back-compat),
   **the system shall** include items regardless of assignee (today's
   behavior preserved).
3. **When** `selectCandidates` runs over an issue with `assignee === null`,
   **the system shall** include it (assuming all other gates pass).
4. **When** `selectCandidates` runs over an issue with `assignee ===
selfAssignee`, **the system shall** include it (mid-session resume).
5. **When** `RoadmapTrackerAdapter.claimIssue(issueId, selfId)` reads a file
   whose target feature has `assignee` non-null and not equal to `selfId`,
   **the system shall not** write to the file, and **shall** return
   `Ok(undefined)`. The follow-up verify in `ClaimManager.claimAndVerify` then
   reports `'rejected'`.
6. **When** `claimIssue` reads a feature with `assignee === null` or
   `assignee === selfId`, **the system shall** write status and assignee as
   today.
7. `pnpm --filter @harness-engineering/orchestrator vitest run` passes.
8. `harness validate` passes.

## File Map

```
MODIFY packages/orchestrator/src/core/candidate-selection.ts
MODIFY packages/orchestrator/tests/core/candidate-selection.test.ts
MODIFY packages/orchestrator/src/types/events.ts
MODIFY packages/orchestrator/src/core/state-machine.ts
MODIFY packages/orchestrator/src/orchestrator.ts
MODIFY packages/orchestrator/src/tracker/adapters/roadmap.ts
MODIFY packages/orchestrator/tests/tracker/roadmap.test.ts
CREATE .changeset/orchestrator-claim-safety.md
```

## Uncertainties

- [ASSUMPTION] Making the `selfAssignee` parameter optional on
  `isEligible`/`selectCandidates` is acceptable (preserves existing test
  call-sites). If a strict signature is preferred, all candidate-selection
  test call-sites need updating; that is mechanical, not architectural.
- [ASSUMPTION] Leaving `claimIssue`'s return type as `Result<void, Error>` is
  acceptable. The third-party-assignee case becomes a no-op write; the
  existing `claimAndVerify` verify step converts that into a `'rejected'`
  outcome. No caller behavior changes.
- [DEFERRABLE] Committing/pushing `docs/roadmap.md` after each tracker write
  (the H3/H4 sync-drift problem from the debug session) is intentionally out
  of scope here. Tracked separately.
- [DEFERRABLE] Adding the same gate to the GitHub-issues issue-tracker
  adapter. That path already has ETag-based concurrency upstream, so the
  symmetric write-time guard is lower priority.

## Skeleton

_Not produced — task count (6) below the standard-rigor threshold (8)._

## Tasks

### Task 1: Add failing tests for `isEligible` assignee gate

**Depends on:** none | **Files:** `packages/orchestrator/tests/core/candidate-selection.test.ts`

1. Open `packages/orchestrator/tests/core/candidate-selection.test.ts`.
2. Add a `describe('assignee gate', ...)` block at the end of the file with
   four cases, each constructing an `Issue` with the helper already used in
   the file (or inline shape if no helper exists):
   - `excludes planned items assigned to another developer when selfAssignee
is provided` — issue `{ state: 'planned', assignee: '@alice' }`,
     `isEligible(issue, emptyState, ['planned'], ['done'], 'orchestrator-1')`
     returns `false`.
   - `includes planned items with null assignee when selfAssignee is provided`
     — issue `{ state: 'planned', assignee: null }`, same call returns `true`.
   - `includes planned items assigned to self when selfAssignee is provided`
     — issue `{ state: 'planned', assignee: 'orchestrator-1' }`, same call
     returns `true`.
   - `ignores assignee when selfAssignee is omitted (back-compat)` — issue
     `{ state: 'planned', assignee: '@alice' }`,
     `isEligible(issue, emptyState, ['planned'], ['done'])` returns `true`.
3. Run:
   `pnpm --filter @harness-engineering/orchestrator vitest run tests/core/candidate-selection.test.ts`.
4. Observe: 4 new failures (the new gate does not exist yet).
5. Commit: `test(orchestrator): assert isEligible filters third-party-assigned items`

### Task 2: Implement assignee gate in `isEligible` and `selectCandidates`

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/core/candidate-selection.ts`

1. Open `packages/orchestrator/src/core/candidate-selection.ts`.
2. Extend `isEligible`'s signature with an optional final parameter:
   `selfAssignee?: string | null`.
3. After the existing `state.completed.has(...)` guard and before the Todo
   blocker rule, add:
   ```ts
   if (selfAssignee !== undefined && issue.assignee !== null && issue.assignee !== selfAssignee) {
     return false;
   }
   ```
4. Extend `selectCandidates`'s signature with the same optional
   `selfAssignee?: string | null` parameter and pass it through to
   `isEligible(issue, state, activeStates, terminalStates, selfAssignee)`.
5. Run:
   `pnpm --filter @harness-engineering/orchestrator vitest run tests/core/candidate-selection.test.ts`.
6. Observe: all tests pass (including the 4 new ones).
7. Run: `harness validate`.
8. Commit: `feat(orchestrator): skip third-party-assigned roadmap items in selectCandidates`

### Task 3: Thread `selfAssignee` through TickEvent and `handleTick`

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/types/events.ts`, `packages/orchestrator/src/core/state-machine.ts`

1. Open `packages/orchestrator/src/types/events.ts`. Add an optional field to
   `TickEvent` after `personaRecommendations?`:
   ```ts
   /** Identity of this orchestrator. Items assigned to a different value
    *  are filtered out of dispatch by `selectCandidates`. */
   selfAssignee?: string;
   ```
2. Open `packages/orchestrator/src/core/state-machine.ts`. In `handleTick`
   (around line 415), update the `selectCandidates` call to:
   ```ts
   const eligible = selectCandidates(
     candidates,
     next,
     config.tracker.activeStates,
     config.tracker.terminalStates,
     event.selfAssignee
   );
   ```
3. Run: `pnpm --filter @harness-engineering/orchestrator vitest run`.
4. Observe: all tests pass. Existing tick events that omit `selfAssignee`
   preserve today's behavior.
5. Run: `harness validate`.
6. Commit: `feat(orchestrator): thread selfAssignee through TickEvent to handleTick`

### Task 4: Populate `selfAssignee` on tick events in the orchestrator

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Open `packages/orchestrator/src/orchestrator.ts`. In `asyncTick` around
   line 838, just before the `tickEvent` object literal, resolve the ID:
   ```ts
   const selfAssignee = await this.orchestratorIdPromise;
   ```
   (Reuse the same promise; it is already awaited in `ensureClaimManager`
   earlier in the tick, so this is a cheap re-await of a resolved promise.)
2. Add `selfAssignee` to the `tickEvent` object literal alongside `nowMs`:
   ```ts
   const tickEvent: OrchestratorEvent = {
     type: 'tick' as const,
     candidates,
     runningStates: runningStatesResult.value,
     nowMs,
     selfAssignee,
     ...(concernSignals !== undefined && { concernSignals }),
     ...
   };
   ```
3. Run: `pnpm --filter @harness-engineering/orchestrator vitest run`.
4. Observe: all tests pass.
5. Run: `harness validate`.
6. Commit: `feat(orchestrator): populate selfAssignee on tick events`

### Task 5: TDD compare-and-set in `RoadmapTrackerAdapter.claimIssue`

**Depends on:** none (parallelizable with Tasks 1-4) | **Files:** `packages/orchestrator/src/tracker/adapters/roadmap.ts`, `packages/orchestrator/tests/tracker/roadmap.test.ts`

1. Open `packages/orchestrator/tests/tracker/roadmap.test.ts`. Add a
   `describe('claimIssue compare-and-set', ...)` block with three cases:
   - `does not overwrite a third-party assignee` — write a roadmap fixture
     with a feature whose `Assignee:` line is `@alice` and `Status: planned`.
     Call `adapter.claimIssue(id, 'orchestrator-1')`. Read the file back.
     Assert: `assignee` is still `@alice` and `status` is still `planned`.
     Result is `Ok(undefined)`.
   - `writes when assignee is null` — fixture with `Assignee: —`. Call
     `claimIssue`. Assert file now has `assignee: 'orchestrator-1'` and
     `status: 'in-progress'`. Result is `Ok(undefined)`.
   - `is idempotent for same-self in-progress` — fixture with
     `Status: in-progress` and `Assignee: orchestrator-1`. Call
     `claimIssue(id, 'orchestrator-1')`. Assert file is unchanged (no
     `updatedAt` bump), result is `Ok(undefined)`.
2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run tests/tracker/roadmap.test.ts`.
3. Observe: the third-party case fails — `claimIssue` currently rewrites the
   assignee.
4. Open `packages/orchestrator/src/tracker/adapters/roadmap.ts`. In
   `claimIssue` after `if (!target) return Ok(undefined);` and before the
   existing same-self idempotent check, insert:
   ```ts
   if (target.assignee !== null && target.assignee !== orchestratorId) {
     return Ok(undefined);
   }
   ```
5. Re-run vitest. Observe all three new cases pass.
6. Run: `harness validate`.
7. Commit: `fix(orchestrator): RoadmapTrackerAdapter.claimIssue no-ops on third-party assignee`

### Task 6: Add changeset entry

**Depends on:** Tasks 2, 4, 5 | **Files:** `.changeset/orchestrator-claim-safety.md` | **Category:** integration

1. Create `.changeset/orchestrator-claim-safety.md`:

   ```markdown
   ---
   '@harness-engineering/orchestrator': patch
   ---

   Stop the file-backed roadmap orchestrator from claiming items already
   assigned to another developer or orchestrator. `selectCandidates` now
   skips third-party-assigned items, and `RoadmapTrackerAdapter.claimIssue`
   no-ops when a third party currently holds the assignee, so the
   `ClaimManager` verify step reports `'rejected'` instead of silently
   overwriting.
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run`.
3. Run: `harness validate`.
4. Commit: `chore(changeset): add orchestrator claim-safety patch entry`

## Sequencing & Parallelism

- Strict order: Task 1 → Task 2 → Task 3 → Task 4.
- Task 5 is independent of Tasks 1-4 and can run in parallel.
- Task 6 runs last after the code lands.

## Notes

The two defensive layers are intentional belt-and-suspenders:

- **Proactive filter** (`selectCandidates`) — the orchestrator never even
  tries to claim a third-party item, so no spurious write traffic.
- **Reactive guard** (`claimIssue`) — catches the race where a human assigns
  between the orchestrator's fetch and its claim write. The guard is a
  no-op write, which lets the existing `ClaimManager.claimAndVerify` verify
  step naturally return `'rejected'` without any caller changes.
