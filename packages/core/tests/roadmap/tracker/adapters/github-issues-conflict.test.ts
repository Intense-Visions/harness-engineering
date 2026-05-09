import { describe, it, expect, vi } from 'vitest';
import { GitHubIssuesTrackerAdapter } from '../../../../src/roadmap/tracker/adapters/github-issues';
import { ETagStore } from '../../../../src/roadmap/tracker/etag-store';
import { ConflictError } from '../../../../src/roadmap/tracker/client';
import { serializeBodyBlock } from '../../../../src/roadmap/tracker/body-metadata';

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

function mockFetchSequence(
  ...responses: Array<{ status: number; body: unknown; etag?: string }>
): typeof fetch {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce(mockResponse(r.status, r.body, r.etag));
  }
  return fn as unknown as typeof fetch;
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

describe('GitHubIssuesTrackerAdapter — claim', () => {
  it('a) Plain success: assignee + in-progress label', async () => {
    const fetchFn = mockFetchSequence(
      // PATCH (no body-rebuild needed; only assignee + status)
      {
        status: 200,
        body: rawIssue({
          number: 1,
          assignees: [{ login: 'alice' }],
          labels: [{ name: 'harness-managed' }, { name: 'in-progress' }],
        }),
        etag: 'W/"e"',
      }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.claim('github:o/r#1', '@alice');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.assignee).toBe('@alice');
    }
  });

  it('b) Idempotent: already claimed by same assignee, ifMatch matches → no PATCH issued', async () => {
    const fetchFn = mockFetchSequence(
      // refetch shows same assignee
      {
        status: 200,
        body: rawIssue({
          number: 1,
          assignees: [{ login: 'alice' }],
          labels: [{ name: 'harness-managed' }, { name: 'in-progress' }],
        }),
        etag: 'W/"e"',
      }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.claim('github:o/r#1', '@alice', 'W/"e"');
    expect(r.ok).toBe(true);
    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    // Only the refetch GET — no PATCH
    expect(calls).toHaveLength(1);
    expect((calls[0]![1] as { method: string }).method).toBe('GET');
  });

  it('c) Conflict: claimed by someone else → ConflictError, no PATCH', async () => {
    const fetchFn = mockFetchSequence({
      status: 200,
      body: rawIssue({
        number: 1,
        assignees: [{ login: 'bob' }],
        labels: [{ name: 'harness-managed' }, { name: 'in-progress' }],
      }),
      etag: 'W/"e"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.claim('github:o/r#1', '@alice', 'W/"stale"');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(ConflictError);
    }
    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
  });

  it('d) Stale ifMatch but refetch shows same state → still works (passes through to PATCH path)', async () => {
    const fetchFn = mockFetchSequence(
      // refetch: unassigned, planned
      {
        status: 200,
        body: rawIssue({
          number: 1,
          state: 'open',
          assignees: [],
          labels: [{ name: 'harness-managed' }, { name: 'planned' }],
        }),
        etag: 'W/"current"',
      },
      // PATCH
      {
        status: 200,
        body: rawIssue({
          number: 1,
          assignees: [{ login: 'alice' }],
          labels: [{ name: 'harness-managed' }, { name: 'in-progress' }],
        }),
        etag: 'W/"new"',
      }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.claim('github:o/r#1', '@alice', 'W/"stale"');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.assignee).toBe('@alice');
  });

  it('e) Stale ifMatch and refetch shows external change to spec → conflict', async () => {
    // status differences won't conflict per refetchAndCompare (only terminal-sticky); but a status mismatch
    // with non-conflicting non-terminal changes should still go through. To get a conflict on claim
    // we need server.assignee already set to someone else. We've covered that in (c). Use another field
    // diff: server has a non-null assignee that differs from our patch's assignee.
    const fetchFn = mockFetchSequence({
      status: 200,
      body: rawIssue({
        number: 1,
        assignees: [{ login: 'someone-else' }],
        labels: [{ name: 'harness-managed' }, { name: 'in-progress' }],
      }),
      etag: 'W/"current"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.claim('github:o/r#1', '@alice', 'W/"stale"');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(ConflictError);
  });
});

describe('GitHubIssuesTrackerAdapter — release', () => {
  it('a) Plain success: clear assignees, drop in-progress label', async () => {
    const fetchFn = mockFetchSequence(
      // pre-PATCH GET (priorAssignee capture for history attribution)
      {
        status: 200,
        body: rawIssue({
          number: 1,
          state: 'open',
          assignees: [{ login: 'alice' }],
          labels: [{ name: 'harness-managed' }, { name: 'in-progress' }],
        }),
        etag: 'W/"a"',
      },
      // PATCH
      {
        status: 200,
        body: rawIssue({
          number: 1,
          state: 'open',
          assignees: [],
          labels: [{ name: 'harness-managed' }],
        }),
        etag: 'W/"e"',
      },
      // history POST (best-effort)
      { status: 201, body: { id: 1 } }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.release('github:o/r#1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.assignee).toBeNull();
  });

  it('b) Idempotent if not currently in-progress (already released)', async () => {
    const fetchFn = mockFetchSequence(
      // refetch shows already unassigned + backlog
      {
        status: 200,
        body: rawIssue({
          number: 1,
          state: 'open',
          assignees: [],
          labels: [{ name: 'harness-managed' }],
        }),
        etag: 'W/"e"',
      }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.release('github:o/r#1', 'W/"e"');
    expect(r.ok).toBe(true);
    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1); // GET only, no PATCH
  });

  it('c) Conflict: claimed by someone else (we should not release another claim)', async () => {
    const fetchFn = mockFetchSequence({
      status: 200,
      body: rawIssue({
        number: 1,
        assignees: [{ login: 'someone-else' }],
        labels: [{ name: 'harness-managed' }, { name: 'in-progress' }],
      }),
      etag: 'W/"e"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.release('github:o/r#1', 'W/"stale"');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(ConflictError);
  });
});

describe('GitHubIssuesTrackerAdapter — complete', () => {
  it('a) Plain success: closes issue, transitions status', async () => {
    const fetchFn = mockFetchSequence(
      // pre-PATCH GET (priorAssignee capture)
      {
        status: 200,
        body: rawIssue({
          number: 1,
          state: 'open',
          assignees: [{ login: 'alice' }],
          labels: [{ name: 'harness-managed' }, { name: 'in-progress' }],
        }),
        etag: 'W/"a"',
      },
      // PATCH
      {
        status: 200,
        body: rawIssue({
          number: 1,
          state: 'closed',
          labels: [{ name: 'harness-managed' }],
        }),
        etag: 'W/"e"',
      },
      // history POST (best-effort)
      { status: 201, body: { id: 1 } }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.complete('github:o/r#1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe('done');
  });

  it('b) Idempotent if already done', async () => {
    const fetchFn = mockFetchSequence({
      status: 200,
      body: rawIssue({
        number: 1,
        state: 'closed',
        labels: [{ name: 'harness-managed' }],
      }),
      etag: 'W/"e"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.complete('github:o/r#1', 'W/"e"');
    expect(r.ok).toBe(true);
    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1); // refetch only, no PATCH
  });

  it("c) 'done' is terminal-sticky: server already done, ifMatch implies in-progress → idempotent success (no PATCH)", async () => {
    // The refetchAndCompare rule: if server.status === 'done' AND patch.status === 'done', idempotent=true.
    // The caller's stale ifMatch view ("in-progress") doesn't matter; only patch + server compare.
    const fetchFn = mockFetchSequence({
      status: 200,
      body: rawIssue({
        number: 1,
        state: 'closed',
        labels: [{ name: 'harness-managed' }],
      }),
      etag: 'W/"current"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
      etagStore: new ETagStore(),
    });
    const r = await adapter.complete('github:o/r#1', 'W/"stale"');
    expect(r.ok).toBe(true);
    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
  });
});
