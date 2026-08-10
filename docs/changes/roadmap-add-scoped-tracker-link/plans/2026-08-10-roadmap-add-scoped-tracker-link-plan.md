# Plan: Scoped tracker linking for `manage_roadmap add`

**Date:** 2026-08-10 | **Spec:** `docs/changes/roadmap-add-scoped-tracker-link/proposal.md` (approved, revision 2) | **Tasks:** 15 | **Time:** ~62 min | **Integration Tier:** medium

## Goal

`manage_roadmap add` links its own new row to its own tracking issue and rewrites no other row, and inbound sync stops treating tracker silence as tracker opinion.

## Prerequisites (read before Task 1)

- **Node 22 is mandatory.** The repo's `.nvmrc` pins `22`; the shell default here is Node 26, which breaks `better-sqlite3`'s native ABI. Run `nvm use` at the repo root and confirm `node -v` prints `v22.x` before any `pnpm` command in this plan.
- **Working directory:** `/Users/cwarner/Projects/_fleet_roadmap_add` (git worktree, branch `fix/roadmap-add-sync-and-shard-fields`). All paths below are relative to that root.
- **Harness CLI:** invoke as the absolute path `/opt/homebrew/bin/harness`.
- **No aliases anywhere.** Neither `packages/core/vitest.config.mts` nor `packages/cli/vitest.config.mts` declares a path alias, and no `tsconfig.json` declares `paths`. Cross-package imports resolve through the `node_modules` symlink to each package's `dist/`. Consequence: **`packages/types` must be rebuilt before `packages/core` can see the new `SyncResult` field** (Task 1), and **`packages/core` must be rebuilt before `packages/cli` can see `syncRowToExternal`** (Task 9). The spec's Implementation Order names the second hop; the first is the same mechanism and is equally load-bearing.
- **`harness validate` is NOT a clean per-task gate in this repo.** It currently exits 1 with a **409-issue** pre-existing baseline (design-token advisories in `packages/graph` / `packages/orchestrator` test fixtures, plus ~39 roadmap-health advisories on `Intake` rows). Per-task the gate is the targeted vitest run plus `/opt/homebrew/bin/harness check-deps` (which passes cleanly today: "Analyzed 2312 module(s) across 9 layer(s). v validation passed"). `harness validate` is run once, in Task 15, as a **no-new-issues** comparison against the recorded 409 baseline. Recording the baseline before starting is part of Task 15.
- **Hard constraint carried from the spec and the task brief:** do **not** run the `manage_roadmap` MCP tool in any mode during execution, and do not add/promote/update a roadmap row. Roadmap-row registration for this fix is out of band.

## Observable Truths (Acceptance Criteria)

Numbered to match the spec's SC table verbatim — these are settled, not re-derived.

| #    | Criterion (EARS)                                                                                                                                                                                                                                                                         | Delivered by |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| SC1  | When `add` completes successfully, the system shall not call `triggerExternalSync`.                                                                                                                                                                                                      | Task 10      |
| SC2  | When a row is added, via the scoped path with a stub tracker that reports (i) an unrelated row's issue as having no assignee while the local row has one, and (ii) an unrelated `backlog` row's issue as bare `OPEN`, the system shall leave both unrelated rows byte-identical on disk. | Task 13      |
| SC3  | If a tracker ticket reports no assignee and `forceSync` is not set, then the system shall not clear a non-null local assignee.                                                                                                                                                           | Task 2       |
| SC4  | If a tracker ticket is `OPEN` and carries **no** disambiguating status label and `forceSync` is not set, then the system shall not overwrite a local `backlog` status.                                                                                                                   | Task 4       |
| SC5  | When `forceSync` is set, the system shall still apply both overwrites in SC3 and SC4.                                                                                                                                                                                                    | Tasks 2, 4   |
| SC6  | When `add` runs against a configured stub tracker, the created row shall carry a non-null `External-ID`, and the serialized shard shall contain the `Assignee` / `Priority` / `External-ID` lines.                                                                                       | Task 13      |
| SC7  | When `syncRowToExternal` runs, the adapter shall receive no write call carrying any `externalId` other than the added row's, and at most one `createTicket` call.                                                                                                                        | Task 6       |
| SC8  | If a row's title already matches an existing labelled ticket, then `syncRowToExternal` shall link to it and shall not call `createTicket`.                                                                                                                                               | Task 7       |
| SC9  | If the tracker is configured but linking fails, then the `add` response shall report the failure and shall not be marked `isError`.                                                                                                                                                      | Task 12      |
| SC10 | Existing serializer round-trip and legacy-omission tests shall continue to pass unmodified.                                                                                                                                                                                              | Task 15      |
| SC11 | When a ticket is `OPEN` and carries an explicit `planned` label, the system shall promote a local `backlog` row to `planned`.                                                                                                                                                            | Task 4       |
| SC12 | When inbound sync suppresses an assignee clear or a `backlog` overwrite, the system shall record it in `SyncResult.suppressedInbound`.                                                                                                                                                   | Tasks 2, 4   |
| SC13 | If `fetchAllTickets` fails, then `syncRowToExternal` shall call neither `createTicket` nor `updateTicket` and shall report the error.                                                                                                                                                    | Task 6       |
| SC14 | When inbound sync moves an assigned, non-machine-claimed row away from `in-progress`, the resulting row shall satisfy `assignee ≠ null ⟺ in-progress`.                                                                                                                                   | Task 3       |

## Change Specification (delta)

- **[MODIFIED]** `manage_roadmap add` no longer triggers a whole-repo `fullSync`; it performs a row-scoped push. (D1)
- **[ADDED]** Core export `syncRowToExternal(projectRoot, adapter, config, featureName, options?)`. (D2)
- **[ADDED]** `SyncResult.suppressedInbound`. (D3d)
- **[MODIFIED]** `applyTicketToFeature`: a null tracker assignee no longer clears a local assignee; the `setStatus` routing widens from a machine claim to **any** non-null assignee; a label-less `OPEN` ticket no longer overwrites a local `backlog`. (D3 a/b/c)
- **[ADDED]** CLI `triggerScopedExternalSync` + `RowLinkOutcome`, with a `deps.makeAdapter` injection seam. (D5)
- **[MODIFIED]** The `add` response is an envelope (`{ ...roadmap, link, message? }`) rather than a bare roadmap. (D5)
- **[MODIFIED]** `packages/cli/tests/mcp/tools/roadmap.test.ts` — the existing test `triggers external sync after add action` asserts the behaviour this fix removes and is inverted in Task 10.
- **[UNCHANGED, deliberately]** `serializeExtendedLines` (D4); the pre-existing `blocked → planned` guard (D3c accepted trade-off); `update` / `remove` / `promote` / `autoSyncRoadmap` routing (spec Non-goals).

## File Map

```
MODIFY packages/types/src/tracker-sync.ts                      (add SuppressedInbound + SyncResult.suppressedInbound)
MODIFY packages/core/src/roadmap/sync-engine.ts                (emptySyncResult, guards a/b/c/d, fullSync literal, syncRowToExternal)
MODIFY packages/core/src/roadmap/index.ts                      (barrel: export syncRowToExternal)
MODIFY packages/core/tests/roadmap/sync-engine-guards.test.ts  (SC3,4,5,7,8,11,12,13,14)
MODIFY packages/cli/src/mcp/tools/roadmap-auto-sync.ts         (RowLinkOutcome + triggerScopedExternalSync)
MODIFY packages/cli/src/mcp/tools/roadmap.ts                   (shouldTriggerExternalSync, handleAdd, addResponse)
MODIFY packages/cli/tests/mcp/tools/roadmap.test.ts            (SC1 — invert the existing add-triggers-sync test)
MODIFY packages/cli/tests/commands/roadmap/sync.test.ts        (mechanical: add suppressedInbound to the SyncResult literal at :399)
CREATE packages/cli/tests/mcp/tools/roadmap-scoped-sync.test.ts (SC2, SC6, SC9, not-configured, no-token)
CREATE .changeset/roadmap-add-scoped-tracker-link.md
```

No other file is touched. `packages/core/src/index.ts` is auto-generated but re-exports `./roadmap` with `export *`, so the new symbol propagates without editing it (verified by `generate:barrels:check` in Task 8).

## Skeleton

1. **Core inbound guards (D3 a–d)** — the `suppressedInbound` type + plumbing, then one task per guard (~4 tasks, ~17 min)
2. **Core scoped push (D2)** — `syncRowToExternal` in three slices (skeleton/guard, push+writeback, dedup) + barrel (~4 tasks, ~17 min)
3. **Rebuild `packages/core`** so the CLI suite resolves the new export through `dist` (~1 task, ~3 min)
4. **CLI wiring (D1, D5)** — dispatcher exclusion, the seam, `handleAdd` push + envelope, end-to-end (~4 tasks, ~18 min)
5. **Changeset + full verification** (~2 tasks, ~7 min)

**Estimated total:** 15 tasks, ~62 minutes.
_Skeleton derived directly from the spec's approved `## Implementation Order`. Its 5-step ordering is a real build dependency and must not be reordered._

---

## Tasks

### Task 1: Add `suppressedInbound` to `SyncResult` and rebuild `@harness-engineering/types`

**Depends on:** none | **Files:** `packages/types/src/tracker-sync.ts`, `packages/core/src/roadmap/sync-engine.ts`, `packages/cli/tests/commands/roadmap/sync.test.ts` | **Owns:** `packages/types/src/tracker-sync.ts` | **Covers:** D3(d) plumbing
**Skills:** `ts-utility-types` (reference)

This is the type foundation. There is no behaviour to test yet — the gate is `tsc --noEmit` across the three packages that construct a `SyncResult`.

1. In `packages/types/src/tracker-sync.ts`, insert above `export interface SyncResult`:

   ```ts
   /**
    * An inbound (tracker → roadmap) write that was computed but deliberately
    * withheld because the tracker had no opinion to assert. The sync module's
    * stated convention is that a withheld action lands somewhere, never nowhere
    * — without this, an operator debugging "why did my GitHub unassign not take
    * effect" gets silence.
    */
   export interface SuppressedInbound {
     /** Roadmap feature name whose local field was kept */
     feature: string;
     /** Which local field the inbound write would have touched */
     field: 'assignee' | 'status';
     /** Local value that was kept */
     from: string | null;
     /** Value the tracker would have written */
     to: string | null;
     /** Why the write was withheld */
     reason: string;
   }
   ```

2. In the same file, inside `export interface SyncResult`, add immediately after the `skippedStateChanges` line:

   ```ts
   /** Inbound writes withheld because the tracker had no opinion (see applyTicketToFeature) */
   suppressedInbound: SuppressedInbound[];
   ```

3. In `packages/core/src/roadmap/sync-engine.ts`, in `emptySyncResult()` (~line 29), add after `skippedStateChanges: [],`:

   ```ts
   suppressedInbound: [],
   ```

4. In the same file, in the `fullSync` return literal (~line 443), add after `skippedStateChanges: pushResult.skippedStateChanges,`:

   ```ts
   suppressedInbound: pullResult.suppressedInbound,
   ```

   The pull result is the only phase that can suppress inbound writes; the push result's array is always empty.

5. In `packages/cli/tests/commands/roadmap/sync.test.ts`, in the hand-written `SyncResult` literal at ~line 399 (inside `guard defaults are pass-through`), add after `skippedStateChanges: [],`:

   ```ts
   suppressedInbound: [],
   ```

   These three literals are the complete set — `grep -rn "skippedStateChanges" packages --include="*.ts"` returns no other object literal.

6. Rebuild the types package so downstream packages resolve the new field through `dist` (there is no alias):

   ```
   pnpm --filter @harness-engineering/types build
   ```

7. Verify:

   ```
   pnpm --filter @harness-engineering/types typecheck
   pnpm --filter @harness-engineering/core typecheck
   pnpm --filter @harness-engineering/cli typecheck
   /opt/homebrew/bin/harness check-deps
   ```

8. Commit: `feat(roadmap-sync): add suppressedInbound to SyncResult`

---

### Task 2: D3(a) — a null tracker assignee must not clear a local assignee

**Depends on:** Task 1 | **Files:** `packages/core/tests/roadmap/sync-engine-guards.test.ts`, `packages/core/src/roadmap/sync-engine.ts` | **Owns:** `packages/core/src/roadmap/sync-engine.ts` | **Covers:** SC3, SC5 (assignee half), SC12 (assignee half)

1. In `packages/core/tests/roadmap/sync-engine-guards.test.ts`, extend the existing import on line 5 to include `syncFromExternal`:

   ```ts
   import {
     syncToExternal,
     syncFromExternal,
     fullSync,
     _resetSyncMutex,
   } from '../../src/roadmap/sync-engine';
   ```

2. Append to the end of the same file:

   ```ts
   describe('applyTicketToFeature() — tracker silence is not tracker opinion (assignee)', () => {
     function ownedRow() {
       return makeFeature({
         name: 'Owned Row',
         status: 'in-progress',
         assignee: '@alice',
         externalId: 'github:owner/repo#1',
       });
     }

     /** Ticket that agrees on status but reports nobody assigned. */
     function silentTicket() {
       return ticket({
         title: 'Owned Row',
         assignee: null,
         labels: ['harness-managed', 'in-progress'],
       });
     }

     it('does not clear a non-null local assignee when the ticket reports none', async () => {
       const feature = ownedRow();
       const roadmap = makeRoadmap([feature]);
       const adapter = mockAdapter({ fetchAllTickets: vi.fn(async () => Ok([silentTicket()])) });

       const result = await syncFromExternal(roadmap, adapter, CONFIG);

       expect(feature.assignee).toBe('@alice');
       expect(result.assignmentChanges).toEqual([]);
     });

     it('records the suppression rather than dropping it', async () => {
       const feature = ownedRow();
       const roadmap = makeRoadmap([feature]);
       const adapter = mockAdapter({ fetchAllTickets: vi.fn(async () => Ok([silentTicket()])) });

       const result = await syncFromExternal(roadmap, adapter, CONFIG);

       expect(result.suppressedInbound).toEqual([
         {
           feature: 'Owned Row',
           field: 'assignee',
           from: '@alice',
           to: null,
           reason: 'tracker-reports-no-assignee',
         },
       ]);
     });

     it('still clears the assignee under forceSync (escape hatch intact)', async () => {
       const feature = ownedRow();
       const roadmap = makeRoadmap([feature]);
       const adapter = mockAdapter({ fetchAllTickets: vi.fn(async () => Ok([silentTicket()])) });

       const result = await syncFromExternal(roadmap, adapter, CONFIG, { forceSync: true });

       expect(feature.assignee).toBeNull();
       expect(result.suppressedInbound).toEqual([]);
       expect(result.assignmentChanges).toEqual([
         { feature: 'Owned Row', from: '@alice', to: null },
       ]);
     });

     it('still applies an inbound assignment (null → someone) and a reassignment', async () => {
       const unassigned = makeFeature({
         name: 'Owned Row',
         status: 'planned',
         assignee: null,
         externalId: 'github:owner/repo#1',
       });
       const roadmap = makeRoadmap([unassigned]);
       const adapter = mockAdapter({
         fetchAllTickets: vi.fn(async () =>
           Ok([
             ticket({
               title: 'Owned Row',
               assignee: '@bob',
               labels: ['harness-managed', 'planned'],
             }),
           ])
         ),
       });

       const result = await syncFromExternal(roadmap, adapter, CONFIG);

       expect(unassigned.assignee).toBe('@bob');
       expect(result.suppressedInbound).toEqual([]);
     });
   });
   ```

3. Run and observe failure (the first three fail; the fourth passes):

   ```
   pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/sync-engine-guards.test.ts
   ```

4. In `packages/core/src/roadmap/sync-engine.ts`, replace the assignee block inside `applyTicketToFeature` (currently the `if (!localMachineClaim && ticketState.assignee !== feature.assignee)` block) with:

   ```ts
   // Assignee: external wins — EXCEPT (i) a live machine claim, which is local
   // truth, and (ii) tracker SILENCE. A null external assignee is missing
   // information, not an authoritative empty value: an unassigned issue is the
   // DEFAULT state of every issue, so letting it clear a local assignee means
   // the tracker's default silently overwrites a human's decision. Assignment
   // (null → someone) and reassignment are unaffected; forceSync still clears.
   if (!localMachineClaim && ticketState.assignee !== feature.assignee) {
     const clearsLocalAssignee = ticketState.assignee === null && feature.assignee !== null;
     if (clearsLocalAssignee && !forceSync) {
       result.suppressedInbound.push({
         feature: feature.name,
         field: 'assignee',
         from: feature.assignee,
         to: null,
         reason: 'tracker-reports-no-assignee',
       });
     } else {
       result.assignmentChanges.push({
         feature: feature.name,
         from: feature.assignee,
         to: ticketState.assignee,
       });
       feature.assignee = ticketState.assignee;
     }
   }
   ```

5. Run — observe all four pass. Then run the whole core roadmap suite to catch collateral:

   ```
   pnpm --filter @harness-engineering/core exec vitest run tests/roadmap
   ```

6. `/opt/homebrew/bin/harness check-deps`
7. Commit: `fix(roadmap-sync): do not let an absent tracker assignee clear a local one`

---

### Task 3: D3(b) — widen the `setStatus` routing from a machine claim to any non-null assignee

**Depends on:** Task 2 | **Files:** `packages/core/tests/roadmap/sync-engine-guards.test.ts`, `packages/core/src/roadmap/sync-engine.ts` | **Covers:** SC14

**Why this task cannot be skipped or merged away.** The bare status write at the end of `applyTicketToFeature` documents its own precondition — "the assignee block above already reconciled the assignee from external". Task 2 deleted that precondition. Without this widening, a row that is `in-progress` / `@alice` whose ticket closes with no assignee ends up **`done` while still assigned**, violating RMH005 (`assignee ≠ null ⟺ in-progress`), which is an **error**-severity health rule that fails `harness validate` — on exactly the rows Task 2's guard exists to protect.

1. Add to `packages/core/tests/roadmap/sync-engine-guards.test.ts` — first extend the imports:

   ```ts
   import { assigneeInvariantHolds } from '../../src/roadmap/assignee-lifecycle';
   ```

2. Append:

   ```ts
   describe('applyTicketToFeature() — RMH005 holds after an inbound move off in-progress', () => {
     it('releases a HUMAN assignee through setStatus when the ticket closes', async () => {
       const feature = makeFeature({
         name: 'Owned Row',
         status: 'in-progress',
         assignee: '@alice',
         externalId: 'github:owner/repo#1',
       });
       const roadmap = makeRoadmap([feature]);
       const adapter = mockAdapter({
         fetchAllTickets: vi.fn(async () =>
           Ok([
             ticket({
               title: 'Owned Row',
               status: 'closed',
               assignee: null,
               labels: ['harness-managed'],
             }),
           ])
         ),
       });

       await syncFromExternal(roadmap, adapter, CONFIG);

       expect(feature.status).toBe('done');
       expect(feature.assignee).toBeNull();
       expect(assigneeInvariantHolds(feature)).toBe(true);
       expect(roadmap.assignmentHistory.length).toBeGreaterThan(0);
     });

     it('still releases a MACHINE claim (pre-existing behaviour preserved)', async () => {
       const feature = makeFeature({
         name: 'Owned Row',
         status: 'in-progress',
         assignee: 'orchestrator-1234abcd',
         externalId: 'github:owner/repo#1',
       });
       const roadmap = makeRoadmap([feature]);
       const adapter = mockAdapter({
         fetchAllTickets: vi.fn(async () =>
           Ok([ticket({ title: 'Owned Row', status: 'closed', labels: ['harness-managed'] })])
         ),
       });

       await syncFromExternal(roadmap, adapter, CONFIG);

       expect(feature.status).toBe('done');
       expect(assigneeInvariantHolds(feature)).toBe(true);
     });
   });
   ```

3. Run — observe the first test fails with `feature.assignee === '@alice'`:

   ```
   pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/sync-engine-guards.test.ts
   ```

4. In `packages/core/src/roadmap/sync-engine.ts`, in `applyTicketToFeature`, replace the routing block:

   ```ts
   // When inbound sync moves an ASSIGNED row away from in-progress, route
   // through setStatus() so the assignee is released through the lifecycle
   // authority and an `unassigned` history entry is recorded — keeping
   // `assignee ≠ null ⟺ in-progress` (RMH005, an error-severity health rule).
   //
   // The condition is deliberately ANY non-null assignee, not just a machine
   // claim. The bare status write below used to be safe because the assignee
   // block above always reconciled the assignee from external first; the
   // tracker-silence guard removed that precondition, so a human-assigned row
   // whose ticket closes would otherwise land `done` while still assigned.
   // `feature.assignee` is read AFTER the assignee block, so this sees the
   // post-reconcile value.
   const date = new Date().toISOString().slice(0, 10);
   if (feature.assignee !== null && newStatus !== 'in-progress') {
     setStatus(roadmap, feature, newStatus, date);
     return;
   }
   feature.status = newStatus;
   ```

   `localMachineClaim` stays declared — the assignee block above still uses it.

5. Run — observe pass. Then `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap`.
6. `/opt/homebrew/bin/harness check-deps`
7. Commit: `fix(roadmap-sync): release any assignee via setStatus on inbound move off in-progress`

---

### Task 4: D3(c) — a label-less `OPEN` ticket must not overwrite a local `backlog`

**Depends on:** Task 3 | **Files:** `packages/core/tests/roadmap/sync-engine-guards.test.ts`, `packages/core/src/roadmap/sync-engine.ts` | **Covers:** SC4, SC11, SC5 (status half), SC12 (status half)

**Critical test-fixture note.** The existing `CONFIG` in this test file has **no bare `open` key** (only `closed`, `open:in-progress`, `open:blocked`, `open:planned`). Under that config a label-less `OPEN` ticket resolves to `null` and returns early, so the new guard is never reached. This repo's real `harness.config.json` uses a **direct** `open: planned` key, which `resolveReverseStatus` matches _before_ it ever reaches the compound branch (`packages/core/src/roadmap/tracker-sync.ts:107-109`) — that provenance collapse is the entire reason the guard must be label-gated rather than status-gated. The tests below therefore introduce a second config with the direct key.

**Do NOT touch the pre-existing `blocked → planned` guard on the adjacent line.** It shares the same provenance blindness, and changing it is an unrequested regression risk explicitly ruled out of scope by the spec.

1. Append to `packages/core/tests/roadmap/sync-engine-guards.test.ts`:

   ```ts
   /**
    * This repo's own reverseStatusMap shape: a DIRECT `open` key, which
    * resolveReverseStatus matches before it ever reaches the compound branch.
    * A bare OPEN and an explicitly `planned`-labelled OPEN both resolve to
    * `planned` here — which is exactly why the backlog guard must be gated on
    * the LABEL, not on the resolved status.
    */
   const CONFIG_DIRECT_OPEN: TrackerSyncConfig = {
     ...CONFIG,
     reverseStatusMap: { ...CONFIG.reverseStatusMap, open: 'planned' },
   };

   describe('applyTicketToFeature() — bare OPEN is not an opinion about backlog', () => {
     function backlogRow() {
       return makeFeature({
         name: 'Idea Row',
         status: 'backlog',
         assignee: null,
         externalId: 'github:owner/repo#5',
       });
     }

     it('does not overwrite backlog when the ticket carries no status label', async () => {
       const feature = backlogRow();
       const roadmap = makeRoadmap([feature]);
       const adapter = mockAdapter({
         fetchAllTickets: vi.fn(async () =>
           Ok([
             ticket({
               externalId: 'github:owner/repo#5',
               title: 'Idea Row',
               status: 'open',
               labels: ['harness-managed'],
             }),
           ])
         ),
       });

       const result = await syncFromExternal(roadmap, adapter, CONFIG_DIRECT_OPEN);

       expect(feature.status).toBe('backlog');
       expect(result.suppressedInbound).toEqual([
         {
           feature: 'Idea Row',
           field: 'status',
           from: 'backlog',
           to: 'planned',
           reason: 'tracker-open-without-status-label',
         },
       ]);
     });

     it('DOES promote backlog when the ticket carries an explicit planned label', async () => {
       const feature = backlogRow();
       const roadmap = makeRoadmap([feature]);
       const adapter = mockAdapter({
         fetchAllTickets: vi.fn(async () =>
           Ok([
             ticket({
               externalId: 'github:owner/repo#5',
               title: 'Idea Row',
               status: 'open',
               labels: ['harness-managed', 'planned'],
             }),
           ])
         ),
       });

       const result = await syncFromExternal(roadmap, adapter, CONFIG_DIRECT_OPEN);

       expect(feature.status).toBe('planned');
       expect(result.suppressedInbound).toEqual([]);
     });

     it('still overwrites backlog under forceSync (escape hatch intact)', async () => {
       const feature = backlogRow();
       const roadmap = makeRoadmap([feature]);
       const adapter = mockAdapter({
         fetchAllTickets: vi.fn(async () =>
           Ok([
             ticket({
               externalId: 'github:owner/repo#5',
               title: 'Idea Row',
               status: 'open',
               labels: ['harness-managed'],
             }),
           ])
         ),
       });

       const result = await syncFromExternal(roadmap, adapter, CONFIG_DIRECT_OPEN, {
         forceSync: true,
       });

       expect(feature.status).toBe('planned');
       expect(result.suppressedInbound).toEqual([]);
     });

     it('leaves the pre-existing blocked guard untouched', async () => {
       const feature = makeFeature({
         name: 'Idea Row',
         status: 'blocked',
         externalId: 'github:owner/repo#5',
       });
       const roadmap = makeRoadmap([feature]);
       const adapter = mockAdapter({
         fetchAllTickets: vi.fn(async () =>
           Ok([
             ticket({
               externalId: 'github:owner/repo#5',
               title: 'Idea Row',
               status: 'open',
               labels: ['harness-managed'],
             }),
           ])
         ),
       });

       const result = await syncFromExternal(roadmap, adapter, CONFIG_DIRECT_OPEN);

       expect(feature.status).toBe('blocked');
       expect(result.suppressedInbound).toEqual([]);
     });
   });
   ```

2. Run — observe the first test fails (`status === 'planned'`):

   ```
   pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/sync-engine-guards.test.ts
   ```

3. In `packages/core/src/roadmap/sync-engine.ts`, add above `function applyTicketToFeature(`:

   ```ts
   /** The labels `resolveReverseStatus` treats as status opinions. */
   const DISAMBIGUATING_STATUS_LABELS = ['in-progress', 'blocked', 'planned', 'needs-human'];

   /**
    * True when the ticket carries at least one label that expresses a status
    * opinion. `resolveReverseStatus` collapses provenance — it matches its direct
    * key (`open → planned`) BEFORE it ever reaches the compound branch — so the
    * resolved status alone cannot tell an explicit `planned` label apart from a
    * bare `OPEN`. This predicate restores that distinction for the backlog guard.
    */
   function hasDisambiguatingStatusLabel(labels: string[]): boolean {
     return labels.some((l) => DISAMBIGUATING_STATUS_LABELS.includes(l));
   }
   ```

4. In `applyTicketToFeature`, immediately **after** the existing `blocked` guard line and **before** the routing block from Task 3, insert:

   ```ts
   // Guard: a merely-OPEN issue is not an opinion about backlog vs planned —
   // both are open states, and an unlabelled open issue is the default state of
   // every issue. Gated on the ABSENCE of a disambiguating label rather than on
   // the resolved status, because a direct `open → planned` key resolves an
   // explicitly-labelled `planned` ticket identically to a bare one. An explicit
   // `planned` label IS an opinion and still promotes.
   if (
     !forceSync &&
     feature.status === 'backlog' &&
     newStatus === 'planned' &&
     !hasDisambiguatingStatusLabel(ticketState.labels)
   ) {
     result.suppressedInbound.push({
       feature: feature.name,
       field: 'status',
       from: 'backlog',
       to: 'planned',
       reason: 'tracker-open-without-status-label',
     });
     return;
   }
   ```

5. Run — observe all four pass. Then `pnpm --filter @harness-engineering/core exec vitest run tests/roadmap`.
6. `/opt/homebrew/bin/harness check-deps`
7. Commit: `fix(roadmap-sync): keep local backlog when the tracker has no status opinion`

---

### Task 5: `syncRowToExternal` — skeleton, mutex, and the name-resolution guard

**Depends on:** Task 4 | **Files:** `packages/core/tests/roadmap/sync-engine-guards.test.ts`, `packages/core/src/roadmap/sync-engine.ts` | **Covers:** D2 identity guard

1. Append to `packages/core/tests/roadmap/sync-engine-guards.test.ts` (extend the top-level import to add `syncRowToExternal`):

   ```ts
   describe('syncRowToExternal() — row identity guard', () => {
     let tmpDir: string;
     let roadmapPath: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-push-'));
       fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
       roadmapPath = path.join(tmpDir, 'docs', 'roadmap.md');
       _resetSyncMutex();
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('reports a zero-match name as an error and performs no adapter call', async () => {
       fs.writeFileSync(roadmapPath, serializeRoadmap(makeRoadmap([makeFeature()])), 'utf-8');
       const before = fs.readFileSync(roadmapPath, 'utf-8');
       const adapter = mockAdapter();

       const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'No Such Row');

       expect(adapter.fetchAllTickets).not.toHaveBeenCalled();
       expect(adapter.createTicket).not.toHaveBeenCalled();
       expect(adapter.updateTicket).not.toHaveBeenCalled();
       expect(result.errors).toHaveLength(1);
       expect(result.errors[0]!.error.message).toContain('not found');
       expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(before);
     });

     it('reports an ambiguous name as an error rather than throwing', async () => {
       const roadmap = makeRoadmap([makeFeature({ name: 'Dup' })]);
       roadmap.milestones.push({
         name: 'M2',
         isBacklog: false,
         features: [makeFeature({ name: 'Dup' })],
       });
       fs.writeFileSync(roadmapPath, serializeRoadmap(roadmap), 'utf-8');
       const adapter = mockAdapter();

       const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'dup');

       expect(result.errors).toHaveLength(1);
       expect(result.errors[0]!.error.message).toContain('ambiguous');
       expect(adapter.createTicket).not.toHaveBeenCalled();
     });

     it('matches the feature name case-insensitively', async () => {
       fs.writeFileSync(
         roadmapPath,
         serializeRoadmap(makeRoadmap([makeFeature({ name: 'Mixed Case Row' })])),
         'utf-8'
       );
       const adapter = mockAdapter();

       const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'mIxEd cAsE rOw');

       expect(result.errors).toEqual([]);
       expect(adapter.createTicket).toHaveBeenCalledOnce();
     });
   });
   ```

2. Run — observe failure (`syncRowToExternal is not a function`):

   ```
   pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/sync-engine-guards.test.ts
   ```

3. In `packages/core/src/roadmap/sync-engine.ts`, append after `fullSync` and before `_resetSyncMutex`:

   ```ts
   /**
    * Push exactly ONE roadmap row to the tracker. Push-only, dedup-aware,
    * fail-closed. This is the blast-radius-proportional counterpart to
    * `fullSync`: an operation that writes one row must not reconcile the repo.
    *
    * - Takes the SAME module mutex as `fullSync`, so a scoped push and a full
    *   sync can never interleave their writebacks.
    * - Locates the row by case-insensitive name (matching the MCP tool). A match
    *   count other than exactly 1 is an error in the returned SyncResult and
    *   performs no writes — it never throws. Refusing an ambiguous name up front
    *   keeps name identity and `applyRoadmapDiff`'s slug identity from meeting.
    * - Runs NO inbound pull: nothing external can overwrite any local field here,
    *   so `suppressedInbound` is always empty on this path.
    * - Does NOT stamp `last_synced`. A scoped push is not a reconcile, and
    *   bumping the stamp would assert a whole-roadmap comparison that never
    *   happened. Deliberate behaviour change from the fullSync-on-add status quo.
    *
    * `examined.roadmapRows` is 1 by construction (the single-row projection),
    * which differs in meaning from fullSync's whole-roadmap denominator.
    */
   export async function syncRowToExternal(
     projectRoot: string,
     adapter: TrackerSyncAdapter,
     config: TrackerSyncConfig,
     featureName: string,
     options?: ExternalSyncOptions
   ): Promise<SyncResult> {
     const previousSync = syncMutex;
     let releaseMutex: () => void;
     syncMutex = new Promise<void>((resolve) => {
       releaseMutex = resolve;
     });
     await previousSync;

     const dryRun = options?.dryRun ?? false;
     const fail = (error: Error): SyncResult => ({
       ...emptySyncResult(),
       dryRun,
       errors: [{ featureOrId: featureName, error }],
     });

     try {
       const store = resolveRoadmapStore({ projectRoot });
       const loaded = await store.load();
       if (!loaded.ok) return fail(loaded.error);

       const roadmap = loaded.value;
       const matches: Array<{
         milestone: Roadmap['milestones'][number];
         feature: RoadmapFeature;
       }> = [];
       for (const milestone of roadmap.milestones) {
         for (const feature of milestone.features) {
           if (feature.name.toLowerCase() === featureName.toLowerCase()) {
             matches.push({ milestone, feature });
           }
         }
       }
       if (matches.length === 0) {
         return fail(new Error(`Feature "${featureName}" not found in roadmap`));
       }
       if (matches.length > 1) {
         return fail(
           new Error(`Feature name "${featureName}" is ambiguous (${matches.length} matches)`)
         );
       }

       // Filled in by Task 6.
       return emptySyncResult();
     } finally {
       releaseMutex!();
     }
   }
   ```

   `Roadmap`, `RoadmapFeature`, `SyncResult`, `TrackerSyncConfig` and `ExternalSyncOptions` are already imported at the top of this file; no new imports are needed.

4. Run — observe the first two tests pass. The third (`case-insensitively`) still fails because no create happens yet; that is expected and is closed by Task 6. Note the failure and proceed.
5. `/opt/homebrew/bin/harness check-deps`
6. Commit: `feat(roadmap-sync): add syncRowToExternal row-identity guard`

---

### Task 6: `syncRowToExternal` — fail-closed fetch, single-row projection, writeback

**Depends on:** Task 5 | **Files:** `packages/core/tests/roadmap/sync-engine-guards.test.ts`, `packages/core/src/roadmap/sync-engine.ts` | **Covers:** SC7, SC13

1. Append to `packages/core/tests/roadmap/sync-engine-guards.test.ts` (add `Err` to the `@harness-engineering/types` import alongside `Ok`):

   ```ts
   describe('syncRowToExternal() — scoped push', () => {
     let tmpDir: string;
     let roadmapPath: string;

     /** Target row plus two unrelated already-linked rows. */
     function threeRowRoadmap() {
       return makeRoadmap([
         makeFeature({ name: 'Target Row', status: 'planned', externalId: null }),
         makeFeature({
           name: 'Other A',
           status: 'in-progress',
           assignee: '@alice',
           externalId: 'github:owner/repo#7',
         }),
         makeFeature({ name: 'Other B', status: 'backlog', externalId: 'github:owner/repo#8' }),
       ]);
     }

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-push-push-'));
       fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
       roadmapPath = path.join(tmpDir, 'docs', 'roadmap.md');
       fs.writeFileSync(roadmapPath, serializeRoadmap(threeRowRoadmap()), 'utf-8');
       _resetSyncMutex();
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('writes only the target row: one create, and no write naming another externalId', async () => {
       const adapter = mockAdapter();

       const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'Target Row');

       expect(adapter.createTicket).toHaveBeenCalledOnce();
       const created = result.created[0]!.externalId;
       for (const call of (adapter.updateTicket as ReturnType<typeof vi.fn>).mock.calls) {
         expect(call[0]).toBe(created);
       }
       expect(result.errors).toEqual([]);
       expect(result.examined.roadmapRows).toBe(1);
       expect(result.suppressedInbound).toEqual([]);

       // The stamp landed on the real row, not on a throwaway projection.
       const after = fs.readFileSync(roadmapPath, 'utf-8');
       expect(after).toContain(`- **External-ID:** ${created}`);
       expect(after).toContain('github:owner/repo#7');
       expect(after).toContain('github:owner/repo#8');
     });

     it('does not stamp last_synced (a scoped push is not a reconcile)', async () => {
       const before = fs.readFileSync(roadmapPath, 'utf-8');
       const beforeStamp = /last_synced: (.*)/.exec(before)![1];

       await syncRowToExternal(tmpDir, mockAdapter(), CONFIG, 'Target Row');

       const after = fs.readFileSync(roadmapPath, 'utf-8');
       expect(/last_synced: (.*)/.exec(after)![1]).toBe(beforeStamp);
     });

     it('fails closed when fetchAllTickets fails: no create, no update, error reported', async () => {
       const before = fs.readFileSync(roadmapPath, 'utf-8');
       const adapter = mockAdapter({
         fetchAllTickets: vi.fn(async () => Err(new Error('tracker 503'))),
       });

       const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'Target Row');

       expect(adapter.createTicket).not.toHaveBeenCalled();
       expect(adapter.updateTicket).not.toHaveBeenCalled();
       expect(result.errors).toHaveLength(1);
       expect(result.errors[0]!.error.message).toContain('tracker 503');
       expect(fs.readFileSync(roadmapPath, 'utf-8')).toBe(before);
     });
   });
   ```

2. Run — observe failure:

   ```
   pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/sync-engine-guards.test.ts
   ```

3. In `packages/core/src/roadmap/sync-engine.ts`, replace the `// Filled in by Task 6.` / `return emptySyncResult();` placeholder in `syncRowToExternal` with:

   ```ts
   const { milestone, feature } = matches[0]!;
   const before = structuredClone(roadmap);

   // Fetch solely to build the dedup index. FAIL-CLOSED: fullSync degrades to
   // an empty index when the fetch fails, which for a one-row create would
   // mint exactly the duplicate issue this function exists to prevent.
   const fetchResult = await adapter.fetchAllTickets();
   if (!fetchResult.ok) return fail(fetchResult.error);

   // Single-row projection that SHARES feature object identity with `roadmap`.
   // syncToExternal mutates features in place, so the externalId it stamps
   // lands on the real row. Reuse, not reimplementation: create / dedup /
   // guard / report semantics stay in one place.
   const projection: Roadmap = {
     ...roadmap,
     milestones: [{ ...milestone, features: [feature] }],
   };

   const pushResult = await syncToExternal(projection, adapter, config, fetchResult.value, options);

   // No `stampLastSynced` here — see the function doc comment.
   const localWrites = changedFeatureNames(before, roadmap);
   const persisted = dryRun ? null : await applyRoadmapDiff(store, before, roadmap);
   const writebackErrors =
     persisted && !persisted.ok ? [{ featureOrId: featureName, error: persisted.error }] : [];

   return {
     ...pushResult,
     errors: [...pushResult.errors, ...writebackErrors],
     planned: { ...pushResult.planned, localWrites: dryRun ? localWrites : [] },
   };
   ```

4. Run — observe all pass, including Task 5's third test:

   ```
   pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/sync-engine-guards.test.ts
   ```

5. `/opt/homebrew/bin/harness check-deps`
6. Commit: `feat(roadmap-sync): scoped push writes back one row, fail-closed on fetch`

---

### Task 7: `syncRowToExternal` — link to an existing ticket rather than minting a duplicate

**Depends on:** Task 6 | **Files:** `packages/core/tests/roadmap/sync-engine-guards.test.ts` | **Covers:** SC8

No production change is expected — dedup is inherited from `syncToExternal`/`resolveExternalId`. This task **proves** the inheritance holds through the projection, which is the whole point of delegating rather than reimplementing. If the test fails, the projection is wrong, not the dedup.

1. Append inside the `syncRowToExternal() — scoped push` describe block:

   ```ts
   it('links to an existing labelled ticket with the same title and creates nothing', async () => {
     const adapter = mockAdapter({
       fetchAllTickets: vi.fn(async () =>
         Ok([
           ticket({
             externalId: 'github:owner/repo#42',
             title: 'Target Row',
             status: 'open',
             labels: ['harness-managed'],
           }),
         ])
       ),
     });

     const result = await syncRowToExternal(tmpDir, adapter, CONFIG, 'Target Row');

     expect(adapter.createTicket).not.toHaveBeenCalled();
     expect(result.created).toEqual([]);
     expect(result.updated).toEqual(['github:owner/repo#42']);
     expect(fs.readFileSync(roadmapPath, 'utf-8')).toContain(
       '- **External-ID:** github:owner/repo#42'
     );
   });

   it('ignores a same-title ticket that lacks the configured labels', async () => {
     const adapter = mockAdapter({
       fetchAllTickets: vi.fn(async () =>
         Ok([
           ticket({
             externalId: 'github:owner/repo#99',
             title: 'Target Row',
             status: 'open',
             labels: ['unrelated'],
           }),
         ])
       ),
     });

     await syncRowToExternal(tmpDir, adapter, CONFIG, 'Target Row');

     expect(adapter.createTicket).toHaveBeenCalledOnce();
   });
   ```

2. Run — observe pass:

   ```
   pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/sync-engine-guards.test.ts
   ```

3. `/opt/homebrew/bin/harness check-deps`
4. Commit: `test(roadmap-sync): prove scoped push dedups instead of minting a duplicate`

---

### Task 8: Export `syncRowToExternal` from the core barrel

**Depends on:** Task 7 | **Files:** `packages/core/src/roadmap/index.ts` | **Category:** integration

1. In `packages/core/src/roadmap/index.ts`, change line 90 from:

   ```ts
   export { syncToExternal, syncFromExternal, fullSync } from './sync-engine';
   ```

   to:

   ```ts
   export { syncToExternal, syncFromExternal, fullSync, syncRowToExternal } from './sync-engine';
   ```

2. `packages/core/src/index.ts` is auto-generated but re-exports `./roadmap` with `export *`, so it needs no edit. Verify freshness:

   ```
   pnpm run generate:barrels:check
   ```

3. `pnpm --filter @harness-engineering/core typecheck`
4. `/opt/homebrew/bin/harness check-deps`
5. Commit: `feat(core): export syncRowToExternal from the roadmap barrel`

---

### Task 9: Rebuild `packages/core` so the CLI resolves the new export

**Depends on:** Task 8 | **Files:** none (build artifact) | **Category:** integration

`packages/cli/vitest.config.mts` declares no alias and `packages/cli/tsconfig.json` declares no `paths`, so `@harness-engineering/core` resolves through the `node_modules` symlink to `packages/core/dist`. Every CLI task from here on is invisible to both `tsc` and `vitest` until this runs.

1. Confirm Node 22 (`node -v` must print `v22.x`; `nvm use` at the repo root reads `.nvmrc`).
2. Build:

   ```
   pnpm --filter @harness-engineering/core build
   ```

3. Verify the symbol reached the declaration file:

   ```
   grep -c "syncRowToExternal" packages/core/dist/index.d.ts
   ```

   Must print a non-zero count. If it prints `0`, the barrel edit in Task 8 did not land — stop and fix before continuing.

4. `pnpm --filter @harness-engineering/cli typecheck`
5. No commit (build output is gitignored). If `dist/` is unexpectedly tracked in this worktree, add it to `.git/info/exclude` rather than committing it.

---

### Task 10: `add` stops triggering the whole-repo sync (D1)

**Depends on:** Task 9 | **Files:** `packages/cli/src/mcp/tools/roadmap.ts`, `packages/cli/tests/mcp/tools/roadmap.test.ts` | **Covers:** SC1

The existing test `triggers external sync after add action` (`packages/cli/tests/mcp/tools/roadmap.test.ts:721`) asserts precisely the behaviour this fix removes. Inverting it is a required part of the change, not collateral damage.

1. In `packages/cli/tests/mcp/tools/roadmap.test.ts`, replace that test with:

   ```ts
   it('does NOT trigger the whole-repo external sync after add action', async () => {
     await handleManageRoadmap({
       path: tmpDir,
       action: 'add',
       feature: 'New Feature',
       milestone: 'MVP Release',
       status: 'planned',
       summary: 'Test feature',
     });
     // `add` writes one row; mirroring it as a whole-repo reconcile rewrites
     // OTHER rows with tracker state. The scoped push in handleAdd replaces it.
     expect(syncSpy).not.toHaveBeenCalled();
   });
   ```

   Leave the sibling `update` / `remove` / `promote` assertions alone — those paths deliberately still route through `triggerExternalSync` (spec Non-goals).

2. Run — observe failure:

   ```
   pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/roadmap.test.ts
   ```

3. In `packages/cli/src/mcp/tools/roadmap.ts`, in `shouldTriggerExternalSync`, add after the `groom` early return:

   ```ts
   // `add` writes exactly one row. Mirroring it as a whole-repo reconcile
   // rewrites OTHER rows with tracker state — the same principle the `groom`
   // exclusion above already states. handleAdd performs a row-scoped push
   // instead, so the new row still gets its External-ID.
   if (input.action === 'add') return false;
   ```

4. Run — observe pass.
5. `/opt/homebrew/bin/harness check-deps`
6. Commit: `fix(roadmap): stop firing a whole-repo tracker sync from manage_roadmap add`

---

### Task 11: `triggerScopedExternalSync` with the `deps.makeAdapter` seam (D5)

**Depends on:** Task 9 | **Files:** `packages/cli/src/mcp/tools/roadmap-auto-sync.ts`, `packages/cli/tests/mcp/tools/roadmap-scoped-sync.test.ts` | **Owns:** `packages/cli/src/mcp/tools/roadmap-auto-sync.ts`

**The seam is mandatory.** `triggerExternalSync` constructs `GitHubIssuesSyncAdapter` internally with no seam, which is why nothing today can drive that path against a fake tracker. Without `deps.makeAdapter`, SC2 and SC6 are unprovable without network.

1. Create `packages/cli/tests/mcp/tools/roadmap-scoped-sync.test.ts`:

   ```ts
   /**
    * The row-scoped tracker push: outcome classification and the adapter
    * injection seam. No network — every tracker interaction goes through a stub.
    */
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { triggerScopedExternalSync } from '../../../src/mcp/tools/roadmap-auto-sync';

   const TRACKER_CONFIG = {
     roadmap: {
       tracker: {
         kind: 'github',
         repo: 'owner/repo',
         labels: ['harness-managed'],
         statusMap: {
           backlog: 'open',
           planned: 'open',
           'in-progress': 'open',
           done: 'closed',
           blocked: 'open',
         },
         reverseStatusMap: { open: 'planned', closed: 'done' },
       },
     },
   };

   let dir: string;

   beforeEach(() => {
     dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-link-'));
     fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
   });

   afterEach(() => {
     vi.unstubAllEnvs();
     vi.restoreAllMocks();
     fs.rmSync(dir, { recursive: true, force: true });
   });

   describe('triggerScopedExternalSync() — outcome classification', () => {
     it('returns not-configured when the project has no tracker config', async () => {
       const outcome = await triggerScopedExternalSync(dir, 'Anything');
       expect(outcome).toEqual({ kind: 'not-configured' });
     });

     it('returns no-token when a tracker is configured but GITHUB_TOKEN is absent', async () => {
       fs.writeFileSync(
         path.join(dir, 'harness.config.json'),
         JSON.stringify(TRACKER_CONFIG),
         'utf-8'
       );
       vi.stubEnv('GITHUB_TOKEN', '');

       const outcome = await triggerScopedExternalSync(dir, 'Anything');

       expect(outcome).toEqual({ kind: 'no-token' });
     });
   });
   ```

2. Run — observe failure (`triggerScopedExternalSync is not exported`):

   ```
   pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/roadmap-scoped-sync.test.ts
   ```

3. In `packages/cli/src/mcp/tools/roadmap-auto-sync.ts`, add `import type { TrackerSyncConfig } from '@harness-engineering/types';` and `import type { TrackerSyncAdapter } from '@harness-engineering/core';` at the top, then append at the end of the file:

   ```ts
   /**
    * Outcome of linking a single roadmap row to its tracker ticket.
    * `not-configured` is the silent, expected case for projects with no tracker.
    */
   export type RowLinkOutcome =
     | { kind: 'not-configured' }
     | { kind: 'no-token' }
     | { kind: 'linked'; externalId: string }
     | { kind: 'failed'; reason: string };

   /**
    * Push ONE roadmap row to the tracker and report the outcome.
    *
    * Unlike `triggerExternalSync` (fire-and-forget, swallows everything), this
    * reports: a caller that just added a row must be able to tell whether the row
    * is actually linked. Never throws.
    *
    * `deps.makeAdapter` is an injection seam, not decoration: `triggerExternalSync`
    * builds its adapter internally, which is why no test can drive that path
    * against a fake tracker. Production callers omit `deps`.
    */
   export async function triggerScopedExternalSync(
     projectPath: string,
     featureName: string,
     deps?: { makeAdapter?: (token: string, config: TrackerSyncConfig) => TrackerSyncAdapter }
   ): Promise<RowLinkOutcome> {
     try {
       const trackerConfig = loadTrackerSyncConfig(projectPath);
       if (!trackerConfig) return { kind: 'not-configured' };

       const projectEnvPath = path.join(projectPath, '.env');
       if (fs.existsSync(projectEnvPath) && !process.env.GITHUB_TOKEN) {
         const { config: loadDotenv } = await import('dotenv');
         loadDotenv({ path: projectEnvPath });
       }

       const token = process.env.GITHUB_TOKEN;
       if (!token) {
         console.warn('[roadmap-sync] GITHUB_TOKEN not found — row link skipped');
         return { kind: 'no-token' };
       }

       const { syncRowToExternal, GitHubIssuesSyncAdapter } =
         await import('@harness-engineering/core');
       const adapter = deps?.makeAdapter
         ? deps.makeAdapter(token, trackerConfig)
         : new GitHubIssuesSyncAdapter({ token, config: trackerConfig });

       const result = await syncRowToExternal(projectPath, adapter, trackerConfig, featureName);

       // This is `feature.externalId` after the push, expressed through the
       // returned SyncResult: on the create path the id lands in `created`
       // (resolveExternalId returns false, so no update is issued); on the dedup
       // and already-linked paths it lands in `updated`. No other case exists.
       const externalId = result.created[0]?.externalId ?? result.updated[0] ?? null;

       if (result.errors.length > 0) {
         const reasons = result.errors.map((e) => e.error.message).join('; ');
         // Create-succeeded-but-writeback-failed is an explicit case, not an
         // accident: name the orphaned id so an operator can repair by hand. A
         // retry of the same add is self-healing (the dedup index now matches).
         const orphan = externalId
           ? ` (ticket ${externalId} exists but the row was not linked to it)`
           : '';
         return { kind: 'failed', reason: `${reasons}${orphan}` };
       }
       if (!externalId) {
         return { kind: 'failed', reason: 'tracker returned no external id for the row' };
       }
       return { kind: 'linked', externalId };
     } catch (error) {
       return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
     }
   }
   ```

4. Run — observe pass.
5. `pnpm --filter @harness-engineering/cli typecheck` and `/opt/homebrew/bin/harness check-deps`
6. Commit: `feat(roadmap): add triggerScopedExternalSync with an adapter injection seam`

---

### Task 12: `handleAdd` performs the push and annotates the response (D5)

**Depends on:** Task 10, Task 11 | **Files:** `packages/cli/src/mcp/tools/roadmap.ts`, `packages/cli/tests/mcp/tools/roadmap-scoped-sync.test.ts` | **Covers:** SC9

**Ownership sits in `handleAdd`, not the dispatcher.** The dispatcher runs after `dispatchAction` returns, so a push there would mutate a freshly-loaded copy while the already-serialized response still showed `externalId: null` — defeating the observability this decision exists for.

1. Append to `packages/cli/tests/mcp/tools/roadmap-scoped-sync.test.ts` (add the imports `import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';` and `import * as autoSync from '../../../src/mcp/tools/roadmap-auto-sync';`, plus a monolith roadmap fixture written to `docs/roadmap.md` in `beforeEach`):

   ```ts
   const ROADMAP_MD = `---
   project: test-project
   version: 1
   last_synced: 2026-01-01T00:00:00Z
   last_manual_edit: 2026-01-01T00:00:00Z
   ---
   
   # Project Roadmap
   
   ## Milestone: MVP Release
   
   ### Feature: Existing Row
   - **Status:** planned
   - **Spec:** —
   - **Plans:** —
   - **Blocked by:** —
   - **Summary:** Pre-existing
   `;

   describe('manage_roadmap add — response annotation', () => {
     beforeEach(() => {
       fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), ROADMAP_MD, 'utf-8');
     });

     it('reports a link failure WITHOUT marking the response isError', async () => {
       vi.spyOn(autoSync, 'triggerScopedExternalSync').mockResolvedValue({
         kind: 'failed',
         reason: 'tracker 503',
       });

       const res = await handleManageRoadmap({
         path: dir,
         action: 'add',
         feature: 'Billing',
         milestone: 'MVP Release',
         status: 'planned',
         summary: 'Billing system',
       });

       // The row WAS written and is locally valid; only the tracker link is
       // missing. Marking this isError would invite a retry that mints a
       // duplicate issue — the exact failure this fix exists to prevent.
       expect(res.isError).toBeFalsy();
       const body = JSON.parse(res.content[0].text);
       expect(body.link).toEqual({ kind: 'failed', reason: 'tracker 503' });
       expect(body.message).toContain('tracker 503');
       expect(fs.readFileSync(path.join(dir, 'docs', 'roadmap.md'), 'utf-8')).toContain('Billing');
     });

     it('reports a missing token loudly but not fatally', async () => {
       vi.spyOn(autoSync, 'triggerScopedExternalSync').mockResolvedValue({ kind: 'no-token' });

       const res = await handleManageRoadmap({
         path: dir,
         action: 'add',
         feature: 'Billing',
         milestone: 'MVP Release',
         status: 'planned',
         summary: 'Billing system',
       });

       expect(res.isError).toBeFalsy();
       expect(JSON.parse(res.content[0].text).message).toContain('GITHUB_TOKEN');
     });

     it('annotates the response body with the External-ID before serializing it', async () => {
       vi.spyOn(autoSync, 'triggerScopedExternalSync').mockResolvedValue({
         kind: 'linked',
         externalId: 'github:owner/repo#42',
       });

       const res = await handleManageRoadmap({
         path: dir,
         action: 'add',
         feature: 'Billing',
         milestone: 'MVP Release',
         status: 'planned',
         summary: 'Billing system',
       });

       const body = JSON.parse(res.content[0].text);
       const added = body.milestones
         .flatMap((m: { features: { name: string; externalId: string | null }[] }) => m.features)
         .find((f: { name: string }) => f.name === 'Billing');
       expect(added.externalId).toBe('github:owner/repo#42');
       // Envelope convention: the roadmap shape is spread, so every consumer
       // reading .milestones / .assignmentHistory is unaffected.
       expect(body.milestones).toBeDefined();
       expect(body.link).toEqual({ kind: 'linked', externalId: 'github:owner/repo#42' });
     });

     it('stays silent when no tracker is configured', async () => {
       const res = await handleManageRoadmap({
         path: dir,
         action: 'add',
         feature: 'Billing',
         milestone: 'MVP Release',
         status: 'planned',
         summary: 'Billing system',
       });

       expect(res.isError).toBeFalsy();
       const body = JSON.parse(res.content[0].text);
       expect(body.link).toEqual({ kind: 'not-configured' });
       expect(body.message).toBeUndefined();
     });
   });
   ```

2. Run — observe failure:

   ```
   pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/roadmap-scoped-sync.test.ts
   ```

3. In `packages/cli/src/mcp/tools/roadmap.ts`, extend the import on line 17:

   ```ts
   import {
     triggerExternalSync,
     triggerScopedExternalSync,
     type RowLinkOutcome,
   } from './roadmap-auto-sync.js';
   ```

4. Add above `async function handleAdd(`:

   ```ts
   /**
    * Response envelope for `add`. Follows the `claimRefusedResponse` convention:
    * the roadmap shape is spread and sibling keys are added, so every consumer
    * reading `.milestones` / `.assignmentHistory` is unaffected.
    *
    * `no-token` and `failed` are surfaced in the response text but the response
    * is NOT marked isError. The row WAS written and is locally valid; only the
    * tracker link is missing. Marking it an error would tell callers the add
    * failed, inviting a retry that mints a duplicate issue. Loud-but-not-fatal
    * is the correct severity.
    */
   function addResponse(roadmap: Roadmap, link: RowLinkOutcome): McpResponse {
     const body: Record<string, unknown> = { ...roadmap, link };
     if (link.kind === 'no-token') {
       body.message =
         'Row added, but the tracker link was skipped: GITHUB_TOKEN not found. ' +
         'The row has no External-ID and will not be reconciled by merge-triggered auto-done.';
     } else if (link.kind === 'failed') {
       body.message =
         `Row added, but the tracker link failed: ${link.reason}. ` +
         'The row has no External-ID; re-running add is safe (title dedup prevents a duplicate issue).';
     }
     return {
       content: [{ type: 'text' as const, text: JSON.stringify(body) }],
       isError: false,
     };
   }
   ```

5. In `handleAdd`, delete the line `const { Ok } = deps;`, rename the parameter `deps: RoadmapDeps` to `_deps: RoadmapDeps` (eslint's `argsIgnorePattern: '^_'` covers it), and replace the final two lines:

   ```ts
   const persisted = await persistRoadmap(projectPath, before, roadmap);
   if (!persisted.ok) return resultToMcpResponse(persisted);

   // Row-scoped tracker push. Ownership sits HERE, not in the dispatcher: the
   // response must be annotated BEFORE it is serialized, or every consumer
   // sees `externalId: null` on a row that is in fact linked on disk.
   const link = await triggerScopedExternalSync(projectPath, input.feature!);
   if (link.kind === 'linked') {
     // The push mutated its own loaded copy; mirror the stamp onto the object
     // this response serializes so the response matches disk.
     const added = milestone.features.find(
       (f) => f.name.toLowerCase() === input.feature!.toLowerCase()
     );
     if (added) added.externalId = link.externalId;
   }
   return addResponse(roadmap, link);
   ```

6. Run the new file, then the two existing roadmap suites to catch envelope fallout:

   ```
   pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/roadmap-scoped-sync.test.ts tests/mcp/tools/roadmap.test.ts tests/mcp/tools/roadmap.sharded.test.ts
   ```

7. `pnpm --filter @harness-engineering/cli typecheck` and `/opt/homebrew/bin/harness check-deps`
8. Commit: `feat(roadmap): link the added row to its tracking issue and report the outcome`

---

### Task 13: End-to-end — the scoped path links the new row and touches nothing else

**Depends on:** Task 12 | **Files:** `packages/cli/tests/mcp/tools/roadmap-scoped-sync.test.ts` | **Covers:** SC2, SC6

`handleAdd` calls `triggerScopedExternalSync(projectPath, name)` with no `deps`, so the stub adapter cannot be injected through that call. The test therefore performs the `add` with the scoped push spied to a no-op, then drives the **real** `triggerScopedExternalSync` against the stub. That still exercises the real scoped path end to end — which is the claim SC2 and SC6 make.

1. Append to `packages/cli/tests/mcp/tools/roadmap-scoped-sync.test.ts`:

   ```ts
   describe('scoped push end to end (sharded project, stub tracker)', () => {
     // Sharded fixture: the target row plus two unrelated rows whose tickets
     // carry exactly the two inbound hazards D3 guards against.
     function writeShardedProject(): void {
       const shardDir = path.join(dir, 'docs', 'roadmap.d');
       fs.mkdirSync(shardDir, { recursive: true });
       fs.writeFileSync(
         path.join(shardDir, '_meta.md'),
         `---\nproject: test-project\nversion: 1\nlast_synced: 2026-01-01T00:00:00Z\nlast_manual_edit: 2026-01-01T00:00:00Z\n---\n\n## Milestone: MVP Release\n`,
         'utf-8'
       );
       fs.writeFileSync(
         path.join(shardDir, 'owned-row.md'),
         `## Milestone: MVP Release\n\n### Feature: Owned Row\n- **Status:** in-progress\n- **Spec:** —\n- **Plans:** —\n- **Blocked by:** —\n- **Summary:** Assigned locally\n- **Assignee:** @alice\n- **Priority:** —\n- **External-ID:** github:owner/repo#7\n`,
         'utf-8'
       );
       fs.writeFileSync(
         path.join(shardDir, 'idea-row.md'),
         `## Milestone: MVP Release\n\n### Feature: Idea Row\n- **Status:** backlog\n- **Spec:** —\n- **Plans:** —\n- **Blocked by:** —\n- **Summary:** Just an idea\n- **Assignee:** —\n- **Priority:** —\n- **External-ID:** github:owner/repo#8\n`,
         'utf-8'
       );
     }

     function snapshotShards(): Map<string, string> {
       const shardDir = path.join(dir, 'docs', 'roadmap.d');
       const snap = new Map<string, string>();
       for (const name of fs.readdirSync(shardDir)) {
         const full = path.join(shardDir, name);
         if (fs.statSync(full).isFile()) snap.set(name, fs.readFileSync(full, 'utf-8'));
       }
       return snap;
     }

     /** Stub tracker carrying both inbound hazards. Only the target row is unlinked. */
     function stubAdapter() {
       return {
         createTicket: vi.fn(async () => ({
           ok: true,
           value: { externalId: 'github:owner/repo#99', url: 'https://x/99' },
         })),
         updateTicket: vi.fn(async (id: string) => ({
           ok: true,
           value: { externalId: id, url: 'https://x' },
         })),
         fetchTicketState: vi.fn(async () => ({ ok: false, error: new Error('unused') })),
         fetchAllTickets: vi.fn(async () => ({
           ok: true,
           value: [
             // (i) unrelated assigned row, tracker reports nobody
             {
               externalId: 'github:owner/repo#7',
               title: 'Owned Row',
               status: 'open',
               labels: ['harness-managed'],
               assignee: null,
             },
             // (ii) unrelated backlog row, bare OPEN with no status label
             {
               externalId: 'github:owner/repo#8',
               title: 'Idea Row',
               status: 'open',
               labels: ['harness-managed'],
               assignee: null,
             },
           ],
         })),
         assignTicket: vi.fn(async () => ({ ok: true, value: undefined })),
         addComment: vi.fn(async () => ({ ok: true, value: undefined })),
         fetchComments: vi.fn(async () => ({ ok: true, value: [] })),
       };
     }

     beforeEach(() => {
       writeShardedProject();
       fs.writeFileSync(
         path.join(dir, 'harness.config.json'),
         JSON.stringify(TRACKER_CONFIG),
         'utf-8'
       );
       vi.stubEnv('GITHUB_TOKEN', 'stub-token');
     });

     it('links the added row and leaves every unrelated shard byte-identical', async () => {
       const linkSpy = vi
         .spyOn(autoSync, 'triggerScopedExternalSync')
         .mockResolvedValue({ kind: 'not-configured' });

       await handleManageRoadmap({
         path: dir,
         action: 'add',
         feature: 'Billing',
         milestone: 'MVP Release',
         status: 'planned',
         summary: 'Billing system',
       });
       linkSpy.mockRestore();

       const before = snapshotShards();
       const adapter = stubAdapter();

       const outcome = await triggerScopedExternalSync(dir, 'Billing', {
         makeAdapter: () => adapter as never,
       });

       expect(outcome).toEqual({ kind: 'linked', externalId: 'github:owner/repo#99' });

       const after = snapshotShards();
       // SC2: neither unrelated row was rewritten, in either direction.
       expect(after.get('owned-row.md')).toBe(before.get('owned-row.md'));
       expect(after.get('idea-row.md')).toBe(before.get('idea-row.md'));
       expect(after.get('owned-row.md')).toContain('- **Assignee:** @alice');
       expect(after.get('idea-row.md')).toContain('- **Status:** backlog');

       // SC6: the new row carries its External-ID, and stamping externalId flips
       // hasExtended so the whole extended triple is emitted — no serializer change.
       const billing = after.get('billing.md')!;
       expect(billing).toContain('- **Assignee:** —');
       expect(billing).toContain('- **Priority:** —');
       expect(billing).toContain('- **External-ID:** github:owner/repo#99');

       // No write ever named another row's ticket.
       for (const call of adapter.updateTicket.mock.calls) {
         expect(call[0]).toBe('github:owner/repo#99');
       }
       expect(adapter.createTicket).toHaveBeenCalledOnce();
     });
   });
   ```

2. Run — observe pass:

   ```
   pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/roadmap-scoped-sync.test.ts
   ```

   If the shard filename differs from `billing.md`, read the actual name from `snapshotShards()` keys rather than guessing — `slugifyFeatureName` owns that mapping.

3. `/opt/homebrew/bin/harness check-deps`
4. Commit: `test(roadmap): prove the scoped push links the new row and rewrites no other`

---

### Task 14: Changeset

**Depends on:** Task 13 | **Files:** `.changeset/roadmap-add-scoped-tracker-link.md` | **Category:** integration

Internal issue numbers stay in the changeset and PR body only — never in the MCP tool description or any shipped skill body.

1. Create `.changeset/roadmap-add-scoped-tracker-link.md`:

   ```markdown
   ---
   '@harness-engineering/types': patch
   '@harness-engineering/core': patch
   '@harness-engineering/cli': patch
   ---

   Scope `manage_roadmap add` to the row it adds, and link that row to its own
   tracking issue.

   Adding one roadmap row used to trigger a whole-repository bidirectional
   reconcile against the tracker, so a local one-row write rewrote _other_ rows
   with tracker state — and the new row itself was serialized without the
   `Assignee` / `Priority` / `External-ID` triple, so nothing joined it to the
   issue that had just been created for it. The two faults were opposite ends of
   the same seam: added rows only looked healthy because the full sync
   subsequently stamped `externalId` onto them, so excluding `add` from external
   sync outright would have made the second fault fire on every add.

   `add` now performs a row-scoped push instead. New core export
   `syncRowToExternal(projectRoot, adapter, config, featureName, options?)`:
   push-only, single row, dedup-aware, and fail-closed — if `fetchAllTickets`
   fails it performs no create, because degrading to an empty dedup index would
   mint exactly the duplicate issue this fix prevents. It runs no inbound pull
   and does not stamp `last_synced`: a one-row push is not a reconcile.

   Inbound sync is hardened independently, because `sync --apply` and state
   transitions still run the full reconcile:

   - An absent tracker assignee no longer clears a local one. An unassigned issue
     is the default state of every issue, not an authoritative empty value.
   - Consequently, any inbound move of an _assigned_ row away from `in-progress`
     now routes through `setStatus`, so the assignee is released through the
     lifecycle authority and `assignee ≠ null ⟺ in-progress` still holds.
   - A merely-`OPEN` issue no longer overwrites a local `backlog` status. The
     guard is gated on the absence of a disambiguating status label rather than
     on the resolved status, because a direct `open → planned` mapping resolves a
     bare issue and an explicitly `planned`-labelled one identically. An explicit
     `planned` label still promotes.
   - Both suppressions are reported in the new `SyncResult.suppressedInbound`
     rather than silently dropped.

   The `add` response gains a `link` key describing the outcome. A missing token
   or a failed link is reported in the response text but does **not** mark the
   response as an error: the row was written and is locally valid, and flagging a
   failure would invite a retry that mints a duplicate issue.

   The roadmap serializer is unchanged. Stamping `externalId` alone flips the
   extended-field predicate, so all three lines appear because the fields are
   real — not because the serializer pads them.
   ```

2. Verify:

   ```
   pnpm run check:changesets
   ```

3. Commit: `docs(changeset): scoped tracker linking for manage_roadmap add`

---

### Task 15: Full verification sweep

**Depends on:** Task 14 | **Files:** none | **Category:** integration | **Covers:** SC10

`[checkpoint:human-verify]` — present the results of steps 5 and 6 before opening a PR.

1. Confirm `node -v` prints `v22.x`.
2. Rebuild everything so no stale `dist` masks a break:

   ```
   pnpm run build
   ```

3. Static gates:

   ```
   pnpm run typecheck
   pnpm run lint
   pnpm run format:check
   pnpm run generate:barrels:check
   ```

   If `format:check` fails, run `pnpm run format`, re-add, and amend.

4. **SC10 — existing tests untouched and passing.** Confirm the serializer suite was not modified, then run it:

   ```
   git diff --stat origin/main -- packages/core/tests/roadmap/serialize-extended.test.ts
   pnpm --filter @harness-engineering/core exec vitest run tests/roadmap/serialize-extended.test.ts
   ```

   The `git diff --stat` must print nothing. If it prints anything, D4 was violated — stop and revert the serializer change.

5. Full suite:

   ```
   pnpm run test
   ```

6. **`harness validate` baseline comparison.** This repo's validate is not clean; the gate is "no new issues", not "zero issues":

   ```
   /opt/homebrew/bin/harness validate 2>&1 | grep -oE '\([0-9]+ issues\)'
   ```

   Must print `(409 issues)` or fewer. Any increase means this change introduced a health finding — most likely an RMH005 violation, which is exactly what D3(b) exists to prevent. If the count rose, diff the issue list against the pre-change baseline before proceeding.

7. Docs build (VitePress is stricter than the tests about inline code and bare angle brackets):

   ```
   pnpm run docs:build
   ```

8. `[checkpoint:human-verify]` Report: the build/lint/typecheck/format results, the full-suite result, the SC10 `git diff --stat` output (must be empty), and the validate issue count against the 409 baseline. Wait for confirmation before opening a PR.

---

## Uncertainties

- **[RESOLVED — was BLOCKING]** D5 specifies the `linked` outcome is "derived from `feature.externalId` after the push", but D2 fixes `syncRowToExternal`'s return type as `SyncResult`, which does not expose the feature object. Resolution in Task 11: `result.created[0]?.externalId ?? result.updated[0]` is provably identical to `feature.externalId` in all three reachable cases (create → `created`; dedup link → `updated`; already-linked → `updated`). Mechanism differs from D5's literal wording; outcome does not. Flagged for reviewer confirmation.
- **[ASSUMPTION]** `handleAdd` mirrors the `externalId` onto its own in-memory feature object after a `linked` outcome (Task 12 step 5). `syncRowToExternal` loads its own store copy, so without this mirror the response body would show `externalId: null` on a row that is linked on disk — defeating the observability D5 exists for. The alternative (reloading the roadmap in `handleAdd`) costs a second full load for the same result. If the reviewer prefers the reload, only Task 12 step 5 changes.
- **[ASSUMPTION]** SC2 and SC6 are proven by driving the **real** `triggerScopedExternalSync` against a stub adapter on a row that a real `add` created, rather than by injecting the stub through `handleAdd` (which takes no `deps`). This is what the seam makes possible and matches the spec's own framing ("SC2 and SC6 additionally require the `deps.makeAdapter` seam"). If a reviewer wants the stub reachable through `handleAdd` itself, `handleAdd` would need its own optional `deps` passthrough — a signature change the spec does not authorize.
- **[ASSUMPTION]** `packages/types` must be rebuilt in Task 1 for `packages/core` to see `SyncResult.suppressedInbound`. Verified: no vitest alias and no tsconfig `paths` in either package, so resolution is through `node_modules` → `packages/types/dist`. The spec's Implementation Order names only the core→cli hop; this is the same mechanism one level up.
- **[DEFERRABLE]** Exact `reason` strings on `SuppressedInbound` (`tracker-reports-no-assignee`, `tracker-open-without-status-label`). They are asserted in tests, so changing them means changing both — but nothing external consumes them yet.
- **[DEFERRABLE]** The shard filename in Task 13 (`billing.md`) is `slugifyFeatureName`'s output and is asserted directly. If the slug rule differs, read the key from the snapshot instead.
- **[NOTED, out of scope per spec]** `handleAdd`'s `persistRoadmap` write happens outside the scoped push's mutex, so a concurrent `fullSync` can still slip between the row write and the push. Closing that window means holding the lock across the whole `add`. The spec explicitly scopes this out; what removes the symptom is that the `externalId` stamp is now in-process and deterministic, not the mutex.

## Parallelization

Tasks 2, 3 and 4 all edit `applyTicketToFeature` in the same file and are strictly sequential. Tasks 5-7 build one function body and are strictly sequential. Task 10 and Task 11 touch different files and have no shared state — they are the only genuine parallel pair, and both depend on Task 9. Everything else is a chain.

## Rollback

Every task is one commit. The riskiest single change is Task 3 (the widened `setStatus` routing), because it alters behaviour for rows the spec's guards do not otherwise touch — reverting Task 3 alone would, however, leave Task 2 in an RMH005-violating state, so Tasks 2 and 3 must be reverted together or not at all.
