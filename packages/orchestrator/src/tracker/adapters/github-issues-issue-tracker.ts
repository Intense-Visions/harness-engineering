/**
 * Phase 4 / S2: thin wrapper that exposes the orchestrator's small
 * `IssueTrackerClient` interface (Phase 1, 6 methods) over the wide
 * `RoadmapTrackerClient` interface (Phase 2, ~12 methods) from
 * `@harness-engineering/core`.
 *
 * Why this lives in orchestrator (not core):
 *   - `IssueTrackerClient` is an orchestrator-internal protocol.
 *   - `RoadmapTrackerClient` is the package-public wide protocol.
 *   - Putting the adapter in orchestrator preserves the layer rule that
 *     `core` does not depend on `orchestrator`. See R4 in the Phase 4 plan.
 *
 * Translation choices (D-P4-A):
 *   - `fetchCandidateIssues` → `fetchByStatus(activeStates)` then map.
 *   - `fetchIssuesByStates`  → `fetchByStatus(states)` then map.
 *   - `fetchIssueStatesByIds`→ `fetchAll()` then filter by `externalId`.
 *   - `claimIssue`           → `claim(externalId, assignee)`.
 *   - `releaseIssue`         → `release(externalId)`.
 *   - `markIssueComplete`    → `complete(externalId)`.
 *
 * @see docs/changes/roadmap-tracker-only/plans/2026-05-09-phase-4-wire-consumers-plan.md
 */
import {
  type RoadmapTrackerClient,
  type TrackedFeature,
  type Issue,
  type IssueTrackerClient,
  type TrackerConfig,
  type BlockerRef,
} from '@harness-engineering/core';
import { type Result, Ok, Err } from '@harness-engineering/types';

export class GitHubIssuesIssueTrackerAdapter implements IssueTrackerClient {
  private readonly client: RoadmapTrackerClient;
  private readonly config: TrackerConfig;

  constructor(client: RoadmapTrackerClient, config: TrackerConfig) {
    this.client = client;
    this.config = config;
  }

  async fetchCandidateIssues(): Promise<Result<Issue[], Error>> {
    return this.fetchIssuesByStates(this.config.activeStates);
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Result<Issue[], Error>> {
    // FeatureStatus is a string union but TrackerConfig.activeStates is
    // declared as `string[]`. Cast at the boundary; the tracker rejects
    // unknown statuses upstream.
    const r = await this.client.fetchByStatus(
      stateNames as unknown as Parameters<RoadmapTrackerClient['fetchByStatus']>[0]
    );
    if (!r.ok) return Err(r.error);
    return Ok(r.value.map((f) => this.mapTrackedToIssue(f)));
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Result<Map<string, Issue>, Error>> {
    const r = await this.client.fetchAll();
    if (!r.ok) return Err(r.error);
    const wanted = new Set(issueIds);
    const out = new Map<string, Issue>();
    for (const f of r.value.features) {
      if (wanted.has(f.externalId)) out.set(f.externalId, this.mapTrackedToIssue(f));
    }
    return Ok(out);
  }

  async claimIssue(issueId: string, orchestratorId: string): Promise<Result<void, Error>> {
    const r = await this.client.claim(issueId, orchestratorId);
    if (!r.ok) return Err(r.error);
    return Ok(undefined as void);
  }

  async releaseIssue(issueId: string): Promise<Result<void, Error>> {
    const r = await this.client.release(issueId);
    if (!r.ok) return Err(r.error);
    return Ok(undefined as void);
  }

  async markIssueComplete(issueId: string): Promise<Result<void, Error>> {
    const r = await this.client.complete(issueId);
    if (!r.ok) return Err(r.error);
    return Ok(undefined as void);
  }

  /**
   * Project a wide-interface `TrackedFeature` onto the small-interface
   * `Issue` shape consumed by the orchestrator's tick loop.
   */
  private mapTrackedToIssue(f: TrackedFeature): Issue {
    return {
      id: f.externalId,
      identifier: f.externalId,
      title: f.name,
      description: f.summary,
      priority: null,
      state: f.status,
      branchName: null,
      url: null,
      labels: [],
      spec: f.spec,
      plans: f.plans,
      blockedBy: f.blockedBy.map(
        (b): BlockerRef => ({
          id: null,
          identifier: b,
          state: null,
        })
      ),
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      externalId: f.externalId,
      assignee: f.assignee,
    };
  }
}
