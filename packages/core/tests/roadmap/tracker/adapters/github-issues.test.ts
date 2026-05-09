import { describe, it, expect, vi } from 'vitest';
import { GitHubIssuesTrackerAdapter } from '../../../../src/roadmap/tracker/adapters/github-issues';
import { ETagStore } from '../../../../src/roadmap/tracker/etag-store';
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

/** Returns a fetch mock that responds differently per call in sequence. */
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
    body: serializeBodyBlock('Sum 1', { spec: 'docs/specs/x.md' }),
    labels: [{ name: 'harness-managed' }],
    assignees: [],
    milestone: null,
    created_at: '2026-05-09T00:00:00Z',
    updated_at: '2026-05-09T00:00:00Z',
    ...over,
  };
}

describe('GitHubIssuesTrackerAdapter — fetchAll', () => {
  it('a) Returns { features, etag } from a single page of issues with body-metadata blocks', async () => {
    const fetchFn = mockFetchSequence({
      status: 200,
      body: [rawIssue({ number: 1 }), rawIssue({ number: 2, title: 'F2' })],
      etag: 'W/"abc"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.fetchAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.features).toHaveLength(2);
      expect(r.value.features[0]!.externalId).toBe('github:o/r#1');
      expect(r.value.features[0]!.spec).toBe('docs/specs/x.md');
      expect(r.value.etag).toBe('W/"abc"');
    }
  });

  it('b) Resolves blockedBy names → externalIds via the same response', async () => {
    const fetchFn = mockFetchSequence({
      status: 200,
      body: [
        rawIssue({
          number: 10,
          title: 'A',
          body: serializeBodyBlock('A summary', {}),
        }),
        rawIssue({
          number: 11,
          title: 'B',
          body: serializeBodyBlock('B summary', { blocked_by: ['A'] }),
        }),
      ],
      etag: 'W/"x"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.fetchAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      const featB = r.value.features.find((f) => f.name === 'B');
      expect(featB?.blockedBy).toEqual(['github:o/r#10']);
    }
  });

  it('c) Cache hit + 304 returns cached features without re-parse', async () => {
    const cache = new ETagStore();
    const fetchFn1 = mockFetchSequence({
      status: 200,
      body: [rawIssue({ number: 1 })],
      etag: 'W/"first"',
    });
    const adapter1 = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn: fetchFn1,
      etagStore: cache,
    });
    await adapter1.fetchAll();

    // Second call: server returns 304
    const fetchFn2 = mockFetchSequence({ status: 304, body: null, etag: 'W/"first"' });
    const adapter2 = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn: fetchFn2,
      etagStore: cache,
    });
    const r = await adapter2.fetchAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.features).toHaveLength(1);
      expect(r.value.features[0]!.externalId).toBe('github:o/r#1');
    }
    // Verify If-None-Match header was sent
    const call = (fetchFn2 as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const init = call[1] as { headers: Record<string, string> };
    expect(init.headers['If-None-Match']).toBe('W/"first"');
  });

  it('d) Cache hit but server returns 200 with new etag → replaces cache', async () => {
    const cache = new ETagStore();
    cache.set('list:all', 'W/"old"', [{ name: 'old' }]);
    const fetchFn = mockFetchSequence({
      status: 200,
      body: [rawIssue({ number: 5, title: 'NewF' })],
      etag: 'W/"new"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
      etagStore: cache,
    });
    const r = await adapter.fetchAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.features[0]!.name).toBe('NewF');
      expect(r.value.etag).toBe('W/"new"');
    }
    expect(cache.get('list:all')?.etag).toBe('W/"new"');
  });

  it('e) Skips PRs (pull_request field present)', async () => {
    const fetchFn = mockFetchSequence({
      status: 200,
      body: [
        rawIssue({ number: 1 }),
        rawIssue({ number: 2, pull_request: { url: 'http://x' } }),
        rawIssue({ number: 3 }),
      ],
      etag: 'W/"a"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.fetchAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.features).toHaveLength(2);
      expect(r.value.features.map((f) => f.externalId)).toEqual(['github:o/r#1', 'github:o/r#3']);
    }
  });

  it('f) Sorts by createdAt ascending', async () => {
    const fetchFn = mockFetchSequence({
      status: 200,
      body: [
        rawIssue({ number: 1, created_at: '2026-05-08T00:00:00Z', title: 'NewerB' }),
        rawIssue({ number: 2, created_at: '2026-05-01T00:00:00Z', title: 'OldA' }),
        rawIssue({ number: 3, created_at: '2026-05-09T00:00:00Z', title: 'NewestC' }),
      ],
      etag: 'W/"a"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.fetchAll();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.features.map((f) => f.name)).toEqual(['OldA', 'NewerB', 'NewestC']);
    }
  });
});

describe('GitHubIssuesTrackerAdapter — fetchById', () => {
  it('a) Maps native fields + body block correctly', async () => {
    const fetchFn = mockFetchSequence({
      status: 200,
      body: rawIssue({
        number: 42,
        title: 'Hello',
        assignees: [{ login: 'alice' }],
        milestone: { title: 'M1' },
        body: serializeBodyBlock('Hello summary', { priority: 'P1' }),
      }),
      etag: 'W/"e1"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.fetchById('github:o/r#42');
    expect(r.ok).toBe(true);
    if (r.ok && r.value) {
      expect(r.value.feature.name).toBe('Hello');
      expect(r.value.feature.assignee).toBe('@alice');
      expect(r.value.feature.priority).toBe('P1');
      expect(r.value.feature.milestone).toBe('M1');
      expect(r.value.etag).toBe('W/"e1"');
    }
  });

  it('b) Returns Ok(null) on 404', async () => {
    const fetchFn = mockFetchSequence({ status: 404, body: { message: 'Not Found' } });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.fetchById('github:o/r#999');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('c) On 304 with cached entry, returns cached value', async () => {
    const cache = new ETagStore();
    const fetchFn1 = mockFetchSequence({
      status: 200,
      body: rawIssue({ number: 7 }),
      etag: 'W/"e7"',
    });
    const adapter1 = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn: fetchFn1,
      etagStore: cache,
    });
    await adapter1.fetchById('github:o/r#7');

    const fetchFn2 = mockFetchSequence({ status: 304, body: null, etag: 'W/"e7"' });
    const adapter2 = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn: fetchFn2,
      etagStore: cache,
    });
    const r = await adapter2.fetchById('github:o/r#7');
    expect(r.ok).toBe(true);
    if (r.ok && r.value) {
      expect(r.value.feature.externalId).toBe('github:o/r#7');
      expect(r.value.etag).toBe('W/"e7"');
    }
  });

  it('d) On Err response (500), returns Err', async () => {
    const fetchFn = mockFetchSequence(
      { status: 500, body: { message: 'boom' } },
      { status: 500, body: { message: 'boom' } },
      { status: 500, body: { message: 'boom' } },
      { status: 500, body: { message: 'boom' } },
      { status: 500, body: { message: 'boom' } },
      { status: 500, body: { message: 'boom' } }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
      maxRetries: 0,
      baseDelayMs: 1,
    });
    const r = await adapter.fetchById('github:o/r#1');
    expect(r.ok).toBe(false);
  });
});

describe('GitHubIssuesTrackerAdapter — fetchByStatus', () => {
  it('filters fetchAll() by status', async () => {
    const fetchFn = mockFetchSequence({
      status: 200,
      body: [
        rawIssue({ number: 1, state: 'open', labels: [{ name: 'harness-managed' }] }),
        rawIssue({
          number: 2,
          state: 'closed',
          labels: [{ name: 'harness-managed' }],
        }),
        rawIssue({
          number: 3,
          state: 'open',
          labels: [{ name: 'harness-managed' }, { name: 'in-progress' }],
        }),
      ],
      etag: 'W/"a"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.fetchByStatus(['done']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toHaveLength(1);
      expect(r.value[0]!.externalId).toBe('github:o/r#2');
    }
  });
});
