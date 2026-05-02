# Plan: Roadmap Page Assembly (Phase 3) -- Verification Only

**Date:** 2026-04-28 | **Spec:** docs/changes/roadmap-page-enhancement/proposal.md | **Tasks:** 3 | **Time:** ~10 min | **Integration Tier:** medium

## Goal

Verify that Phase 3 (Page Assembly) of the Roadmap Page Enhancement is complete -- confirming that `Roadmap.tsx` no longer uses `GanttChart`, wires in all Phase 2 components, provides the "workable only" filter, and connects the claim-to-chat-thread flow.

## Context: Phase 3 Already Implemented

During Phase 1 (Data Layer) execution, the implementer also completed ALL of Phase 3's scope. The current `Roadmap.tsx` already:

- Imports and renders `StatsBar`, `FeatureTable`, `ClaimConfirmation`, `AssignmentHistory` (lines 8-11, 226-293)
- Has `FilterBar` with milestone dropdown, status dropdown, and "Workable only" checkbox toggle (lines 21-76)
- Fetches identity via `GET /api/identity` on mount (lines 196-204)
- Manages claim state: `handleClaim` opens the `ClaimConfirmation` popover, `handleClaimConfirm` POSTs the claim, creates a chat thread with the routed command, and navigates to it (lines 206-221, 262-269)
- Does NOT import or use `GanttChart` (confirmed via grep -- zero imports)

The data layer is also complete:

- `DashboardFeature` in `shared/types.ts` has `spec` and `plans` fields (lines 55-58)
- `gatherRoadmap()` passes through spec/plans from parsed roadmap (lines 78-83)
- `assignmentHistory` flows through: gathered, typed as `DashboardAssignmentRecord[]`, and rendered (confirmed across all files)
- `ClaimRequest`, `ClaimResponse`, `IdentityResponse` types all defined (lines 94-116)

The dead `GanttChart.tsx` file still exists on disk but is unreferenced. Cleanup is deferred to Phase 4 (Polish).

**No code changes are required for Phase 3.** This plan contains verification-only tasks.

## Observable Truths (Acceptance Criteria)

1. **GanttChart removed from page:** `Roadmap.tsx` has zero imports of `GanttChart`. The `GanttChart.tsx` file is not imported by any source file.
2. **StatsBar renders:** `StatsBar` component is imported and rendered with `data` prop from `RoadmapData`.
3. **FeatureTable renders with filters:** `FeatureTable` receives filtered features, milestones, and filter state including `workableOnly` boolean.
4. **FilterBar includes workable-only toggle:** A checkbox labeled "Workable only" is present alongside milestone and status dropdowns.
5. **ClaimConfirmation popover renders on claim:** When `claimTarget` is set and `identity` is non-null, `ClaimConfirmation` renders as an absolute-positioned popover.
6. **Claim flow connects to chat thread:** `handleClaimConfirm` maps `ClaimResponse.workflow` to a harness command, calls `createThread('chat', ...)`, and navigates to the thread.
7. **AssignmentHistory renders:** `AssignmentHistory` component renders when `data.assignmentHistory.length > 0`.
8. **Identity fetched on mount:** `useEffect` calls `GET /api/identity` and stores the username for claim operations.
9. **All 252 dashboard tests pass** with zero regressions.

## File Map

No files to create or modify. Verification only.

```
VERIFY packages/dashboard/src/client/pages/Roadmap.tsx
VERIFY packages/dashboard/src/shared/types.ts
VERIFY packages/dashboard/src/server/gather/roadmap.ts
VERIFY packages/dashboard/src/client/components/roadmap/StatsBar.tsx
VERIFY packages/dashboard/src/client/components/roadmap/FeatureTable.tsx
VERIFY packages/dashboard/src/client/components/roadmap/FeatureRow.tsx
VERIFY packages/dashboard/src/client/components/roadmap/ClaimConfirmation.tsx
VERIFY packages/dashboard/src/client/components/roadmap/AssignmentHistory.tsx
```

## Uncertainties

- [DEFERRABLE] `GanttChart.tsx` still exists as a dead file and is mentioned in `README.md`. This is cleanup work appropriate for Phase 4 (Polish & Edge Cases).

## Tasks

### Task 1: Verify GanttChart removal and component wiring in Roadmap.tsx

**Depends on:** none | **Files:** packages/dashboard/src/client/pages/Roadmap.tsx

1. Confirm `GanttChart` is not imported:

   ```bash
   grep -r "GanttChart" packages/dashboard/src/client/pages/
   ```

   Expected: no matches.

2. Confirm all Phase 2 components are imported:

   ```bash
   grep -E "import.*StatsBar|import.*FeatureTable|import.*ClaimConfirmation|import.*AssignmentHistory" packages/dashboard/src/client/pages/Roadmap.tsx
   ```

   Expected: 4 matching import lines.

3. Confirm FilterBar has workable-only toggle:

   ```bash
   grep "workableOnly" packages/dashboard/src/client/pages/Roadmap.tsx
   ```

   Expected: multiple matches (state declaration, prop passing, checkbox binding).

4. Confirm claim flow creates chat thread and navigates:

   ```bash
   grep "createThread\|navigate.*thread" packages/dashboard/src/client/pages/Roadmap.tsx
   ```

   Expected: matches in both `RoadmapActionButton` and `handleClaimConfirm`.

5. Confirm identity fetch on mount:
   ```bash
   grep "/api/identity" packages/dashboard/src/client/pages/Roadmap.tsx
   ```
   Expected: 1 match in the useEffect.

**Outcome:** All Phase 3 integration points confirmed present in `Roadmap.tsx`.

### Task 2: Verify data layer completeness for Phase 3

**Depends on:** none | **Files:** packages/dashboard/src/shared/types.ts, packages/dashboard/src/server/gather/roadmap.ts

1. Confirm `DashboardFeature` has `spec` and `plans` fields:

   ```bash
   grep -A2 "spec:" packages/dashboard/src/shared/types.ts
   ```

   Expected: `spec: string | null` and `plans: string[]` fields present.

2. Confirm `gatherRoadmap()` passes through spec and plans:

   ```bash
   grep "spec\|plans" packages/dashboard/src/server/gather/roadmap.ts
   ```

   Expected: matches in the `projectFeatures` function mapping spec/plans from parsed features.

3. Confirm `assignmentHistory` is gathered and typed:

   ```bash
   grep "assignmentHistory" packages/dashboard/src/server/gather/roadmap.ts
   ```

   Expected: matches showing assignment history mapped from `roadmap.assignmentHistory`.

4. Confirm claim and identity types exist:
   ```bash
   grep -E "ClaimRequest|ClaimResponse|IdentityResponse" packages/dashboard/src/shared/types.ts
   ```
   Expected: all three interfaces present.

**Outcome:** Data layer fully supports Phase 3 page assembly requirements.

### Task 3: Run full test suite to confirm zero regressions

**Depends on:** none | **Files:** (all test files)

1. Run the complete dashboard test suite:

   ```bash
   cd packages/dashboard && npx vitest run --reporter=verbose
   ```

   Expected: 252 tests pass, 46 test files pass, zero failures.

2. Run typecheck:
   ```bash
   cd packages/dashboard && npx tsc --noEmit
   ```
   Expected: clean typecheck with zero errors.

**Outcome:** All existing tests and types remain healthy after Phase 3 verification.

## Summary

Phase 3 (Page Assembly) was completed during Phase 1 execution. All spec requirements for Phase 3 are satisfied:

| Spec Requirement                     | Status | Evidence                                                                                                           |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------ |
| Remove `GanttChart` import and usage | Done   | Zero imports in any source file; dead file remains for Phase 4 cleanup                                             |
| Wire in `StatsBar`                   | Done   | Imported line 8, rendered line 227                                                                                 |
| Wire in `FeatureTable`               | Done   | Imported line 9, rendered lines 253-261                                                                            |
| Wire in `AssignmentHistory`          | Done   | Imported line 11, rendered lines 286-293                                                                           |
| "Workable only" filter toggle        | Done   | FilterBar lines 65-73, state lines 188, passed to FeatureTable line 259                                            |
| Connect claim flow                   | Done   | handleClaim line 206, ClaimConfirmation lines 262-269, handleClaimConfirm creates thread + navigates lines 210-221 |

The three tasks above are verification-only -- no code changes needed. After verification, Phase 3 can be marked complete, and the project can proceed to Phase 4 (Polish & Edge Cases).
