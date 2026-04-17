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

    it('returns false when updatedAt is null (unknown freshness is conservative)', () => {
      const issue = makeIssue({ updatedAt: null });
      expect(manager.isStale(issue, 600_000)).toBe(false);
    });
  });

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
});
