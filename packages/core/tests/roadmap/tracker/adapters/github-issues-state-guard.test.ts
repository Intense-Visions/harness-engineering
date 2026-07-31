import { describe, it, expect, vi } from 'vitest';
import { GitHubIssuesTrackerAdapter } from '../../../../src/roadmap/tracker/adapters/github-issues';
import { serializeBodyBlock } from '../../../../src/roadmap/tracker/body-metadata';

/**
 * `syncIssueState: false` on the tracker client — the CI-safe write policy for
 * `buildIssuePatchBody`.
 *
 * Two invariants are load-bearing here and must hold TOGETHER:
 *
 * 1. With the guard on, the PATCH body carries no `state` key, so an unattended
 *    sync can never close or reopen an issue.
 * 2. The pre-existing label-preservation behaviour is unchanged: labels are
 *    rebuilt from a fresh GET (dropping only prior status labels), and label
 *    sync is SKIPPED entirely when that GET fails. Setting a partial label array
 *    would make GitHub wipe every existing label — including the
 *    `harness-managed` selector, silently hiding the issue from future fetches.
 *    That was a real bug; these tests pin it shut on both guard settings.
 */

function mockResponse(status: number, body: unknown, etag?: string) {
  const headers = new Headers();
  if (etag) headers.set('ETag', etag);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function rawIssue(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    number: 1,
    title: 'F1',
    state: 'open',
    body: serializeBodyBlock('Sum 1', {}),
    labels: [{ name: 'harness-managed' }],
    assignees: [],
    milestone: null,
    created_at: '2026-05-09T00:00:00Z',
    updated_at: '2026-05-09T00:00:00Z',
    ...over,
  };
}

/** Recording fetch mock: sequenced responses in, observed PATCH bodies out. */
function recordingFetch(...responses: Array<{ status: number; body: unknown; etag?: string }>) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(mockResponse(r.status, r.body, r.etag));
  return {
    fetchFn: fn as unknown as typeof fetch,
    patchBodies: () =>
      fn.mock.calls
        .filter((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')
        .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Record<string, unknown>),
  };
}

describe('buildIssuePatchBody() — syncIssueState: false', () => {
  it('omits `state` while still syncing the status label', async () => {
    const { fetchFn, patchBodies } = recordingFetch(
      // GET for label sync
      { status: 200, body: rawIssue({ labels: [{ name: 'harness-managed' }] }) },
      // PATCH
      { status: 200, body: rawIssue({ labels: [{ name: 'in-progress' }] }) }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 't',
      repo: 'owner/repo',
      fetchFn,
      syncIssueState: false,
    });

    const r = await adapter.update('github:owner/repo#1', { status: 'in-progress' });

    expect(r.ok).toBe(true);
    const [patch] = patchBodies();
    expect('state' in patch!).toBe(false);
    expect(patch!.labels).toEqual(['harness-managed', 'in-progress']);
  });

  it('cannot close an issue even for status done', async () => {
    const { fetchFn, patchBodies } = recordingFetch(
      { status: 200, body: rawIssue() },
      { status: 200, body: rawIssue({ state: 'closed' }) }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 't',
      repo: 'owner/repo',
      fetchFn,
      syncIssueState: false,
    });

    await adapter.update('github:owner/repo#1', { status: 'done' });

    const [patch] = patchBodies();
    expect(patch!.state).toBeUndefined();
    // 'done' has no label of its own, so the status labels are simply dropped —
    // but the selector label is preserved.
    expect(patch!.labels).toEqual(['harness-managed']);
  });

  it('patches `state` by default (guard omitted)', async () => {
    const { fetchFn, patchBodies } = recordingFetch(
      { status: 200, body: rawIssue() },
      { status: 200, body: rawIssue({ state: 'closed' }) }
    );
    const adapter = new GitHubIssuesTrackerAdapter({ token: 't', repo: 'owner/repo', fetchFn });

    await adapter.update('github:owner/repo#1', { status: 'done' });

    expect(patchBodies()[0]!.state).toBe('closed');
  });
});

/**
 * Method-routed fetch mock. Needed for the GET-error cases: a 5xx is retried by
 * `GitHubHttp`, which would consume a sequenced mock's later entries, so the
 * mock must answer by method rather than by call order (paired with
 * `maxRetries: 0` to keep the test fast and deterministic).
 */
function routedFetch(routes: { get: { status: number; body: unknown }; patch: unknown }) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return mockResponse(200, routes.patch);
    return mockResponse(routes.get.status, routes.get.body);
  });
  return {
    fetchFn: fn as unknown as typeof fetch,
    patchBodies: () =>
      fn.mock.calls
        .filter((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')
        .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Record<string, unknown>),
  };
}

describe('buildIssuePatchBody() — label preservation is unchanged', () => {
  it('preserves user labels and drops only the prior status label (GET succeeds)', async () => {
    const { fetchFn, patchBodies } = recordingFetch(
      {
        status: 200,
        body: rawIssue({
          labels: [
            { name: 'harness-managed' },
            { name: 'user-added' },
            { name: 'planned' }, // prior status label -> replaced
          ],
        }),
      },
      { status: 200, body: rawIssue() }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 't',
      repo: 'owner/repo',
      fetchFn,
      syncIssueState: false,
    });

    await adapter.update('github:owner/repo#1', { status: 'blocked' });

    expect(patchBodies()[0]!.labels).toEqual(['harness-managed', 'user-added', 'blocked']);
  });

  it('SKIPS the labels field when the GET fails, so no label is ever wiped', async () => {
    const { fetchFn, patchBodies } = routedFetch({
      get: { status: 500, body: { message: 'transient' } }, // label GET blows up
      patch: rawIssue(),
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 't',
      repo: 'owner/repo',
      fetchFn,
      syncIssueState: false,
      maxRetries: 0,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await adapter.update('github:owner/repo#1', { status: 'in-progress' });

    const [patch] = patchBodies();
    expect('labels' in patch!).toBe(false);
    expect('state' in patch!).toBe(false); // guard still holds on the error path
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('still skips the labels field on GET error with the guard OFF (unchanged behaviour)', async () => {
    const { fetchFn, patchBodies } = routedFetch({
      get: { status: 500, body: { message: 'transient' } },
      patch: rawIssue(),
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 't',
      repo: 'owner/repo',
      fetchFn,
      maxRetries: 0,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await adapter.update('github:owner/repo#1', { status: 'in-progress' });

    const [patch] = patchBodies();
    expect('labels' in patch!).toBe(false);
    expect(patch!.state).toBe('open'); // state is independent of labels
    warn.mockRestore();
  });
});
