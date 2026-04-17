import type { IssueTrackerClient, Issue, Result } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';

export interface ClaimManagerConfig {
  /** Delay in ms between claim write and verification read. Default: 2000 */
  verifyDelayMs?: number;
  /** State name used for claimed/in-progress issues. Default: 'in-progress' */
  claimedState?: string;
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
  private claimedState: string;

  constructor(
    tracker: IssueTrackerClient,
    orchestratorId: string,
    config: ClaimManagerConfig = {}
  ) {
    this.tracker = tracker;
    this.orchestratorId = orchestratorId;
    this.verifyDelayMs = config.verifyDelayMs ?? 2000;
    this.claimedState = config.claimedState ?? 'in-progress';
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
    if (!issue.updatedAt) return false; // Unknown freshness = not stale (conservative)
    const age = Date.now() - new Date(issue.updatedAt).getTime();
    return age > ttlMs;
  }

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
  async reconcileOnStartup(runningIssueIds: ReadonlySet<string>): Promise<Result<string[], Error>> {
    const fetchResult = await this.tracker.fetchIssuesByStates([this.claimedState]);
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
}
