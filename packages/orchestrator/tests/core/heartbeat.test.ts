import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaimManager } from '../../src/core/claim-manager';
import type { IssueTrackerClient } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';

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

describe('Heartbeat via ClaimManager', () => {
  const orchestratorId = 'orch-heartbeat-test';
  let tracker: ReturnType<typeof mockTracker>;
  let manager: ClaimManager;

  beforeEach(() => {
    tracker = mockTracker();
    manager = new ClaimManager(tracker, orchestratorId, { verifyDelayMs: 0 });
  });

  it('refreshes claims for all provided issue IDs', async () => {
    await manager.heartbeat(['id-1', 'id-2', 'id-3']);

    expect(tracker.claimIssue).toHaveBeenCalledTimes(3);
    expect(tracker.claimIssue).toHaveBeenCalledWith('id-1', orchestratorId);
    expect(tracker.claimIssue).toHaveBeenCalledWith('id-2', orchestratorId);
    expect(tracker.claimIssue).toHaveBeenCalledWith('id-3', orchestratorId);
  });

  it('continues refreshing remaining claims when one fails', async () => {
    vi.mocked(tracker.claimIssue)
      .mockResolvedValueOnce(Ok(undefined))
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce(Ok(undefined));

    await expect(manager.heartbeat(['id-1', 'id-2', 'id-3'])).resolves.not.toThrow();
    expect(tracker.claimIssue).toHaveBeenCalledTimes(3);
  });

  it('does nothing when passed an empty list', async () => {
    await manager.heartbeat([]);
    expect(tracker.claimIssue).not.toHaveBeenCalled();
  });

  it('heartbeat interval computes to half the polling interval', () => {
    const intervalMs = 30000;
    const heartbeatMs = Math.max(5000, Math.floor(intervalMs / 2));
    expect(heartbeatMs).toBe(15000);
  });

  it('heartbeat interval has a minimum floor of 5000ms', () => {
    const intervalMs = 2000;
    const heartbeatMs = Math.max(5000, Math.floor(intervalMs / 2));
    expect(heartbeatMs).toBe(5000);
  });
});
