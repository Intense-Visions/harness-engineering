# Plan: Multi-Orchestrator Claim Coordination -- Phase 5 (Tests + Validation)

**Date:** 2026-04-16 | **Spec:** `docs/changes/multi-orchestrator-claim-coordination/proposal.md` | **Tasks:** 5 | **Time:** ~20 min

## Goal

Validate multi-orchestrator claim coordination end-to-end with integration tests proving no duplicate dispatch, stale claim recovery, and graceful claim rejection -- then confirm zero regressions across the full test suite.

## Observable Truths (Acceptance Criteria)

1. **No duplicate dispatch:** When two `Orchestrator` instances share one mock tracker and one candidate issue, exactly one dispatches an agent; the other's claimed set does not contain the issue after tick (event-driven EARS: "When two orchestrators tick against the same candidate, the system shall dispatch exactly one agent").
2. **Stale claim recovery:** When an issue is marked in-progress with an expired `updatedAt` assigned to a dead orchestrator, a second orchestrator releases the stale claim during its tick, making the issue available for dispatch (event-driven EARS: "When an orchestrator encounters a stale claim older than TTL, the system shall release the claim").
3. **Claim rejection graceful skip:** When `claimAndVerify` returns `'rejected'`, the orchestrator emits a `claim_rejected` event, removes the issue from `claimed`, and does not crash (event-driven EARS: "When a claim is rejected, the system shall skip the issue without error").
4. **No regressions:** `npx vitest run` in `packages/orchestrator` passes all tests (392 existing + new integration tests).

## File Map

- CREATE `packages/orchestrator/tests/integration/claim-coordination.test.ts`

_No production code changes. Phase 5 is tests-only._

## Skeleton

1. No-duplicate-dispatch integration test (~1 task, ~5 min)
2. Stale claim recovery integration test (~1 task, ~5 min)
3. Claim rejection graceful skip integration test (~1 task, ~4 min)
4. Full suite validation pass (~1 task, ~3 min)
5. Final commit and harness validate (~1 task, ~3 min)

_Skeleton not required (5 tasks < 8 threshold), proceeding directly to full tasks._

## Tasks

### Task 1: Integration test -- no duplicate dispatch

**Depends on:** none | **Files:** `packages/orchestrator/tests/integration/claim-coordination.test.ts`

This test creates two `Orchestrator` instances sharing the same mock tracker with a single candidate issue. A shared `claimedBy` tracker variable simulates the race: the first `claimIssue` call wins, and subsequent `fetchIssueStatesByIds` calls return the winner's assignee. After both orchestrators tick, exactly one should have the issue in its `claimed`/`completed` set.

1. Create the test file `packages/orchestrator/tests/integration/claim-coordination.test.ts` with the following content:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from '../../src/orchestrator';
import type { WorkflowConfig, Issue, IssueTrackerClient } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { MockBackend } from '../../src/agent/backends/mock';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

let tmpDir: string;

function createMockConfig(overrides?: Partial<WorkflowConfig>): WorkflowConfig {
  return {
    tracker: {
      kind: 'mock',
      activeStates: ['planned'],
      terminalStates: ['done'],
    },
    polling: { intervalMs: 1000 },
    workspace: { root: path.join(tmpDir, '.harness', 'workspaces') },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 2,
      maxTurns: 3,
      maxRetryBackoffMs: 1000,
      maxRetries: 5,
      maxConcurrentAgentsByState: { planned: 1 },
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
    },
    server: { port: null },
    ...overrides,
  };
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-coord-1',
    identifier: 'H-COORD-1',
    title: 'Coordination test issue',
    description: 'Test description',
    priority: 1,
    state: 'planned',
    branchName: 'feat/coord-test',
    url: null,
    labels: ['scope:quick-fix'],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: null,
    ...overrides,
  };
}

/**
 * Creates a mock tracker where the first claimIssue call wins the race.
 * Subsequent claims for an already-claimed issue are accepted (idempotent
 * per spec) but fetchIssueStatesByIds always returns the first claimer's
 * assignee, so claimAndVerify on the loser returns 'rejected'.
 */
function createRacingTracker(candidates: Issue[]) {
  // Shared state: maps issueId -> winning orchestratorId
  const claimedBy = new Map<string, string>();

  function makeTracker(): IssueTrackerClient {
    return {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok(candidates)),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockImplementation((ids: string[]) => {
        const map = new Map<string, Issue>();
        for (const id of ids) {
          const c = candidates.find((c) => c.id === id);
          if (c) {
            map.set(id, { ...c, assignee: claimedBy.get(id) ?? null });
          }
        }
        return Promise.resolve(Ok(map));
      }),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockImplementation((issueId: string, orchestratorId: string) => {
        // First writer wins; subsequent claims are accepted (idempotent)
        // but do NOT change the assignee
        if (!claimedBy.has(issueId)) {
          claimedBy.set(issueId, orchestratorId);
        }
        return Promise.resolve(Ok(undefined));
      }),
      releaseIssue: vi.fn().mockImplementation((issueId: string) => {
        claimedBy.delete(issueId);
        return Promise.resolve(Ok(undefined));
      }),
    };
  }

  return { makeTracker, claimedBy };
}

describe('Multi-Orchestrator Claim Coordination', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-coord-'));
    execSync('git init && git commit --allow-empty -m "init"', { cwd: tmpDir, stdio: 'ignore' });
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('no duplicate dispatch', () => {
    it('only one orchestrator dispatches when two race for the same issue', async () => {
      const issue = makeIssue();
      const { makeTracker } = createRacingTracker([issue]);

      // Two orchestrators sharing the same tracker (shared claimedBy state)
      const trackerA = makeTracker();
      const trackerB = makeTracker();

      const orchA = new Orchestrator(createMockConfig({ orchestratorId: 'orch-alpha' }), 'Prompt', {
        tracker: trackerA,
        backend: new MockBackend(),
      });
      const orchB = new Orchestrator(createMockConfig({ orchestratorId: 'orch-beta' }), 'Prompt', {
        tracker: trackerB,
        backend: new MockBackend(),
      });

      try {
        // Both tick -- the first claimIssue call wins the shared tracker
        await orchA.tick();
        await orchB.tick();

        // Wait for async dispatch to settle
        await new Promise((resolve) => setTimeout(resolve, 500));

        const snapA = orchA.getSnapshot();
        const snapB = orchB.getSnapshot();

        // Exactly one should have dispatched (claimed or completed)
        const aDispatched =
          (snapA.claimed as string[]).includes(issue.id) ||
          (snapA.completed as string[]).includes(issue.id);
        const bDispatched =
          (snapB.claimed as string[]).includes(issue.id) ||
          (snapB.completed as string[]).includes(issue.id);

        // One dispatched, not both
        expect(aDispatched || bDispatched).toBe(true);
        expect(aDispatched && bDispatched).toBe(false);
      } finally {
        await orchA.stop();
        await orchB.stop();
      }
    });
  });
});
```

2. Run the test to observe it pass:
   ```
   cd packages/orchestrator && npx vitest run tests/integration/claim-coordination.test.ts
   ```
3. Run: `harness validate`
4. **Do NOT commit yet** -- more tests will be added to this file in subsequent tasks.

---

### Task 2: Integration test -- stale claim recovery

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/integration/claim-coordination.test.ts`

This test simulates a crashed orchestrator by pre-populating the tracker with an in-progress issue assigned to a dead orchestrator, with an `updatedAt` timestamp that exceeds the TTL. A live orchestrator should detect the stale claim in `releaseStaleClaims()` during its tick and release it, making the issue available for dispatch.

1. Add the following `describe` block inside the top-level `describe('Multi-Orchestrator Claim Coordination', ...)` block, after the `no duplicate dispatch` block:

```typescript
describe('stale claim recovery', () => {
  it('releases stale claim from dead orchestrator and dispatches the issue', async () => {
    // Simulate a crashed orchestrator: issue is in-progress, assigned to
    // 'dead-orch', with updatedAt 20 minutes ago (well past any TTL).
    const staleIssue = makeIssue({
      id: 'issue-stale-1',
      identifier: 'H-STALE-1',
      state: 'in-progress',
      assignee: 'dead-orch',
      updatedAt: new Date(Date.now() - 1_200_000).toISOString(), // 20 min ago
    });

    // The tracker starts with the stale issue as the only candidate.
    // After releaseIssue is called, the issue reverts to 'planned' state
    // and becomes a normal candidate on the same tick.
    let issueState = { ...staleIssue };
    const tracker: IssueTrackerClient = {
      fetchCandidateIssues: vi.fn().mockImplementation(() => {
        // Return the issue in its current state
        return Promise.resolve(Ok([{ ...issueState }]));
      }),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockImplementation((ids: string[]) => {
        const map = new Map<string, Issue>();
        for (const id of ids) {
          if (id === issueState.id) {
            map.set(id, { ...issueState });
          }
        }
        return Promise.resolve(Ok(map));
      }),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockImplementation((_id: string, orchestratorId: string) => {
        issueState = {
          ...issueState,
          assignee: orchestratorId,
          state: 'in-progress',
          updatedAt: new Date().toISOString(),
        };
        return Promise.resolve(Ok(undefined));
      }),
      releaseIssue: vi.fn().mockImplementation((_id: string) => {
        issueState = {
          ...issueState,
          assignee: null,
          state: 'planned',
          updatedAt: new Date().toISOString(),
        };
        return Promise.resolve(Ok(undefined));
      }),
    };

    const orch = new Orchestrator(createMockConfig({ orchestratorId: 'orch-live' }), 'Prompt', {
      tracker,
      backend: new MockBackend(),
    });

    try {
      // First tick: detects stale claim, releases it.
      // The issue becomes available but won't be dispatched on this tick
      // because releaseIssue resets the state after candidates are fetched.
      await orch.tick();

      // releaseIssue should have been called for the stale claim
      expect(tracker.releaseIssue).toHaveBeenCalledWith('issue-stale-1');

      // Second tick: issue is now in 'planned' state, normal candidate flow
      await orch.tick();

      // Wait for async dispatch to settle
      await new Promise((resolve) => setTimeout(resolve, 500));

      const snapshot = orch.getSnapshot();
      const dispatched =
        (snapshot.claimed as string[]).includes('issue-stale-1') ||
        (snapshot.completed as string[]).includes('issue-stale-1');
      expect(dispatched).toBe(true);
    } finally {
      await orch.stop();
    }
  });
});
```

2. Run the test:
   ```
   cd packages/orchestrator && npx vitest run tests/integration/claim-coordination.test.ts
   ```
3. Run: `harness validate`
4. **Do NOT commit yet.**

---

### Task 3: Integration test -- claim rejection graceful skip

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/integration/claim-coordination.test.ts`

This test simulates a claim race where `claimAndVerify` returns `'rejected'`. It verifies the orchestrator does not crash, does not have the issue in its claimed/running sets, and does not dispatch an agent.

1. Add the following `describe` block inside the top-level `describe('Multi-Orchestrator Claim Coordination', ...)` block:

```typescript
describe('claim rejection graceful skip', () => {
  it('skips the issue without error when claim is rejected', async () => {
    const issue = makeIssue({
      id: 'issue-race-1',
      identifier: 'H-RACE-1',
    });

    // Simulate a tracker where claimIssue succeeds but fetchIssueStatesByIds
    // returns a different orchestrator's assignee (another orchestrator won).
    const tracker: IssueTrackerClient = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([issue])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockImplementation((ids: string[]) => {
        const map = new Map<string, Issue>();
        for (const id of ids) {
          if (id === issue.id) {
            // Another orchestrator won the race
            map.set(id, { ...issue, assignee: 'other-orch-winner', state: 'in-progress' });
          }
        }
        return Promise.resolve(Ok(map));
      }),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
      releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    };

    const orch = new Orchestrator(createMockConfig({ orchestratorId: 'orch-loser' }), 'Prompt', {
      tracker,
      backend: new MockBackend(),
    });

    try {
      // tick should NOT throw
      await orch.tick();

      // Wait for any async dispatch attempts to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      const snapshot = orch.getSnapshot();

      // Issue should NOT be in claimed or running (claim was rejected)
      expect((snapshot.claimed as string[]).includes('issue-race-1')).toBe(false);
      const running = snapshot.running as [string, unknown][];
      expect(running.some(([id]) => id === 'issue-race-1')).toBe(false);

      // claimIssue was called (optimistic claim attempt)
      expect(tracker.claimIssue).toHaveBeenCalledWith('issue-race-1', 'orch-loser');
    } finally {
      await orch.stop();
    }
  });

  it('does not crash when claimIssue itself returns an error', async () => {
    const issue = makeIssue({
      id: 'issue-err-1',
      identifier: 'H-ERR-1',
    });

    const tracker: IssueTrackerClient = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([issue])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockRejectedValue(new Error('tracker down')),
      releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    };

    const orch = new Orchestrator(createMockConfig({ orchestratorId: 'orch-err' }), 'Prompt', {
      tracker,
      backend: new MockBackend(),
    });

    try {
      // Should not throw
      await expect(orch.tick()).resolves.not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 300));

      const snapshot = orch.getSnapshot();
      expect((snapshot.claimed as string[]).includes('issue-err-1')).toBe(false);
    } finally {
      await orch.stop();
    }
  });
});
```

2. Run the test:
   ```
   cd packages/orchestrator && npx vitest run tests/integration/claim-coordination.test.ts
   ```
3. Run: `harness validate`
4. **Do NOT commit yet.**

---

### Task 4: Full test suite validation

**Depends on:** Tasks 1-3 | **Files:** none (read-only validation)

Run the complete orchestrator test suite to confirm zero regressions.

1. Run the full orchestrator test suite:
   ```
   cd packages/orchestrator && npx vitest run
   ```
2. Verify: **all tests pass** (392 existing + new integration tests = 396+).
3. Verify: **no test failures, no uncovered regressions**.
4. Run: `harness validate`
5. If any test fails that is NOT in the new `claim-coordination.test.ts` file, investigate and fix the regression before proceeding.

---

### Task 5: Commit and final validation

**Depends on:** Task 4 | **Files:** `packages/orchestrator/tests/integration/claim-coordination.test.ts`

1. Run: `harness validate`
2. Commit:

   ```
   git add packages/orchestrator/tests/integration/claim-coordination.test.ts
   git commit -m "test(orchestrator): add integration tests for multi-orchestrator claim coordination

   Phase 5 of multi-orchestrator claim coordination. Adds integration
   tests validating:
   - No duplicate dispatch when two orchestrators race for the same issue
   - Stale claim recovery after simulated orchestrator crash
   - Graceful claim rejection (skip without error or crash)
   - Resilience when claimIssue returns an error"
   ```

3. Verify the commit succeeded and the working tree is clean.

[checkpoint:human-verify] -- Review the test output and confirm all integration tests demonstrate the expected claim coordination behavior.
