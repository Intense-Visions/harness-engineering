# Plan: Multi-Orchestrator Phase 4 -- Startup Reconciliation

**Date:** 2026-04-16 | **Spec:** docs/changes/multi-orchestrator-claim-coordination/proposal.md | **Tasks:** 4 | **Time:** ~18 min

## Goal

On startup, the orchestrator reconciles stale claims by scanning the tracker for "in-progress" issues assigned to its own identity, releasing any orphaned claims that have no corresponding in-memory running state, before the first tick fires.

## Observable Truths (Acceptance Criteria)

1. **[ADDED]** When `orchestrator.start()` is called, the system shall invoke `claimManager.reconcileOnStartup()` before the first tick fires, so that orphaned claims from a previous crash are released.
2. **[ADDED]** When `reconcileOnStartup()` executes, the system shall fetch all "in-progress" issues via `tracker.fetchIssuesByStates(['in-progress'])`, filter to issues where `assignee === this.orchestratorId`, and call `release()` on each that is not in the `running` map.
3. **[ADDED]** `reconcileOnStartup()` shall return `Ok(string[])` with the list of released issue IDs on success, or `Err(Error)` if the tracker fetch fails.
4. **[ADDED]** If `reconcileOnStartup()` returns `Err`, the system shall log a warning but still proceed to the first tick (non-fatal).
5. `npx vitest run` in the orchestrator package passes with all existing + new tests. TypeScript compiles with zero errors.

## File Map

- MODIFY `packages/orchestrator/src/core/claim-manager.ts` (add `reconcileOnStartup()` method)
- MODIFY `packages/orchestrator/tests/core/claim-manager.test.ts` (add `reconcileOnStartup` describe block)
- MODIFY `packages/orchestrator/src/orchestrator.ts` (convert `start()` to async, call reconcile before first tick)
- CREATE `packages/orchestrator/tests/core/startup-reconciliation.test.ts` (integration-level tests for startup reconciliation in orchestrator)

## Tasks

### Task 1: Add `reconcileOnStartup()` to ClaimManager

**Depends on:** none | **Files:** `packages/orchestrator/src/core/claim-manager.ts`

1. In `packages/orchestrator/src/core/claim-manager.ts`, add a `runningIssueIds` parameter to the constructor or accept it at call time. Since `ClaimManager` does not hold a reference to orchestrator state, the caller will pass running issue IDs. Add the following method after `isStale()`:

```typescript
  /**
   * Scans the tracker for "in-progress" issues assigned to this orchestrator
   * and releases any that are not currently running in memory.
   *
   * Called once during orchestrator startup to clean up orphaned claims
   * from a previous crash or unclean shutdown.
   *
   * @param runningIssueIds - Set of issue IDs currently in the running map
   * @returns List of issue IDs that were released
   */
  async reconcileOnStartup(
    runningIssueIds: ReadonlySet<string>
  ): Promise<Result<string[], Error>> {
    const fetchResult = await this.tracker.fetchIssuesByStates(['in-progress']);
    if (!fetchResult.ok) return fetchResult as Result<never, Error>;

    const released: string[] = [];
    for (const issue of fetchResult.value) {
      // Only consider issues claimed by this orchestrator
      if (issue.assignee !== this.orchestratorId) continue;

      // If the issue is still in the running map, it is legitimate -- skip
      if (runningIssueIds.has(issue.id)) continue;

      // Orphaned claim: release it
      const releaseResult = await this.release(issue.id);
      if (releaseResult.ok) {
        released.push(issue.id);
      }
      // Individual release failures are non-fatal; skip and continue
    }

    return Ok(released);
  }
```

2. Ensure the `Ok` import is already present at the top of the file (it is: `import { Ok } from '@harness-engineering/types';`).

3. Run: `cd packages/orchestrator && npx tsc --noEmit` -- observe zero errors.

4. Commit: `feat(claim-manager): add reconcileOnStartup() for orphaned claim cleanup`

---

### Task 2: Add unit tests for `reconcileOnStartup()` in claim-manager tests

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/core/claim-manager.test.ts`

1. In `packages/orchestrator/tests/core/claim-manager.test.ts`, add a new describe block after the existing `isStale` describe block (before the final closing `});`):

```typescript
describe('reconcileOnStartup', () => {
  it('releases orphaned issues assigned to this orchestrator', async () => {
    const orphan1 = makeIssue({ id: 'id-1', assignee: orchestratorId, state: 'in-progress' });
    const orphan2 = makeIssue({ id: 'id-2', assignee: orchestratorId, state: 'in-progress' });
    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Ok([orphan1, orphan2]));

    const result = await manager.reconcileOnStartup(new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['id-1', 'id-2']);
    }
    expect(tracker.releaseIssue).toHaveBeenCalledWith('id-1');
    expect(tracker.releaseIssue).toHaveBeenCalledWith('id-2');
  });

  it('skips issues assigned to a different orchestrator', async () => {
    const otherOrch = makeIssue({ id: 'id-1', assignee: 'other-orch', state: 'in-progress' });
    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Ok([otherOrch]));

    const result = await manager.reconcileOnStartup(new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
    expect(tracker.releaseIssue).not.toHaveBeenCalled();
  });

  it('skips issues that are still in the running set', async () => {
    const running = makeIssue({ id: 'id-1', assignee: orchestratorId, state: 'in-progress' });
    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Ok([running]));

    const result = await manager.reconcileOnStartup(new Set(['id-1']));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
    expect(tracker.releaseIssue).not.toHaveBeenCalled();
  });

  it('returns Err when fetchIssuesByStates fails', async () => {
    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Err(new Error('fetch failed')));

    const result = await manager.reconcileOnStartup(new Set());
    expect(result.ok).toBe(false);
  });

  it('continues releasing remaining issues when one release fails', async () => {
    const orphan1 = makeIssue({ id: 'id-1', assignee: orchestratorId, state: 'in-progress' });
    const orphan2 = makeIssue({ id: 'id-2', assignee: orchestratorId, state: 'in-progress' });
    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Ok([orphan1, orphan2]));
    vi.mocked(tracker.releaseIssue)
      .mockResolvedValueOnce(Err(new Error('release failed')))
      .mockResolvedValueOnce(Ok(undefined));

    const result = await manager.reconcileOnStartup(new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only id-2 was successfully released
      expect(result.value).toEqual(['id-2']);
    }
    expect(tracker.releaseIssue).toHaveBeenCalledTimes(2);
  });

  it('skips issues with null assignee', async () => {
    const unassigned = makeIssue({ id: 'id-1', assignee: null, state: 'in-progress' });
    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Ok([unassigned]));

    const result = await manager.reconcileOnStartup(new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
    expect(tracker.releaseIssue).not.toHaveBeenCalled();
  });

  it('calls fetchIssuesByStates with in-progress state', async () => {
    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Ok([]));

    await manager.reconcileOnStartup(new Set());
    expect(tracker.fetchIssuesByStates).toHaveBeenCalledWith(['in-progress']);
  });
});
```

2. Run: `cd packages/orchestrator && npx vitest run tests/core/claim-manager.test.ts` -- observe all tests pass (existing + 7 new).

3. Commit: `test(claim-manager): add reconcileOnStartup unit tests`

---

### Task 3: Wire `reconcileOnStartup()` into `orchestrator.start()`

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/orchestrator.ts`

The current `start()` method is synchronous (`public start(): void`). Reconciliation is async, so `start()` must become async. The change is to:

1. Convert `start()` from `void` to `async` returning `Promise<void>`.
2. Before the first tick, resolve the ClaimManager (same lazy-init pattern used in `asyncTick()`), then call `reconcileOnStartup()`.
3. The first tick and heartbeat setup move after reconciliation completes.

Replace the entire `start()` method (lines 1367-1398) with:

```typescript
  /**
   * Starts the polling loop and the internal HTTP server.
   * Runs startup reconciliation to release orphaned claims before the first tick.
   */
  public async start(): Promise<void> {
    if (this.server) {
      void this.server.start();
    }

    // Resolve orchestrator identity and initialize ClaimManager before first tick
    if (!this.claimManager) {
      const orchestratorId = await this.orchestratorIdPromise;
      this.claimManager = new ClaimManager(this.tracker, orchestratorId);
      this.logger.info(`Orchestrator identity resolved: ${orchestratorId}`);
    }

    // Startup reconciliation: release orphaned claims from previous crash
    const runningIssueIds = new Set(this.state.running.keys());
    const reconcileResult = await this.claimManager.reconcileOnStartup(runningIssueIds);
    if (!reconcileResult.ok) {
      this.logger.warn('Startup reconciliation failed, proceeding with first tick', {
        error: String(reconcileResult.error),
      });
    } else if (reconcileResult.value.length > 0) {
      this.logger.info(
        `Startup reconciliation released ${reconcileResult.value.length} orphaned claim(s)`,
        { releasedIds: reconcileResult.value }
      );
    }

    const intervalMs = this.config.polling.intervalMs || 30000;
    const jitterMs = this.config.polling.jitterMs ?? 0;

    const scheduleNextTick = () => {
      const jitter = jitterMs > 0 ? Math.round((Math.random() * 2 - 1) * jitterMs) : 0;
      const delay = Math.max(0, intervalMs + jitter);
      this.interval = setTimeout(() => {
        void this.tick().finally(() => scheduleNextTick());
      }, delay);
    };

    scheduleNextTick();
    void this.tick(); // Initial tick (no jitter)

    // Heartbeat: refresh claims for all running issues on a separate interval.
    // Default interval is half the polling interval so claims stay fresh between ticks.
    const heartbeatMs = Math.max(5000, Math.floor(intervalMs / 2));
    this.heartbeatInterval = setInterval(() => {
      if (this.claimManager) {
        const runningIds = Array.from(this.state.running.keys());
        if (runningIds.length > 0) {
          void this.claimManager.heartbeat(runningIds).catch((err) => {
            this.logger.warn('Heartbeat failed', { error: String(err) });
          });
        }
      }
    }, heartbeatMs);
  }
```

Note: The `asyncTick()` method already has a lazy-init guard for `claimManager` (lines 628-632). Since `start()` now initializes it first, the guard in `asyncTick()` becomes a no-op (the `if (!this.claimManager)` branch will never fire during normal startup flow). This is safe -- the guard remains as a defensive fallback for direct `asyncTick()` calls in tests.

3. Run: `cd packages/orchestrator && npx tsc --noEmit` -- observe zero errors.

4. Commit: `feat(orchestrator): call reconcileOnStartup() before first tick`

---

### Task 4: Add integration-level tests for startup reconciliation

**Depends on:** Tasks 1, 3 | **Files:** `packages/orchestrator/tests/core/startup-reconciliation.test.ts`

Create a new test file that tests the `start()` method's reconciliation behavior using a mock tracker and a minimal orchestrator setup. Since `Orchestrator` has many dependencies, we test at the `ClaimManager` + `start()` flow level using the existing mock patterns from the heartbeat and tick-jitter tests.

1. Create `packages/orchestrator/tests/core/startup-reconciliation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    state: 'in-progress',
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

describe('Startup Reconciliation (integration)', () => {
  const orchestratorId = 'test-orch-abc123';
  let tracker: ReturnType<typeof mockTracker>;
  let manager: ClaimManager;

  beforeEach(() => {
    tracker = mockTracker();
    manager = new ClaimManager(tracker, orchestratorId, { verifyDelayMs: 0 });
  });

  it('releases orphaned claims and leaves legitimate running claims intact', async () => {
    const orphan = makeIssue({ id: 'orphan-1', assignee: orchestratorId });
    const legitimate = makeIssue({ id: 'running-1', assignee: orchestratorId });
    const otherOrch = makeIssue({ id: 'other-1', assignee: 'other-orch-xyz' });

    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Ok([orphan, legitimate, otherOrch]));

    const runningIds = new Set(['running-1']);
    const result = await manager.reconcileOnStartup(runningIds);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['orphan-1']);
    }

    // Only orphan-1 should be released
    expect(tracker.releaseIssue).toHaveBeenCalledTimes(1);
    expect(tracker.releaseIssue).toHaveBeenCalledWith('orphan-1');
  });

  it('returns empty array when no orphaned claims exist', async () => {
    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Ok([]));

    const result = await manager.reconcileOnStartup(new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
    expect(tracker.releaseIssue).not.toHaveBeenCalled();
  });

  it('handles tracker fetch failure gracefully', async () => {
    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Err(new Error('network timeout')));

    const result = await manager.reconcileOnStartup(new Set());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('network timeout');
    }
    // No releases attempted
    expect(tracker.releaseIssue).not.toHaveBeenCalled();
  });

  it('handles mixed release success/failure without stopping', async () => {
    const orphan1 = makeIssue({ id: 'orphan-1', assignee: orchestratorId });
    const orphan2 = makeIssue({ id: 'orphan-2', assignee: orchestratorId });
    const orphan3 = makeIssue({ id: 'orphan-3', assignee: orchestratorId });

    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Ok([orphan1, orphan2, orphan3]));
    vi.mocked(tracker.releaseIssue)
      .mockResolvedValueOnce(Ok(undefined)) // orphan-1: success
      .mockResolvedValueOnce(Err(new Error('write error'))) // orphan-2: fail
      .mockResolvedValueOnce(Ok(undefined)); // orphan-3: success

    const result = await manager.reconcileOnStartup(new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['orphan-1', 'orphan-3']);
    }
    expect(tracker.releaseIssue).toHaveBeenCalledTimes(3);
  });

  it('reconcileOnStartup is called with empty running set on fresh start', async () => {
    // Simulates the orchestrator starting fresh with no in-memory state
    const orphan = makeIssue({ id: 'orphan-1', assignee: orchestratorId });
    vi.mocked(tracker.fetchIssuesByStates).mockResolvedValue(Ok([orphan]));

    const result = await manager.reconcileOnStartup(new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['orphan-1']);
    }
  });
});
```

2. Run: `cd packages/orchestrator && npx vitest run tests/core/startup-reconciliation.test.ts` -- observe all 5 tests pass.

3. Run: `cd packages/orchestrator && npx vitest run` -- observe all tests pass (existing + new).

4. Run: `cd packages/orchestrator && npx tsc --noEmit` -- observe zero errors.

5. Commit: `test(orchestrator): add startup reconciliation integration tests`
