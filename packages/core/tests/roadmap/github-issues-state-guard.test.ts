import { describe, it, expect, vi } from 'vitest';
import { GitHubIssuesSyncAdapter } from '../../src/roadmap/adapters/github-issues';
import type { TrackerSyncConfig, RoadmapFeature } from '@harness-engineering/types';

/**
 * `syncIssueState: false` on the sync adapter — the CI-safe write policy.
 *
 * `statusMap` maps `done -> closed`, so a mis-set roadmap row can close a live
 * issue. With the guard on, the PATCH body must not carry `state` at all, while
 * still carrying `labels` (label convergence is the entire point of the mode).
 */

const CONFIG: TrackerSyncConfig = {
  kind: 'github',
  repo: 'owner/repo',
  labels: ['harness-managed'],
  statusMap: {
    backlog: 'open',
    planned: 'open',
    'in-progress': 'open',
    done: 'closed',
    blocked: 'open',
    'needs-human': 'open',
  },
};

function makeFeature(overrides?: Partial<RoadmapFeature>): RoadmapFeature {
  return {
    name: 'Test Feature',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'A test feature',
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
    ...overrides,
  };
}

/** A fetch mock that always succeeds, recording the PATCH bodies it saw. */
function recordingFetch(): { fetchFn: typeof fetch; bodies: () => Array<Record<string, unknown>> } {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => '{}',
    json: async () => ({ number: 1, html_url: 'https://github.com/owner/repo/issues/1' }),
  });
  return {
    fetchFn: fn as unknown as typeof fetch,
    bodies: () =>
      fn.mock.calls
        .filter((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')
        .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Record<string, unknown>),
  };
}

describe('GitHubIssuesSyncAdapter.updateTicket() — issue-state guard', () => {
  it('omits `state` entirely but still syncs labels when syncIssueState is false', async () => {
    const { fetchFn, bodies } = recordingFetch();
    const adapter = new GitHubIssuesSyncAdapter({ token: 't', config: CONFIG, fetchFn });

    const r = await adapter.updateTicket(
      'github:owner/repo#1',
      makeFeature({ status: 'done' }),
      undefined,
      { syncIssueState: false }
    );

    expect(r.ok).toBe(true);
    const [patch] = bodies();
    expect(patch).toBeDefined();
    expect('state' in patch!).toBe(false);
    expect(patch!.labels).toEqual(['harness-managed']);
  });

  it('cannot close an issue even when the row says done', async () => {
    const { fetchFn, bodies } = recordingFetch();
    const adapter = new GitHubIssuesSyncAdapter({ token: 't', config: CONFIG, fetchFn });

    await adapter.updateTicket('github:owner/repo#1', makeFeature({ status: 'done' }), undefined, {
      syncIssueState: false,
    });

    for (const body of bodies()) {
      expect(body.state).toBeUndefined();
    }
  });

  it('patches `state` when the guard is off (default / omitted options)', async () => {
    const { fetchFn, bodies } = recordingFetch();
    const adapter = new GitHubIssuesSyncAdapter({ token: 't', config: CONFIG, fetchFn });

    await adapter.updateTicket('github:owner/repo#1', makeFeature({ status: 'done' }));

    const [patch] = bodies();
    expect(patch!.state).toBe('closed');
  });

  it('patches `state` when syncIssueState is explicitly true', async () => {
    const { fetchFn, bodies } = recordingFetch();
    const adapter = new GitHubIssuesSyncAdapter({ token: 't', config: CONFIG, fetchFn });

    await adapter.updateTicket(
      'github:owner/repo#1',
      makeFeature({ status: 'in-progress' }),
      undefined,
      { syncIssueState: true }
    );

    const [patch] = bodies();
    expect(patch!.state).toBe('open');
    expect(patch!.labels).toEqual(['harness-managed', 'in-progress']);
  });

  it('leaves non-status fields untouched by the guard', async () => {
    const { fetchFn, bodies } = recordingFetch();
    const adapter = new GitHubIssuesSyncAdapter({ token: 't', config: CONFIG, fetchFn });

    await adapter.updateTicket(
      'github:owner/repo#1',
      { name: 'Renamed', summary: 'New summary' },
      undefined,
      { syncIssueState: false }
    );

    const [patch] = bodies();
    expect(patch!.title).toBe('Renamed');
    expect(patch!.body).toBe('New summary');
    expect('state' in patch!).toBe(false);
  });
});
