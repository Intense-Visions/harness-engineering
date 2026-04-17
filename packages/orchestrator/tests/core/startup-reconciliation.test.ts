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
