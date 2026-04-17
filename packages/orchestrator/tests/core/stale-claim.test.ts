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

describe('Stale Claim Detection', () => {
  const orchestratorId = 'orch-stale-test';
  const ttlMs = 600_000; // 10 minutes
  let tracker: ReturnType<typeof mockTracker>;
  let manager: ClaimManager;

  beforeEach(() => {
    tracker = mockTracker();
    manager = new ClaimManager(tracker, orchestratorId, { verifyDelayMs: 0 });
  });

  it('isStale returns true when updatedAt exceeds TTL', () => {
    const issue = makeIssue({
      updatedAt: new Date(Date.now() - 700_000).toISOString(),
      assignee: 'other-orchestrator',
    });
    expect(manager.isStale(issue, ttlMs)).toBe(true);
  });

  it('isStale returns false when updatedAt is within TTL', () => {
    const issue = makeIssue({
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
      assignee: 'other-orchestrator',
    });
    expect(manager.isStale(issue, ttlMs)).toBe(false);
  });

  it('isStale returns true when updatedAt is null', () => {
    const issue = makeIssue({
      updatedAt: null,
      assignee: 'other-orchestrator',
    });
    expect(manager.isStale(issue, ttlMs)).toBe(true);
  });

  it('release delegates to tracker.releaseIssue for stale claims', async () => {
    const result = await manager.release('stale-issue-1');
    expect(result.ok).toBe(true);
    expect(tracker.releaseIssue).toHaveBeenCalledWith('stale-issue-1');
  });

  it('release propagates tracker errors gracefully', async () => {
    vi.mocked(tracker.releaseIssue).mockResolvedValue(Err(new Error('tracker unavailable')));
    const result = await manager.release('stale-issue-1');
    expect(result.ok).toBe(false);
  });

  describe('stale claim reclamation logic', () => {
    it('should identify stale claims: in-progress + different assignee + expired TTL', () => {
      const candidates = [
        makeIssue({
          id: 'fresh',
          state: 'in-progress',
          assignee: 'other-orch',
          updatedAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago -- fresh
        }),
        makeIssue({
          id: 'stale',
          state: 'in-progress',
          assignee: 'dead-orch',
          updatedAt: new Date(Date.now() - 700_000).toISOString(), // 11+ min ago -- stale
        }),
        makeIssue({
          id: 'own',
          state: 'in-progress',
          assignee: orchestratorId,
          updatedAt: new Date(Date.now() - 700_000).toISOString(), // Our own -- skip
        }),
        makeIssue({
          id: 'unassigned',
          state: 'in-progress',
          assignee: null,
          updatedAt: new Date(Date.now() - 700_000).toISOString(), // No assignee -- skip
        }),
        makeIssue({
          id: 'todo',
          state: 'Todo',
          assignee: 'dead-orch',
          updatedAt: new Date(Date.now() - 700_000).toISOString(), // Not in-progress -- skip
        }),
      ];

      // Filter candidates that would trigger stale release
      const staleCandidates = candidates.filter((issue) => {
        const normalizedState = issue.state.toLowerCase();
        if (normalizedState !== 'in-progress') return false;
        if (!issue.assignee) return false;
        if (issue.assignee === orchestratorId) return false;
        return manager.isStale(issue, ttlMs);
      });

      expect(staleCandidates).toHaveLength(1);
      expect(staleCandidates[0]!.id).toBe('stale');
    });

    it('should not flag any issues when all claims are fresh', () => {
      const candidates = [
        makeIssue({
          id: 'fresh-1',
          state: 'in-progress',
          assignee: 'other-orch',
          updatedAt: new Date(Date.now() - 30_000).toISOString(),
        }),
        makeIssue({
          id: 'fresh-2',
          state: 'in-progress',
          assignee: 'another-orch',
          updatedAt: new Date(Date.now() - 120_000).toISOString(),
        }),
      ];

      const staleCandidates = candidates.filter((issue) => {
        if (issue.state.toLowerCase() !== 'in-progress') return false;
        if (!issue.assignee || issue.assignee === orchestratorId) return false;
        return manager.isStale(issue, ttlMs);
      });

      expect(staleCandidates).toHaveLength(0);
    });
  });
});
