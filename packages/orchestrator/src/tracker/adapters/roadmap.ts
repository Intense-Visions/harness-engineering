import { createHash } from 'node:crypto';
import {
  // Roadmap CONTENT is read + written through the store so sharded mode rewrites
  // only the changed row's shard (the contention this feature targets) while
  // monolith mode stays a whole-file rewrite. The adapter's TrackerConfig.filePath
  // points directly at the aggregate, so the file-anchored resolver is used.
  resolveRoadmapStoreForFile,
  applyRoadmapDiff,
  // The assignee-lifecycle authority owns the claim transition + invariant.
  claim as claimFeature,
  // setStatus is the status-change chokepoint: moving away from in-progress
  // auto-clears the assignee, preserving `assignee ≠ null ⟺ in-progress` (RMH005).
  setStatus as setFeatureStatus,
  // The single, status-agnostic first-claim-wins guard — owned by core so the
  // adapter does not re-derive its own divergent compare-and-set (D4).
  isClaimableBy,
  // Phase 1 of the file-less roadmap proposal: tracker types have their
  // canonical home in core/roadmap/tracker/ (source path); re-exported
  // from the @harness-engineering/core package root for consumers.
  type Issue,
  type IssueTrackerClient,
  type TrackerConfig,
  type BlockerRef,
} from '@harness-engineering/core';
import {
  type Result,
  Ok,
  Err,
  type FeatureStatus,
  type RoadmapFeature,
} from '@harness-engineering/types';

/**
 * Adapter for using a markdown roadmap file as an issue tracker.
 *
 * This adapter parses a standard Harness roadmap file, extracts features,
 * and maps them to the internal Issue model using deterministic hashing
 * for identifiers.
 */
export class RoadmapTrackerAdapter implements IssueTrackerClient {
  private config: TrackerConfig;

  /**
   * Creates a new RoadmapTrackerAdapter.
   *
   * @param config - The tracker configuration including the file path
   */
  constructor(config: TrackerConfig) {
    this.config = config;
    if (!config.filePath) {
      throw new Error('RoadmapTrackerAdapter requires a filePath in TrackerConfig');
    }
  }

  /**
   * Fetches all issues that are in an "active" state according to the config.
   */
  async fetchCandidateIssues(): Promise<Result<Issue[], Error>> {
    return this.fetchIssuesByStates(this.config.activeStates);
  }

  /**
   * Fetches issues that match any of the given state names.
   *
   * @param stateNames - List of statuses to filter by
   */
  async fetchIssuesByStates(stateNames: string[]): Promise<Result<Issue[], Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));
      const roadmapResult = await this.loadRoadmap();
      if (!roadmapResult.ok) return roadmapResult as unknown as Result<Issue[], Error>;

      const issues: Issue[] = [];
      for (const milestone of roadmapResult.value.milestones) {
        for (const feature of milestone.features) {
          if (stateNames.includes(feature.status)) {
            issues.push(this.mapFeatureToIssue(feature));
          }
        }
      }

      return Ok(issues);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Transitions a roadmap feature into the first configured terminal state
   * and rewrites the markdown file. Idempotent: if the feature is already
   * in a terminal state, this is a no-op.
   *
   * The orchestrator calls this after a successful agent exit so the feature
   * is no longer returned by `fetchCandidateIssues` on the next tick — and,
   * critically, after an orchestrator restart.
   */
  async markIssueComplete(issueId: string): Promise<Result<void, Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));
      const terminal = this.config.terminalStates[0];
      if (!terminal) {
        return Err(new Error('Tracker config has no terminalStates; cannot mark complete'));
      }

      const store = this.resolveStore();
      const roadmapResult = await store.load();
      if (!roadmapResult.ok) return roadmapResult as unknown as Result<void, Error>;

      const roadmap = roadmapResult.value;
      const before = structuredClone(roadmap);
      const target = this.findFeatureById(roadmap.milestones, issueId);

      // Missing target (removed between dispatch and completion) and
      // already-terminal both mean nothing to write. In-memory `completed`
      // still prevents intra-session re-dispatch in both cases.
      if (!target) return Ok(undefined);
      const normalizedTerminal = this.config.terminalStates.map((s) => s.toLowerCase());
      if (normalizedTerminal.includes(target.status.toLowerCase())) return Ok(undefined);

      // Route the terminal transition through the lifecycle authority so the
      // assignee auto-clears (and an `unassigned` history record is logged).
      // A bare `target.status = terminal` would leave a `done` row still
      // carrying `assignee = orchestrator-*`, violating RMH005.
      const now = new Date().toISOString();
      setFeatureStatus(roadmap, target, terminal as FeatureStatus, now.slice(0, 10));
      const persisted = await applyRoadmapDiff(store, before, roadmap);
      if (!persisted.ok) return persisted;
      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Claims an issue by transitioning its status to "in-progress" and
   * writing the orchestratorId into the assignee field. Idempotent if
   * already claimed by the same orchestratorId.
   */
  async claimIssue(issueId: string, orchestratorId: string): Promise<Result<void, Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));

      const store = this.resolveStore();
      const roadmapResult = await store.load();
      if (!roadmapResult.ok) return roadmapResult as unknown as Result<void, Error>;

      const roadmap = roadmapResult.value;
      const before = structuredClone(roadmap);
      const target = this.findFeatureById(roadmap.milestones, issueId);
      if (!target) return Ok(undefined);

      // Compare-and-set: never overwrite an assignment held by a third
      // party (another orchestrator OR a human). The no-op write lets the
      // post-claim verify in ClaimManager.claimAndVerify read back the
      // unchanged file and return 'rejected'. The rule lives in core
      // (isClaimableBy) so there is exactly one definition of it (D4); it is
      // intentionally stricter than core claim()'s reassign-on-non-in-progress
      // path, which the human-driven manage_roadmap update uses.
      if (!isClaimableBy(target, orchestratorId)) {
        return Ok(undefined);
      }

      // Idempotent: already claimed by same orchestrator
      if (target.status === 'in-progress' && target.assignee === orchestratorId) {
        return Ok(undefined);
      }

      // Route the status+assignee write through the lifecycle authority so the
      // `assignee ≠ null ⟺ in-progress` invariant (and its history record) is
      // owned in one place. The compare-and-set guards above already preserve
      // the rejected/idempotent semantics ClaimManager relies on.
      const now = new Date().toISOString();
      claimFeature(roadmap, target, orchestratorId, now.slice(0, 10));
      target.updatedAt = now;
      const persisted = await applyRoadmapDiff(store, before, roadmap);
      if (!persisted.ok) return persisted;
      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Releases a claimed issue by transitioning back to the first active
   * state and clearing the assignee field.
   */
  async releaseIssue(issueId: string): Promise<Result<void, Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));

      const activeState = this.config.activeStates[0];
      if (!activeState) {
        return Err(new Error('Tracker config has no activeStates; cannot release'));
      }

      const store = this.resolveStore();
      const roadmapResult = await store.load();
      if (!roadmapResult.ok) return roadmapResult as unknown as Result<void, Error>;

      const roadmap = roadmapResult.value;
      const before = structuredClone(roadmap);
      const target = this.findFeatureById(roadmap.milestones, issueId);
      if (!target) return Ok(undefined);

      // Already in an active state and unassigned -- no-op
      if (this.config.activeStates.includes(target.status) && target.assignee === null) {
        return Ok(undefined);
      }

      // Route the release through the lifecycle authority so the assignee is
      // cleared with an `unassigned` history record (audit symmetry with
      // claimIssue/markIssueComplete), rather than a bare field mutation that
      // skips the history. activeStates[0] is a non-in-progress state, so
      // setStatus clears the assignee.
      const now = new Date().toISOString();
      setFeatureStatus(roadmap, target, activeState as FeatureStatus, now.slice(0, 10));
      target.updatedAt = null;
      const persisted = await applyRoadmapDiff(store, before, roadmap);
      if (!persisted.ok) return persisted;
      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Resolve the roadmap store anchored on the configured aggregate file path.
   * The shard backend is chosen when a sibling `roadmap.d/` exists next to the
   * file; otherwise the monolith file is read/written whole. Callers guard
   * `this.config.filePath` before invoking.
   */
  private resolveStore() {
    return resolveRoadmapStoreForFile({ roadmapPath: this.config.filePath! });
  }

  /** Load the roadmap via the store (sharded or monolith), returning a Result. */
  private loadRoadmap() {
    return this.resolveStore().load();
  }

  private findFeatureById(
    milestones: { features: RoadmapFeature[] }[],
    issueId: string
  ): RoadmapFeature | null {
    for (const milestone of milestones) {
      for (const feature of milestone.features) {
        if (this.generateId(feature.name) === issueId) return feature;
      }
    }
    return null;
  }

  /**
   * Fetches full issue details for a list of identifiers.
   *
   * @param issueIds - List of issue IDs to fetch
   */
  async fetchIssueStatesByIds(issueIds: string[]): Promise<Result<Map<string, Issue>, Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));
      const roadmapResult = await this.loadRoadmap();
      if (!roadmapResult.ok) return roadmapResult as unknown as Result<Map<string, Issue>, Error>;

      const issueMap = new Map<string, Issue>();
      for (const milestone of roadmapResult.value.milestones) {
        for (const feature of milestone.features) {
          const issue = this.mapFeatureToIssue(feature);
          if (issueIds.includes(issue.id)) {
            issueMap.set(issue.id, issue);
          }
        }
      }

      return Ok(issueMap);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Maps a raw RoadmapFeature from the parser to the unified Issue model.
   */
  private mapFeatureToIssue(feature: RoadmapFeature): Issue {
    const id = this.generateId(feature.name);
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
      updatedAt: feature.updatedAt ?? null,
      externalId: feature.externalId ?? null,
      assignee: feature.assignee ?? null,
    };
  }

  /**
   * Generates a deterministic, URL-safe identifier for a feature name.
   */
  private generateId(name: string): string {
    const hash = createHash('sha256').update(name).digest('hex').slice(0, 8);
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 20);
    return `${sanitized}-${hash}`;
  }
}
