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

  it('b) blockedBy returns feature names verbatim from the body-meta block', async () => {
    // Per spec §"Body metadata block", blockedBy holds feature **names** as
    // authored in the `blocked_by:` field. The adapter does NOT translate to
    // externalIds — that is a caller concern.
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
      expect(featB?.blockedBy).toEqual(['A']);
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

describe('GitHubIssuesTrackerAdapter — create', () => {
  it('a) POST /issues with title, body=serialized, labels, milestone, assignee', async () => {
    const created = rawIssue({
      number: 99,
      title: 'NewFeat',
      body: 'will be returned',
      labels: [{ name: 'harness-managed' }, { name: 'planned' }],
      assignees: [{ login: 'alice' }],
    });
    const fetchFn = mockFetchSequence({
      status: 201,
      body: created,
      etag: 'W/"new"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.create({
      name: 'NewFeat',
      summary: 'Sum',
      status: 'planned',
      spec: 'docs/specs/x.md',
      plans: ['docs/plans/x.md'],
      assignee: '@alice',
      priority: 'P1',
      milestone: 'M1',
    });
    expect(r.ok).toBe(true);

    const call = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const url = call[0] as string;
    const init = call[1] as { method: string; body: string };
    expect(url).toContain('/repos/o/r/issues');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body) as {
      title: string;
      body: string;
      labels: string[];
      assignees: string[];
    };
    expect(payload.title).toBe('NewFeat');
    expect(payload.body).toContain('Sum');
    expect(payload.body).toContain('<!-- harness-meta:start -->');
    expect(payload.labels).toContain('harness-managed');
    expect(payload.labels).toContain('planned');
    expect(payload.assignees).toEqual(['alice']);
  });

  it('b) Returns Ok(TrackedFeature) with the new externalId', async () => {
    const created = rawIssue({ number: 12, title: 'X' });
    const fetchFn = mockFetchSequence({ status: 201, body: created, etag: 'W/"e"' });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.create({ name: 'X', summary: 'sum' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.externalId).toBe('github:o/r#12');
  });

  it('blockedBy round-trips verbatim through create + mapIssue', async () => {
    // Contract: blockedBy holds feature names as authored in body-meta. The
    // adapter writes them verbatim to meta.blocked_by and reads them verbatim.
    const created = rawIssue({
      number: 20,
      title: 'C',
      body: serializeBodyBlock('C summary', { blocked_by: ['feature-a', 'feature-b'] }),
      labels: [{ name: 'harness-managed' }],
    });
    const fetchFn = mockFetchSequence({ status: 201, body: created, etag: 'W/"e"' });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.create({
      name: 'C',
      summary: 'C summary',
      blockedBy: ['feature-a', 'feature-b'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Round-trip: input blockedBy names survive verbatim through serialize
      // (write) and parseBodyBlock+mapIssue (read).
      expect(r.value.blockedBy).toEqual(['feature-a', 'feature-b']);
    }
    // Also verify the POST body contained the names verbatim.
    const call = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const init = call[1] as { body: string };
    const payload = JSON.parse(init.body) as { body: string };
    expect(payload.body).toMatch(/blocked_by:.*feature-a.*feature-b/);
  });

  it('blockedBy round-trips verbatim through update + mapIssue', async () => {
    // Existing issue body has no blocked_by; PATCH adds blockedBy=['feature-c']
    // and the mocked response echoes the new body. mapIssue reads names verbatim.
    const before = rawIssue({ number: 21, title: 'D', body: serializeBodyBlock('D summary', {}) });
    const after = rawIssue({
      number: 21,
      title: 'D',
      body: serializeBodyBlock('D summary', { blocked_by: ['feature-c'] }),
    });
    const fetchFn = mockFetchSequence(
      // GET for body rebuild (patch.blockedBy is set → bodyTouches)
      { status: 200, body: before, etag: 'W/"a"' },
      // PATCH
      { status: 200, body: after, etag: 'W/"b"' }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.update('github:o/r#21', { blockedBy: ['feature-c'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.blockedBy).toEqual(['feature-c']);

    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const patchInit = calls[1]![1] as { body: string };
    const payload = JSON.parse(patchInit.body) as { body: string };
    expect(payload.body).toMatch(/blocked_by:.*feature-c/);
  });

  it('c) Invalidates list:* after create', async () => {
    const cache = new ETagStore();
    cache.set('list:all', 'W/"old"', []);
    cache.set('list:status:in-progress', 'W/"y"', []);
    const fetchFn = mockFetchSequence({
      status: 201,
      body: rawIssue({ number: 1 }),
      etag: 'W/"e"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
      etagStore: cache,
    });
    await adapter.create({ name: 'X', summary: 'sum' });
    expect(cache.get('list:all')).toBeNull();
    expect(cache.get('list:status:in-progress')).toBeNull();
  });
});

describe('GitHubIssuesTrackerAdapter — update', () => {
  it('a) Patch with no ifMatch issues an unconditional PATCH and returns updated feature', async () => {
    const after = rawIssue({ number: 1, title: 'Updated' });
    const fetchFn = mockFetchSequence(
      // GET (for body rebuild because patch.summary is set)
      { status: 200, body: rawIssue({ number: 1, title: 'Old' }), etag: 'W/"a"' },
      // PATCH
      { status: 200, body: after, etag: 'W/"b"' }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.update('github:o/r#1', { summary: 'NewSummary' });
    expect(r.ok).toBe(true);

    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(2);
    const patchInit = calls[1]![1] as { method: string; body: string };
    expect(patchInit.method).toBe('PATCH');
    const payload = JSON.parse(patchInit.body) as { body: string };
    expect(payload.body).toContain('NewSummary');
  });

  it('b) Patch with ifMatch (matching cache) → fresh GET, no diff, then PATCH', async () => {
    const cache = new ETagStore();
    const fetchFn = mockFetchSequence(
      // refetch
      { status: 200, body: rawIssue({ number: 1, title: 'Same' }), etag: 'W/"current"' },
      // body-rebuild GET (because patch has summary)
      { status: 200, body: rawIssue({ number: 1, title: 'Same' }), etag: 'W/"current"' },
      // PATCH
      { status: 200, body: rawIssue({ number: 1, title: 'Same' }), etag: 'W/"new"' }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
      etagStore: cache,
    });
    const r = await adapter.update('github:o/r#1', { summary: 'newsum' }, 'W/"current"');
    expect(r.ok).toBe(true);
  });

  it('b2) Patch with ifMatch but server-side diff (different assignee) → ConflictError, no PATCH', async () => {
    const fetchFn = mockFetchSequence(
      // refetch shows server has assignee bob
      {
        status: 200,
        body: rawIssue({ number: 1, assignees: [{ login: 'bob' }] }),
        etag: 'W/"e"',
      }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.update('github:o/r#1', { assignee: '@alice' }, 'W/"stale"');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.constructor.name).toBe('ConflictError');
    }

    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    // Only the refetch GET — no PATCH issued
    expect(calls).toHaveLength(1);
    expect((calls[0]![1] as { method: string }).method).toBe('GET');
  });

  it('c) Body-meta fields in patch round-trip via serializeBodyBlock', async () => {
    const fetchFn = mockFetchSequence(
      // GET for body rebuild
      {
        status: 200,
        body: rawIssue({ number: 5, body: 'OldSummary' }),
        etag: 'W/"a"',
      },
      // PATCH
      { status: 200, body: rawIssue({ number: 5 }), etag: 'W/"b"' }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    await adapter.update('github:o/r#5', { priority: 'P0', spec: 'docs/specs/y.md' });
    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const patchInit = calls[1]![1] as { body: string };
    const payload = JSON.parse(patchInit.body) as { body: string };
    expect(payload.body).toContain('priority: P0');
    expect(payload.body).toContain('spec: docs/specs/y.md');
  });

  it('d) Status change applies new state (closed for done) and removes prior status labels', async () => {
    const fetchFn = mockFetchSequence(
      // PATCH (no body-rebuild GET because patch only has status)
      { status: 200, body: rawIssue({ number: 9, state: 'closed' }), etag: 'W/"b"' }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.update('github:o/r#9', { status: 'done' });
    expect(r.ok).toBe(true);
    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const patchInit = calls[0]![1] as { body: string };
    const payload = JSON.parse(patchInit.body) as { state?: string };
    expect(payload.state).toBe('closed');
  });

  it('e) Invalidates feature:<externalId> AND list:* after update', async () => {
    const cache = new ETagStore();
    cache.set('feature:github:o/r#1', 'W/"e"', { name: 'old' });
    cache.set('list:all', 'W/"l"', []);
    const fetchFn = mockFetchSequence({
      status: 200,
      body: rawIssue({ number: 1 }),
      etag: 'W/"new"',
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
      etagStore: cache,
    });
    await adapter.update('github:o/r#1', { status: 'in-progress' });
    expect(cache.get('feature:github:o/r#1')).toBeNull();
    expect(cache.get('list:all')).toBeNull();
  });
});
