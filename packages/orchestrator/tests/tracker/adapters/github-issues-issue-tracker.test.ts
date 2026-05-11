import { describe, it, expect, vi } from 'vitest';
import { Ok, Err, type Result, type FeatureStatus } from '@harness-engineering/types';
import { GitHubIssuesIssueTrackerAdapter } from '../../../src/tracker/adapters/github-issues-issue-tracker';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  HistoryEvent,
  FeaturePatch,
  NewFeatureInput,
  TrackerConfig,
} from '@harness-engineering/core';
import { ConflictError } from '@harness-engineering/core';

const baseConfig: TrackerConfig = {
  kind: 'github-issues',
  projectSlug: 'owner/repo',
  activeStates: ['planned', 'in-progress'],
  terminalStates: ['done'],
};

const tf = (over: Partial<TrackedFeature> = {}): TrackedFeature => ({
  externalId: over.externalId ?? 'github:owner/repo#1',
  name: over.name ?? 'Feature One',
  status: over.status ?? 'planned',
  summary: over.summary ?? 'summary',
  spec: null,
  plans: [],
  blockedBy: [],
  assignee: null,
  priority: null,
  milestone: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: null,
});

interface StubOverrides {
  fetchAll?: () => Promise<Result<{ features: TrackedFeature[]; etag: string | null }, Error>>;
  fetchById?: () => Promise<Result<{ feature: TrackedFeature; etag: string } | null, Error>>;
  fetchByStatus?: () => Promise<Result<TrackedFeature[], Error>>;
  create?: (feature: NewFeatureInput) => Promise<Result<TrackedFeature, Error>>;
  update?: (
    externalId: string,
    patch: FeaturePatch
  ) => Promise<Result<TrackedFeature, ConflictError | Error>>;
  claim?: (
    externalId: string,
    assignee: string
  ) => Promise<Result<TrackedFeature, ConflictError | Error>>;
  release?: (externalId: string) => Promise<Result<TrackedFeature, ConflictError | Error>>;
  complete?: (externalId: string) => Promise<Result<TrackedFeature, ConflictError | Error>>;
}

function makeClient(overrides: StubOverrides = {}): RoadmapTrackerClient {
  return {
    fetchAll: overrides.fetchAll ?? (async () => Ok({ features: [], etag: null })),
    fetchById: overrides.fetchById ?? (async () => Ok(null)),
    fetchByStatus: overrides.fetchByStatus ?? (async () => Ok([])),
    create:
      overrides.create ??
      (async (f: NewFeatureInput) => Ok(tf({ name: f.name, summary: f.summary }))),
    update: overrides.update ?? (async () => Ok(tf())),
    claim: overrides.claim ?? (async () => Ok(tf({ status: 'in-progress', assignee: 'a' }))),
    release: overrides.release ?? (async () => Ok(tf())),
    complete: overrides.complete ?? (async () => Ok(tf({ status: 'done' }))),
    appendHistory: async (_id: string, _e: HistoryEvent) => Ok(undefined as void),
    fetchHistory: async () => Ok([]),
  };
}

describe('GitHubIssuesIssueTrackerAdapter', () => {
  it('fetchCandidateIssues delegates to RoadmapTrackerClient.fetchByStatus(activeStates) and maps to Issue', async () => {
    const fetchByStatus = vi.fn(async (_s: FeatureStatus[]) =>
      Ok([
        tf({ externalId: 'github:owner/repo#10', name: 'Alpha', status: 'planned' }),
        tf({ externalId: 'github:owner/repo#11', name: 'Beta', status: 'in-progress' }),
      ])
    );
    const adapter = new GitHubIssuesIssueTrackerAdapter(makeClient({ fetchByStatus }), baseConfig);
    const r = await adapter.fetchCandidateIssues();
    expect(r.ok).toBe(true);
    if (!r.ok) throw r.error;
    expect(fetchByStatus).toHaveBeenCalledWith(['planned', 'in-progress']);
    expect(r.value).toHaveLength(2);
    expect(r.value[0]?.title).toBe('Alpha');
    expect(r.value[0]?.externalId).toBe('github:owner/repo#10');
    expect(r.value[0]?.id).toBe('github:owner/repo#10');
    expect(r.value[0]?.state).toBe('planned');
  });

  it('fetchIssuesByStates calls fetchByStatus with arbitrary state list and maps', async () => {
    const fetchByStatus = vi.fn(async () => Ok([tf({ name: 'X', status: 'backlog' })]));
    const adapter = new GitHubIssuesIssueTrackerAdapter(makeClient({ fetchByStatus }), baseConfig);
    const r = await adapter.fetchIssuesByStates(['backlog']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw r.error;
    expect(fetchByStatus).toHaveBeenCalledWith(['backlog']);
    expect(r.value[0]?.title).toBe('X');
  });

  it('fetchIssuesByStates propagates errors from fetchByStatus', async () => {
    const fetchByStatus = vi.fn(async () => Err(new Error('boom')));
    const adapter = new GitHubIssuesIssueTrackerAdapter(makeClient({ fetchByStatus }), baseConfig);
    const r = await adapter.fetchIssuesByStates(['planned']);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected error');
    expect(r.error.message).toBe('boom');
  });

  it('fetchCandidateIssues propagates errors from fetchByStatus', async () => {
    const fetchByStatus = vi.fn(async () => Err(new Error('network')));
    const adapter = new GitHubIssuesIssueTrackerAdapter(makeClient({ fetchByStatus }), baseConfig);
    const r = await adapter.fetchCandidateIssues();
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected error');
    expect(r.error.message).toBe('network');
  });

  it('fetchIssueStatesByIds resolves via fetchAll and filters by id', async () => {
    const features = [
      tf({ externalId: 'github:owner/repo#1', name: 'A' }),
      tf({ externalId: 'github:owner/repo#2', name: 'B' }),
      tf({ externalId: 'github:owner/repo#3', name: 'C' }),
    ];
    const adapter = new GitHubIssuesIssueTrackerAdapter(
      makeClient({ fetchAll: async () => Ok({ features, etag: null }) }),
      baseConfig
    );
    const r = await adapter.fetchIssueStatesByIds(['github:owner/repo#1', 'github:owner/repo#3']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw r.error;
    expect(r.value.size).toBe(2);
    expect(r.value.get('github:owner/repo#1')?.title).toBe('A');
    expect(r.value.get('github:owner/repo#3')?.title).toBe('C');
  });

  it('claimIssue calls client.claim with externalId and orchestratorId', async () => {
    const claim = vi.fn(async () => Ok(tf({ status: 'in-progress', assignee: 'orch-1' })));
    const adapter = new GitHubIssuesIssueTrackerAdapter(makeClient({ claim }), baseConfig);
    const r = await adapter.claimIssue('github:owner/repo#5', 'orch-1');
    expect(r.ok).toBe(true);
    expect(claim).toHaveBeenCalledWith('github:owner/repo#5', 'orch-1');
  });

  it('claimIssue propagates ConflictError as a generic Error to the IssueTrackerClient contract', async () => {
    // Build a real ConflictError so we can assert the full propagated shape:
    // externalId round-trips, diff is preserved, and serverUpdatedAt carries
    // the server-side timestamp (added in cleanup-batch-1, commit c3dd9dc7).
    // The orchestrator adapter MUST forward the ConflictError instance
    // unchanged — losing fields here would break the dashboard's conflict-
    // resolution UX which reads externalId/diff/serverUpdatedAt off the error.
    const expectedDiff = {
      assignee: { ours: 'orch-1' as const, theirs: 'someone-else' as const },
    };
    const expectedServerUpdatedAt = '2026-05-09T12:00:00Z';
    const claim = vi.fn(async () =>
      Err(
        new ConflictError('github:owner/repo#1', expectedDiff, expectedServerUpdatedAt, 'conflict')
      )
    );
    const adapter = new GitHubIssuesIssueTrackerAdapter(makeClient({ claim }), baseConfig);
    const r = await adapter.claimIssue('github:owner/repo#1', 'orch-1');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected error');
    expect(r.error).toBeInstanceOf(ConflictError);
    // Type-narrow to ConflictError so we can assert the propagated fields.
    const err = r.error as ConflictError;
    expect(err.externalId).toBe('github:owner/repo#1');
    expect(err.diff).toEqual(expectedDiff);
    expect(err.serverUpdatedAt).toBe(expectedServerUpdatedAt);
    expect(typeof err.serverUpdatedAt === 'string' || err.serverUpdatedAt === null).toBe(true);
  });

  it('releaseIssue calls client.release', async () => {
    const release = vi.fn(async () => Ok(tf()));
    const adapter = new GitHubIssuesIssueTrackerAdapter(makeClient({ release }), baseConfig);
    const r = await adapter.releaseIssue('github:owner/repo#7');
    expect(r.ok).toBe(true);
    expect(release).toHaveBeenCalledWith('github:owner/repo#7');
  });

  it('markIssueComplete calls client.complete', async () => {
    const complete = vi.fn(async () => Ok(tf({ status: 'done' })));
    const adapter = new GitHubIssuesIssueTrackerAdapter(makeClient({ complete }), baseConfig);
    const r = await adapter.markIssueComplete('github:owner/repo#9');
    expect(r.ok).toBe(true);
    expect(complete).toHaveBeenCalledWith('github:owner/repo#9');
  });
});
