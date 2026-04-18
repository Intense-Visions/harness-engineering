import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from '../../src/orchestrator';
import type { WorkflowConfig, Issue, IssueTrackerClient } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { MockBackend } from '../../src/agent/backends/mock';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { noopExecFile } from '../helpers/noop-exec-file';

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
 * Builds a fetchIssueStatesByIds mock that resolves assignee from the
 * shared claimedBy map against the candidate list.
 */
function buildStatesByIdsFn(candidates: Issue[], claimedBy: Map<string, string>) {
  return (ids: string[]) => {
    const map = new Map<string, Issue>();
    for (const id of ids) {
      const match = candidates.find((c) => c.id === id);
      if (match) {
        map.set(id, { ...match, assignee: claimedBy.get(id) ?? null });
      }
    }
    return Promise.resolve(Ok(map));
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
      fetchIssueStatesByIds: vi.fn().mockImplementation(buildStatesByIdsFn(candidates, claimedBy)),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockImplementation((issueId: string, orchestratorId: string) => {
        if (!claimedBy.has(issueId)) claimedBy.set(issueId, orchestratorId);
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

  // ClaimManager.claimAndVerify has a 2s default verify delay, so each
  // tick that claims an issue takes ~2s. Tests involving claims need a
  // generous timeout to avoid flaking.
  describe('no duplicate dispatch', () => {
    it(
      'only one orchestrator dispatches when two race for the same issue',
      { timeout: 15000 },
      async () => {
        const issue = makeIssue();
        const { makeTracker } = createRacingTracker([issue]);

        // Two orchestrators sharing the same tracker (shared claimedBy state)
        const trackerA = makeTracker();
        const trackerB = makeTracker();

        const orchA = new Orchestrator(
          createMockConfig({ orchestratorId: 'orch-alpha' }),
          'Prompt',
          { tracker: trackerA, backend: new MockBackend(), execFileFn: noopExecFile }
        );
        const orchB = new Orchestrator(
          createMockConfig({ orchestratorId: 'orch-beta' }),
          'Prompt',
          { tracker: trackerB, backend: new MockBackend(), execFileFn: noopExecFile }
        );

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
      }
    );
  });

  describe('stale claim recovery', () => {
    it(
      'releases stale claim from dead orchestrator and dispatches the issue',
      { timeout: 15000 },
      async () => {
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
          execFileFn: noopExecFile,
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
      }
    );
  });

  describe('claim rejection graceful skip', () => {
    it('skips the issue without error when claim is rejected', { timeout: 15000 }, async () => {
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
        execFileFn: noopExecFile,
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

    it('does not crash when claimIssue itself returns an error', { timeout: 15000 }, async () => {
      const issue = makeIssue({
        id: 'issue-err-1',
        identifier: 'H-ERR-1',
      });

      const tracker: IssueTrackerClient = {
        fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([issue])),
        fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
        fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
        markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
        claimIssue: vi.fn().mockResolvedValue(Err(new Error('tracker down'))),
        releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
      };

      const orch = new Orchestrator(createMockConfig({ orchestratorId: 'orch-err' }), 'Prompt', {
        tracker,
        backend: new MockBackend(),
        execFileFn: noopExecFile,
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
});
