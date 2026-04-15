# Plan: Analysis Tracker Sync -- Phase 1 Type Foundations

**Date:** 2026-04-15 | **Spec:** docs/changes/analysis-tracker-sync/proposal.md | **Tasks:** 4 | **Time:** ~15 min

## Goal

Add the type-level foundations for bidirectional analysis sync: `externalId` field on `AnalysisRecord`, `TrackerComment` type, and `fetchComments` method on `TrackerSyncAdapter` interface, with a compilation-safe stub on `GitHubIssuesSyncAdapter`.

## Observable Truths (Acceptance Criteria)

1. `AnalysisRecord` in `packages/orchestrator/src/core/analysis-archive.ts` includes field `externalId: string | null`
2. `TrackerComment` interface (`id: string`, `body: string`, `createdAt: string`, `author: string`) exists in `packages/types/src/tracker-sync.ts` and is re-exported from `packages/types/src/index.ts`
3. `TrackerSyncAdapter` in `packages/core/src/roadmap/tracker-sync.ts` includes `fetchComments(externalId: string): Promise<Result<TrackerComment[], Error>>`
4. `GitHubIssuesSyncAdapter` in `packages/core/src/roadmap/adapters/github-issues.ts` compiles with a stub `fetchComments` that returns `Err(new Error('fetchComments not implemented'))`
5. `npx vitest run` in `packages/core` passes (all existing tests green)
6. TypeScript type-check passes for `packages/types`, `packages/core`, and `packages/orchestrator` (`npx tsc --noEmit`)

## File Map

- MODIFY `packages/types/src/tracker-sync.ts` (add `TrackerComment` interface)
- MODIFY `packages/types/src/index.ts` (add `TrackerComment` to re-exports)
- MODIFY `packages/core/src/roadmap/tracker-sync.ts` (add `fetchComments` to `TrackerSyncAdapter`, import `TrackerComment`)
- MODIFY `packages/core/src/roadmap/adapters/github-issues.ts` (add stub `fetchComments`, import `TrackerComment`)
- MODIFY `packages/orchestrator/src/core/analysis-archive.ts` (add `externalId` to `AnalysisRecord`)
- MODIFY `packages/orchestrator/src/orchestrator.ts` (add `externalId: null` to existing record construction)

## Tasks

### Task 1: Add `TrackerComment` type to types package

**Depends on:** none | **Files:** `packages/types/src/tracker-sync.ts`, `packages/types/src/index.ts`

1. Open `packages/types/src/tracker-sync.ts`. After the closing brace of the `TrackerSyncConfig` interface (line 62), add:

   ```typescript
   /**
    * A comment on an external tracker ticket.
    * Used by fetchComments to return raw comment data for analysis sync.
    */
   export interface TrackerComment {
     /** Tracker-native comment ID */
     id: string;
     /** Raw markdown body of the comment */
     body: string;
     /** ISO timestamp when the comment was created */
     createdAt: string;
     /** Author who posted the comment */
     author: string;
   }
   ```

2. Open `packages/types/src/index.ts`. In the `// --- Tracker Sync ---` section (line 64-70), add `TrackerComment` to the type re-exports:

   Change:

   ```typescript
   export type {
     ExternalTicket,
     ExternalTicketState,
     SyncResult,
     TrackerSyncConfig,
   } from './tracker-sync';
   ```

   To:

   ```typescript
   export type {
     ExternalTicket,
     ExternalTicketState,
     SyncResult,
     TrackerSyncConfig,
     TrackerComment,
   } from './tracker-sync';
   ```

3. Verify: `cd packages/types && npx tsc --noEmit` -- should pass with no errors.
4. Commit: `feat(types): add TrackerComment interface for analysis sync`

### Task 2: Add `fetchComments` to `TrackerSyncAdapter` interface

**Depends on:** Task 1 | **Files:** `packages/core/src/roadmap/tracker-sync.ts`

1. Open `packages/core/src/roadmap/tracker-sync.ts`. Add `TrackerComment` to the import on line 1:

   Change:

   ```typescript
   import type {
     RoadmapFeature,
     Result,
     ExternalTicket,
     ExternalTicketState,
     TrackerSyncConfig,
   } from '@harness-engineering/types';
   ```

   To:

   ```typescript
   import type {
     RoadmapFeature,
     Result,
     ExternalTicket,
     ExternalTicketState,
     TrackerSyncConfig,
     TrackerComment,
   } from '@harness-engineering/types';
   ```

2. In the `TrackerSyncAdapter` interface, after the `addComment` method (line 37), add:

   ```typescript
     /** Fetch all comments on an external ticket */
     fetchComments(externalId: string): Promise<Result<TrackerComment[], Error>>;
   ```

3. Verify: `cd packages/core && npx tsc --noEmit` -- will FAIL because `GitHubIssuesSyncAdapter` does not implement `fetchComments` yet. This is expected; Task 3 fixes it.
4. Do NOT commit yet -- Task 3 must follow immediately to restore compilation.

### Task 3: Add stub `fetchComments` to `GitHubIssuesSyncAdapter`

**Depends on:** Task 2 | **Files:** `packages/core/src/roadmap/adapters/github-issues.ts`, `packages/core/tests/roadmap/github-issues.test.ts`

1. Open `packages/core/src/roadmap/adapters/github-issues.ts`. Add `TrackerComment` to the import on line 1:

   Change:

   ```typescript
   import type {
     RoadmapFeature,
     Result,
     ExternalTicket,
     ExternalTicketState,
     TrackerSyncConfig,
   } from '@harness-engineering/types';
   ```

   To:

   ```typescript
   import type {
     RoadmapFeature,
     Result,
     ExternalTicket,
     ExternalTicketState,
     TrackerSyncConfig,
     TrackerComment,
   } from '@harness-engineering/types';
   ```

2. After the `addComment` method (ends at line 496), add:

   ```typescript
     async fetchComments(_externalId: string): Promise<Result<TrackerComment[], Error>> {
       return Err(new Error('fetchComments not implemented — see Phase 2 of analysis-tracker-sync'));
     }
   ```

3. Write a test in `packages/core/tests/roadmap/github-issues.test.ts`. Add a new `describe` block at the end, before the final closing `});`:

   ```typescript
   describe('fetchComments', () => {
     it('returns Err with not-implemented message (Phase 1 stub)', async () => {
       const fetchFn = mockFetch(200, []);
       const adapter = new GitHubIssuesSyncAdapter({
         token: 'tok',
         config: DEFAULT_CONFIG,
         fetchFn,
       });

       const result = await adapter.fetchComments('github:owner/repo#42');
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.message).toMatch(/not implemented/i);
     });
   });
   ```

4. Run: `cd packages/core && npx vitest run tests/roadmap/github-issues.test.ts` -- should pass (all existing tests + new stub test).
5. Run: `cd packages/core && npx tsc --noEmit` -- should pass.
6. Commit: `feat(core): add fetchComments to TrackerSyncAdapter with GitHub stub`

   This commit includes both the interface change (Task 2) and the adapter stub (Task 3) to keep the tree compilable at every commit.

### Task 4: Add `externalId` to `AnalysisRecord`

**Depends on:** none (parallelizable with Tasks 1-3) | **Files:** `packages/orchestrator/src/core/analysis-archive.ts`, `packages/orchestrator/src/orchestrator.ts`

1. Open `packages/orchestrator/src/core/analysis-archive.ts`. In the `AnalysisRecord` interface (line 12-25), add `externalId` after `analyzedAt`:

   Change:

   ```typescript
   export interface AnalysisRecord {
     /** Issue ID this analysis belongs to */
     issueId: string;
     /** Issue identifier (human-readable) */
     identifier: string;
     /** Enriched spec from SEL, or null if skipped */
     spec: EnrichedSpec | null;
     /** Complexity score from CML, or null if skipped */
     score: ComplexityScore | null;
     /** PESL simulation result, or null if not run */
     simulation: SimulationResult | null;
     /** ISO timestamp when this analysis was recorded */
     analyzedAt: string;
   }
   ```

   To:

   ```typescript
   export interface AnalysisRecord {
     /** Issue ID this analysis belongs to */
     issueId: string;
     /** Issue identifier (human-readable) */
     identifier: string;
     /** Enriched spec from SEL, or null if skipped */
     spec: EnrichedSpec | null;
     /** Complexity score from CML, or null if skipped */
     score: ComplexityScore | null;
     /** PESL simulation result, or null if not run */
     simulation: SimulationResult | null;
     /** ISO timestamp when this analysis was recorded */
     analyzedAt: string;
     /** External tracker ID (e.g., "github:owner/repo#42"), populated at analysis time. Null if no tracker configured. */
     externalId: string | null;
   }
   ```

2. Fix the existing `AnalysisRecord` construction in `packages/orchestrator/src/orchestrator.ts` at line 342-349. Add `externalId: null` (Phase 2 will populate this from the issue's externalId):

   Change:

   ```typescript
   await this.analysisArchive.save({
     issueId: issue.id,
     identifier: issue.identifier,
     spec,
     score,
     simulation,
     analyzedAt: new Date().toISOString(),
   });
   ```

   To:

   ```typescript
   await this.analysisArchive.save({
     issueId: issue.id,
     identifier: issue.identifier,
     spec,
     score,
     simulation,
     analyzedAt: new Date().toISOString(),
     externalId: null, // TODO(analysis-tracker-sync): populate from issue.externalId in Phase 2
   });
   ```

3. Run: `cd packages/orchestrator && npx tsc --noEmit` -- should pass.
4. Run: `cd packages/orchestrator && npx vitest run` -- should pass.
5. Commit: `feat(orchestrator): add externalId field to AnalysisRecord`

## Parallel Opportunities

- Task 4 (`externalId` on `AnalysisRecord`) is fully independent of Tasks 1-3 and can be done in parallel.
- Tasks 1, 2, 3 must be sequential (type -> interface -> adapter).
- Tasks 2 and 3 are committed together to keep the tree compilable.

## Verification Checklist

After all tasks complete:

1. `cd packages/types && npx tsc --noEmit` passes
2. `cd packages/core && npx tsc --noEmit` passes
3. `cd packages/core && npx vitest run` passes (all existing + new stub test)
4. `cd packages/orchestrator && npx tsc --noEmit` passes
5. `cd packages/orchestrator && npx vitest run` passes
6. `TrackerComment` is importable from `@harness-engineering/types`
7. `fetchComments` appears on the `TrackerSyncAdapter` interface
8. `AnalysisRecord.externalId` is `string | null`
