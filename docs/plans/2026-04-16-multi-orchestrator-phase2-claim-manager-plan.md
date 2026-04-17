# Plan: Multi-Orchestrator Phase 2 -- ClaimManager

**Date:** 2026-04-16 | **Spec:** `docs/changes/multi-orchestrator-claim-coordination/proposal.md` | **Tasks:** 8 | **Time:** ~35 min

## Goal

Implement the `ClaimManager` class and wire it into the orchestrator so that every issue is claimed and verified on the external tracker before an agent is dispatched -- preventing duplicate dispatch across concurrent orchestrator instances.

## Observable Truths (Acceptance Criteria)

1. When `ClaimManager.claimAndVerify(issueId)` is called, the system shall call `tracker.claimIssue()`, wait `verifyDelayMs`, then call `tracker.fetchIssueStatesByIds()` and return `'claimed'` only if the assignee matches the orchestrator's identity.
2. When the assignee after verification does not match, `claimAndVerify()` shall return `'rejected'` without error.
3. When `ClaimManager.release(issueId)` is called, the system shall delegate to `tracker.releaseIssue(issueId)`.
4. When `ClaimManager.heartbeat(issueIds)` is called, the system shall call `tracker.claimIssue()` for each ID to refresh the claim timestamp.
5. The `Issue` type shall include an optional `assignee` field (`string | null`) and `RoadmapTrackerAdapter.mapFeatureToIssue()` shall populate it from `feature.assignee`.
6. The `SideEffect` union shall include `{ type: 'claim', issue: Issue, orchestratorId: string }`.
7. The `OrchestratorEvent` union shall include `{ type: 'claim_rejected', issueId: string }`.
8. When `handleTick()` selects a candidate for dispatch, the state machine shall emit a `claim` effect (not a `dispatch` effect directly). The orchestrator effect handler shall call `claimManager.claimAndVerify()` and, if claimed, proceed to dispatch; if rejected, emit a `claim_rejected` event that removes the issue from `claimed`.
9. `npx vitest run` in `packages/orchestrator` passes all existing tests plus new ClaimManager tests.
10. `harness validate` passes (modulo the pre-existing `needs-human` config issue).

## File Map

```
MODIFY packages/types/src/orchestrator.ts          (add assignee to Issue)
MODIFY packages/orchestrator/src/tracker/adapters/roadmap.ts (populate assignee in mapFeatureToIssue)
MODIFY packages/orchestrator/src/types/events.ts   (add ClaimEffect, ClaimRejectedEvent)
CREATE packages/orchestrator/src/core/claim-manager.ts
CREATE packages/orchestrator/tests/core/claim-manager.test.ts
MODIFY packages/orchestrator/src/core/state-machine.ts (emit claim effect instead of dispatch in handleTick)
MODIFY packages/orchestrator/tests/core/state-machine.test.ts (update for claim effect)
MODIFY packages/orchestrator/src/core/index.ts     (export ClaimManager)
MODIFY packages/orchestrator/src/orchestrator.ts   (construct ClaimManager, handle claim effect, handle claim_rejected event)
```

## Skeleton

1. Foundation: Issue.assignee + roadmap adapter (~2 tasks, ~6 min)
2. Event/effect types for claim coordination (~1 task, ~4 min)
3. ClaimManager class with TDD (~2 tasks, ~10 min)
4. State machine changes (~1 task, ~5 min)
5. Orchestrator wiring (~2 tasks, ~10 min)

**Estimated total:** 8 tasks, ~35 minutes

## Tasks

### Task 1: Add `assignee` field to the `Issue` type

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`

1. In `packages/types/src/orchestrator.ts`, add to the `Issue` interface after the `externalId` field:

   ```typescript
   /** Assignee identity (orchestrator ID, username, etc.), null if unassigned */
   assignee?: string | null;
   ```

2. Run: `npx vitest run --project orchestrator` from repo root to verify no regressions.
3. Run: `harness validate`
4. Commit: `feat(types): add optional assignee field to Issue interface`

---

### Task 2: Populate `assignee` in `RoadmapTrackerAdapter.mapFeatureToIssue`

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/tracker/adapters/roadmap.ts`

1. In `packages/orchestrator/src/tracker/adapters/roadmap.ts`, in the `mapFeatureToIssue` method, add after the `externalId` line:

   ```typescript
   assignee: feature.assignee ?? null,
   ```

   The full return object becomes:

   ```typescript
   return {
     id,
     identifier: id,
     title: feature.name,
     description: feature.summary,
     priority: null,
     state: feature.status,
     branchName: null,
     url: null,
     labels: [],
     spec: feature.spec,
     plans: feature.plans,
     blockedBy: feature.blockedBy.map((b: string) => ({
       id: this.generateId(b),
       identifier: b,
       state: null,
     })) as BlockerRef[],
     createdAt: null,
     updatedAt: null,
     externalId: feature.externalId ?? null,
     assignee: feature.assignee ?? null,
   };
   ```

2. Run: `npx vitest run packages/orchestrator/tests/tracker/roadmap.test.ts` to verify existing tests still pass.
3. Run: `harness validate`
4. Commit: `feat(orchestrator): populate assignee in roadmap adapter mapFeatureToIssue`

---

### Task 3: Add `ClaimEffect` and `ClaimRejectedEvent` to event types

**Depends on:** none | **Files:** `packages/orchestrator/src/types/events.ts`

1. In `packages/orchestrator/src/types/events.ts`, add `ClaimRejectedEvent` to the `OrchestratorEvent` union:

   ```typescript
   export type OrchestratorEvent =
     | TickEvent
     | WorkerExitEvent
     | AgentUpdateEvent
     | RetryFiredEvent
     | StallDetectedEvent
     | ClaimRejectedEvent;
   ```

2. Add the `ClaimRejectedEvent` interface:

   ```typescript
   export interface ClaimRejectedEvent {
     type: 'claim_rejected';
     issueId: string;
   }
   ```

3. Add `ClaimEffect` to the `SideEffect` union:

   ```typescript
   export type SideEffect =
     | DispatchEffect
     | StopEffect
     | ScheduleRetryEffect
     | ReleaseClaimEffect
     | CleanWorkspaceEffect
     | UpdateTokensEffect
     | EmitLogEffect
     | EscalateEffect
     | ClaimEffect;
   ```

4. Add the `ClaimEffect` interface:

   ```typescript
   export interface ClaimEffect {
     type: 'claim';
     issue: Issue;
     orchestratorId: string;
     /** Which backend to dispatch to after a successful claim */
     backend?: 'local' | 'primary';
     /** Retry attempt number, if this is a retry dispatch */
     attempt: number | null;
   }
   ```

   Note: `ClaimEffect` carries `backend` and `attempt` so the orchestrator can proceed to dispatch after verification without re-computing routing.

5. Run: `npx vitest run packages/orchestrator` to verify no type errors break existing tests.
6. Run: `harness validate`
7. Commit: `feat(orchestrator): add ClaimEffect and ClaimRejectedEvent types`

---

### Task 4: Write ClaimManager tests

**Depends on:** Task 1, Task 3 | **Files:** `packages/orchestrator/tests/core/claim-manager.test.ts`

1. Create `packages/orchestrator/tests/core/claim-manager.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { ClaimManager } from '../../src/core/claim-manager';
   import type { IssueTrackerClient, Issue } from '@harness-engineering/types';
   import { Ok, Err } from '@harness-engineering/types';

   function makeIssue(overrides: Partial<Issue> = {}): Issue {
     return {
       id: 'id-1',
       identifier: 'TEST-1',
       title: 'Test issue',
       description: null,
       priority: null,
       state: 'Todo',
       branchName: null,
       url: null,
       labels: [],
       blockedBy: [],
       spec: null,
       plans: [],
       createdAt: null,
       updatedAt: null,
       externalId: null,
       assignee: null,
       ...overrides,
     };
   }

   function mockTracker(): IssueTrackerClient {
     return {
       fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([])),
       fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
       fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
       markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
       claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
       releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
     };
   }

   describe('ClaimManager', () => {
     const orchestratorId = 'test-orch-abc123';
     let tracker: ReturnType<typeof mockTracker>;
     let manager: ClaimManager;

     beforeEach(() => {
       tracker = mockTracker();
       manager = new ClaimManager(tracker, orchestratorId, { verifyDelayMs: 0 });
     });

     describe('claimAndVerify', () => {
       it('returns claimed when assignee matches after verification', async () => {
         const issue = makeIssue({ assignee: orchestratorId, state: 'in-progress' });
         vi.mocked(tracker.fetchIssueStatesByIds).mockResolvedValue(Ok(new Map([['id-1', issue]])));

         const result = await manager.claimAndVerify('id-1');
         expect(result.ok).toBe(true);
         expect(result.ok && result.value).toBe('claimed');
         expect(tracker.claimIssue).toHaveBeenCalledWith('id-1', orchestratorId);
         expect(tracker.fetchIssueStatesByIds).toHaveBeenCalledWith(['id-1']);
       });

       it('returns rejected when assignee does not match', async () => {
         const issue = makeIssue({ assignee: 'other-orch', state: 'in-progress' });
         vi.mocked(tracker.fetchIssueStatesByIds).mockResolvedValue(Ok(new Map([['id-1', issue]])));

         const result = await manager.claimAndVerify('id-1');
         expect(result.ok).toBe(true);
         expect(result.ok && result.value).toBe('rejected');
       });

       it('returns rejected when issue not found after claim', async () => {
         vi.mocked(tracker.fetchIssueStatesByIds).mockResolvedValue(Ok(new Map()));

         const result = await manager.claimAndVerify('id-1');
         expect(result.ok).toBe(true);
         expect(result.ok && result.value).toBe('rejected');
       });

       it('returns error when claimIssue fails', async () => {
         vi.mocked(tracker.claimIssue).mockResolvedValue(Err(new Error('write failed')));

         const result = await manager.claimAndVerify('id-1');
         expect(result.ok).toBe(false);
       });

       it('returns error when fetchIssueStatesByIds fails', async () => {
         vi.mocked(tracker.fetchIssueStatesByIds).mockResolvedValue(Err(new Error('read failed')));

         const result = await manager.claimAndVerify('id-1');
         expect(result.ok).toBe(false);
       });

       it('returns rejected when assignee is null (claimed by nobody)', async () => {
         const issue = makeIssue({ assignee: null, state: 'in-progress' });
         vi.mocked(tracker.fetchIssueStatesByIds).mockResolvedValue(Ok(new Map([['id-1', issue]])));

         const result = await manager.claimAndVerify('id-1');
         expect(result.ok).toBe(true);
         expect(result.ok && result.value).toBe('rejected');
       });
     });

     describe('release', () => {
       it('delegates to tracker.releaseIssue', async () => {
         const result = await manager.release('id-1');
         expect(result.ok).toBe(true);
         expect(tracker.releaseIssue).toHaveBeenCalledWith('id-1');
       });

       it('propagates tracker errors', async () => {
         vi.mocked(tracker.releaseIssue).mockResolvedValue(Err(new Error('release failed')));
         const result = await manager.release('id-1');
         expect(result.ok).toBe(false);
       });
     });

     describe('heartbeat', () => {
       it('calls claimIssue for each running issue ID', async () => {
         await manager.heartbeat(['id-1', 'id-2', 'id-3']);
         expect(tracker.claimIssue).toHaveBeenCalledTimes(3);
         expect(tracker.claimIssue).toHaveBeenCalledWith('id-1', orchestratorId);
         expect(tracker.claimIssue).toHaveBeenCalledWith('id-2', orchestratorId);
         expect(tracker.claimIssue).toHaveBeenCalledWith('id-3', orchestratorId);
       });

       it('does not throw when individual claims fail', async () => {
         vi.mocked(tracker.claimIssue)
           .mockResolvedValueOnce(Ok(undefined))
           .mockResolvedValueOnce(Err(new Error('write failed')))
           .mockResolvedValueOnce(Ok(undefined));

         await expect(manager.heartbeat(['id-1', 'id-2', 'id-3'])).resolves.not.toThrow();
       });

       it('no-ops on empty array', async () => {
         await manager.heartbeat([]);
         expect(tracker.claimIssue).not.toHaveBeenCalled();
       });
     });

     describe('isStale', () => {
       it('returns false when updatedAt is within TTL', () => {
         const issue = makeIssue({
           updatedAt: new Date(Date.now() - 60_000).toISOString(),
         });
         expect(manager.isStale(issue, 600_000)).toBe(false);
       });

       it('returns true when updatedAt exceeds TTL', () => {
         const issue = makeIssue({
           updatedAt: new Date(Date.now() - 700_000).toISOString(),
         });
         expect(manager.isStale(issue, 600_000)).toBe(true);
       });

       it('returns true when updatedAt is null', () => {
         const issue = makeIssue({ updatedAt: null });
         expect(manager.isStale(issue, 600_000)).toBe(true);
       });
     });
   });
   ```

2. Run: `npx vitest run packages/orchestrator/tests/core/claim-manager.test.ts` -- observe all tests fail (module not found).
3. Run: `harness validate`
4. Commit: `test(orchestrator): add ClaimManager unit tests`

---

### Task 5: Implement `ClaimManager` class

**Depends on:** Task 3, Task 4 | **Files:** `packages/orchestrator/src/core/claim-manager.ts`, `packages/orchestrator/src/core/index.ts`

1. Create `packages/orchestrator/src/core/claim-manager.ts`:

   ```typescript
   import type { IssueTrackerClient, Issue, Result } from '@harness-engineering/types';
   import { Ok, Err } from '@harness-engineering/types';

   export interface ClaimManagerConfig {
     /** Delay in ms between claim write and verification read. Default: 2000 */
     verifyDelayMs?: number;
   }

   /**
    * Manages claim coordination for multi-orchestrator dispatch.
    *
    * Uses the tracker as the shared state layer. Claims are optimistic:
    * write then verify after a delay to detect races.
    */
   export class ClaimManager {
     private tracker: IssueTrackerClient;
     private orchestratorId: string;
     private verifyDelayMs: number;

     constructor(
       tracker: IssueTrackerClient,
       orchestratorId: string,
       config: ClaimManagerConfig = {}
     ) {
       this.tracker = tracker;
       this.orchestratorId = orchestratorId;
       this.verifyDelayMs = config.verifyDelayMs ?? 2000;
     }

     /**
      * Optimistically claims an issue then verifies ownership after a delay.
      *
      * Returns 'claimed' if the assignee matches this orchestrator after
      * the verify delay, 'rejected' if another orchestrator won the race.
      */
     async claimAndVerify(issueId: string): Promise<Result<'claimed' | 'rejected', Error>> {
       // Step 1: Write claim
       const claimResult = await this.tracker.claimIssue(issueId, this.orchestratorId);
       if (!claimResult.ok) return claimResult as Result<never, Error>;

       // Step 2: Wait for other orchestrators to potentially overwrite
       if (this.verifyDelayMs > 0) {
         await new Promise((resolve) => setTimeout(resolve, this.verifyDelayMs));
       }

       // Step 3: Verify ownership
       const statesResult = await this.tracker.fetchIssueStatesByIds([issueId]);
       if (!statesResult.ok) return statesResult as Result<never, Error>;

       const issue = statesResult.value.get(issueId);
       if (!issue) return Ok('rejected' as const);

       if (issue.assignee === this.orchestratorId) {
         return Ok('claimed' as const);
       }

       return Ok('rejected' as const);
     }

     /**
      * Releases a claimed issue back to the available pool.
      */
     async release(issueId: string): Promise<Result<void, Error>> {
       return this.tracker.releaseIssue(issueId);
     }

     /**
      * Refreshes claim timestamps for all running issues.
      * Failures are logged but do not throw -- individual heartbeat
      * failures are non-fatal.
      */
     async heartbeat(issueIds: string[]): Promise<void> {
       for (const id of issueIds) {
         await this.tracker.claimIssue(id, this.orchestratorId).catch(() => {
           // Heartbeat failure is non-fatal; claim will expire via TTL
         });
       }
     }

     /**
      * Checks whether an issue's claim is stale based on its updatedAt
      * timestamp and the configured TTL.
      *
      * Returns true if the claim should be considered expired (the
      * owning orchestrator may have crashed).
      */
     isStale(issue: Issue, ttlMs: number): boolean {
       if (!issue.updatedAt) return true;
       const age = Date.now() - new Date(issue.updatedAt).getTime();
       return age > ttlMs;
     }
   }
   ```

2. In `packages/orchestrator/src/core/index.ts`, add the export:

   ```typescript
   export { ClaimManager } from './claim-manager';
   export type { ClaimManagerConfig } from './claim-manager';
   ```

3. Run: `npx vitest run packages/orchestrator/tests/core/claim-manager.test.ts` -- all tests should pass.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): implement ClaimManager with claim-and-verify protocol`

---

### Task 6: Update state machine to emit `claim` effects and handle `claim_rejected`

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/core/state-machine.ts`, `packages/orchestrator/tests/core/state-machine.test.ts`

This is the most nuanced task. The state machine's `handleTick()` currently emits `dispatch` effects directly. It must instead emit `claim` effects. The `dispatch` will happen in the orchestrator's effect handler after claim verification succeeds.

1. In `packages/orchestrator/src/core/state-machine.ts`:

   a. Update imports to include `ClaimEffect`:

   ```typescript
   import type {
     OrchestratorEvent,
     SideEffect,
     EscalateEffect,
     TickEvent,
     ClaimEffect,
   } from '../types/events';
   ```

   b. In `handleTick()`, change the dispatch block. Replace the `effects.push({ type: 'dispatch', ... })` call (currently around line 175) with a `claim` effect. The `claimed` set and `running` placeholder remain as-is (they prevent double-selection within the same tick). Change:

   ```typescript
   // OLD:
   effects.push({
     type: 'dispatch',
     issue,
     attempt: null,
     backend,
   });
   ```

   To:

   ```typescript
   // NEW:
   effects.push({
     type: 'claim',
     issue,
     orchestratorId: config.orchestratorId ?? '',
     backend,
     attempt: null,
   });
   ```

   c. Add a `claim_rejected` handler in `applyEvent()`. Add a new case in the switch:

   ```typescript
   case 'claim_rejected':
     return handleClaimRejected(state, event.issueId);
   ```

   d. Add the `handleClaimRejected` function:

   ```typescript
   function handleClaimRejected(state: OrchestratorState, issueId: string): ApplyEventResult {
     const next = cloneState(state);
     next.claimed.delete(issueId);
     next.running.delete(issueId);
     return { nextState: next, effects: [] };
   }
   ```

2. In `packages/orchestrator/tests/core/state-machine.test.ts`:

   a. Update the existing tick dispatch tests. The tests that currently assert `effects.filter(e => e.type === 'dispatch')` should instead assert `effects.filter(e => e.type === 'claim')`. Key tests to update:
   - "should dispatch eligible candidates up to concurrency limit" -- change `'dispatch'` to `'claim'` in filter and assertions
   - Any other tests that check for `dispatch` effects from `handleTick`

   b. Add a new test for `claim_rejected`:

   ```typescript
   describe('applyEvent - claim_rejected', () => {
     it('removes issue from claimed and running sets', () => {
       const config = makeConfig();
       const state = createEmptyState(config);
       state.claimed.add('id-1');
       state.running.set('id-1', {
         issueId: 'id-1',
         identifier: 'TEST-1',
         issue: makeIssue(),
         attempt: null,
         workspacePath: '',
         startedAt: new Date().toISOString(),
         phase: 'PreparingWorkspace',
         session: null,
       });

       const event: OrchestratorEvent = { type: 'claim_rejected', issueId: 'id-1' };
       const { nextState, effects } = applyEvent(state, event, config);

       expect(nextState.claimed.has('id-1')).toBe(false);
       expect(nextState.running.has('id-1')).toBe(false);
       expect(effects).toHaveLength(0);
     });
   });
   ```

   c. Note on the retry path: `handleRetryFired` still emits `dispatch` directly. This is intentional for Phase 2 -- retries are for issues already claimed by this orchestrator. Claim coordination on the retry path will be addressed in a follow-up if needed.

3. Run: `npx vitest run packages/orchestrator/tests/core/state-machine.test.ts` -- all tests pass.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): state machine emits claim effects and handles claim_rejected`

---

### Task 7: Wire `ClaimManager` into orchestrator constructor

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/orchestrator.ts`

The orchestrator constructor is synchronous but `resolveOrchestratorId` is async. We handle this with lazy initialization: store the orchestratorId promise and await it on first tick.

1. In `packages/orchestrator/src/orchestrator.ts`:

   a. Add imports:

   ```typescript
   import { ClaimManager } from './core/claim-manager';
   import { resolveOrchestratorId } from './core/orchestrator-identity';
   ```

   b. Add private fields to the `Orchestrator` class:

   ```typescript
   private claimManager: ClaimManager | null = null;
   private orchestratorIdPromise: Promise<string>;
   ```

   c. In the constructor, after existing initialization, add:

   ```typescript
   this.orchestratorIdPromise = resolveOrchestratorId(config.orchestratorId);
   ```

   d. In `asyncTick()`, before the existing first-tick graph loading block, add lazy ClaimManager initialization:

   ```typescript
   if (!this.claimManager) {
     const orchestratorId = await this.orchestratorIdPromise;
     this.claimManager = new ClaimManager(this.tracker, orchestratorId);
     this.logger.info(`Orchestrator identity resolved: ${orchestratorId}`);
   }
   ```

2. Run: `npx vitest run packages/orchestrator` -- all tests pass.
3. Run: `harness validate`
4. Commit: `feat(orchestrator): wire ClaimManager with lazy identity resolution`

---

### Task 8: Handle `claim` effect and `claim_rejected` event in orchestrator effect handler

**Depends on:** Task 6, Task 7 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. In `packages/orchestrator/src/orchestrator.ts`:

   a. Update `handleEffect()` to handle the `claim` effect. Add a new case:

   ```typescript
   case 'claim':
     await this.handleClaimEffect(effect);
     break;
   ```

   b. Add the `handleClaimEffect` method to the `Orchestrator` class:

   ```typescript
   /**
    * Handles a claim effect by calling claimAndVerify on the ClaimManager.
    * If claimed, proceeds to dispatch. If rejected, emits a claim_rejected
    * event to clean up the state machine.
    */
   private async handleClaimEffect(effect: ClaimEffect): Promise<void> {
     if (!this.claimManager) {
       this.logger.error('ClaimManager not initialized when handling claim effect');
       return;
     }

     const result = await this.claimManager.claimAndVerify(effect.issue.id);

     if (!result.ok) {
       this.logger.warn(
         `Claim failed for ${effect.issue.identifier}: ${result.error.message}`,
         { issueId: effect.issue.id }
       );
       // Treat claim errors as rejections to avoid blocking
       const rejectEvent: OrchestratorEvent = {
         type: 'claim_rejected',
         issueId: effect.issue.id,
       };
       const { nextState, effects } = applyEvent(this.state, rejectEvent, this.config);
       this.state = nextState;
       for (const e of effects) {
         await this.handleEffect(e);
       }
       return;
     }

     if (result.value === 'rejected') {
       this.logger.warn(
         `Claim rejected for ${effect.issue.identifier} — another orchestrator won the race`,
         { issueId: effect.issue.id }
       );
       const rejectEvent: OrchestratorEvent = {
         type: 'claim_rejected',
         issueId: effect.issue.id,
       };
       const { nextState, effects } = applyEvent(this.state, rejectEvent, this.config);
       this.state = nextState;
       for (const e of effects) {
         await this.handleEffect(e);
       }
       return;
     }

     // Claim succeeded — proceed to dispatch
     await this.dispatchIssue(effect.issue, effect.attempt, effect.backend);
   }
   ```

   c. Add the import for `ClaimEffect` at the top:

   ```typescript
   import type { EscalateEffect, ClaimEffect } from './types/events';
   ```

   (Update the existing `EscalateEffect` import line to also import `ClaimEffect`.)

2. Run: `npx vitest run packages/orchestrator` -- all tests pass.
3. Run: `harness validate`
4. Commit: `feat(orchestrator): handle claim effects with verify-then-dispatch flow`

[checkpoint:human-verify] -- Verify the full claim flow works end-to-end: a tick produces claim effects, the orchestrator calls claimAndVerify, and on success dispatches the issue.

---

## Design Notes

### Why `handleRetryFired` still emits `dispatch` directly

The retry path in `handleRetryFired` continues to emit `dispatch` effects rather than `claim` effects. This is intentional for Phase 2:

- Retries are for issues that were already successfully claimed by this orchestrator.
- The claim is still held (the issue is in the `claimed` set).
- Re-claiming on retry would add latency (verifyDelayMs) with no coordination benefit.
- Phase 3 (heartbeat) will ensure the claim stays fresh during retries.

### Why `orchestratorId` defaults to empty string in state machine

The state machine is pure and does not have access to the orchestrator identity directly. It reads `config.orchestratorId` which is optional. When omitted, the empty string `''` is harmless because:

- The actual claim verification happens in the effect handler, which uses `ClaimManager` (which has the resolved ID).
- The `orchestratorId` on `ClaimEffect` is informational for logging/debugging.
- In single-orchestrator mode (no explicit ID), the effect handler still works correctly.

### `Issue.assignee` is optional

The `assignee` field is added as optional (`assignee?: string | null`) to maintain backward compatibility. Existing test fixtures that create `Issue` objects without `assignee` continue to compile. The `ClaimManager.claimAndVerify` checks `issue.assignee === this.orchestratorId`, which correctly returns `false` when `assignee` is `undefined` (treated as not-matching, i.e., rejected).
