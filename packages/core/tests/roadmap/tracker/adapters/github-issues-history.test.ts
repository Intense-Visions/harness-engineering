import { describe, it, expect, vi } from 'vitest';
import { GitHubIssuesTrackerAdapter } from '../../../../src/roadmap/tracker/adapters/github-issues';
import type { HistoryEvent } from '../../../../src/roadmap/tracker/client';

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

const HISTORY_PREFIX = '<!-- harness-history -->';

describe('GitHubIssuesTrackerAdapter — appendHistory', () => {
  it('a) posts a comment whose body is exactly `<!-- harness-history -->\\n${JSON.stringify(event)}`', async () => {
    const fetchFn = mockFetchSequence({
      status: 201,
      body: { id: 1, body: '' },
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const event: HistoryEvent = {
      type: 'claimed',
      actor: '@alice',
      at: '2026-05-09T12:00:00Z',
    };
    const r = await adapter.appendHistory('github:o/r#42', event);
    expect(r.ok).toBe(true);

    const call = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const url = call[0] as string;
    const init = call[1] as { method: string; body: string };
    expect(url).toContain('/repos/o/r/issues/42/comments');
    expect(init.method).toBe('POST');
    const parsed = JSON.parse(init.body) as { body: string };
    expect(parsed.body).toBe(`${HISTORY_PREFIX}\n${JSON.stringify(event)}`);
  });

  it('returns Err on invalid externalId', async () => {
    const fetchFn = mockFetchSequence();
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const event: HistoryEvent = { type: 'created', actor: '@a', at: '2026-05-09T00:00:00Z' };
    const r = await adapter.appendHistory('not-an-extid', event);
    expect(r.ok).toBe(false);
  });

  it('returns Err on non-2xx response', async () => {
    const fetchFn = mockFetchSequence({ status: 422, body: { message: 'bad' } });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const event: HistoryEvent = { type: 'created', actor: '@a', at: '2026-05-09T00:00:00Z' };
    const r = await adapter.appendHistory('github:o/r#1', event);
    expect(r.ok).toBe(false);
  });
});

describe('GitHubIssuesTrackerAdapter — fetchHistory', () => {
  it('b) returns parsed events from comments matching the prefix; ignores comments without it; ignores malformed JSON within prefixed comments (warns)', async () => {
    const evt1: HistoryEvent = { type: 'created', actor: '@a', at: '2026-05-09T01:00:00Z' };
    const evt2: HistoryEvent = { type: 'claimed', actor: '@b', at: '2026-05-09T02:00:00Z' };
    const fetchFn = mockFetchSequence({
      status: 200,
      body: [
        // Plain user comment without prefix → ignored
        { body: 'plain user comment', created_at: '2026-05-09T00:30:00Z' },
        // Valid harness-history comment
        {
          body: `${HISTORY_PREFIX}\n${JSON.stringify(evt1)}`,
          created_at: '2026-05-09T01:00:00Z',
        },
        // Malformed JSON in prefixed comment → ignored with warn
        {
          body: `${HISTORY_PREFIX}\nnot-json{{{`,
          created_at: '2026-05-09T01:30:00Z',
        },
        // Valid harness-history comment
        {
          body: `${HISTORY_PREFIX}\n${JSON.stringify(evt2)}`,
          created_at: '2026-05-09T02:00:00Z',
        },
      ],
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await adapter.fetchHistory('github:o/r#1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual([evt1, evt2]);
    }
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('c) paginates via ?per_page=100 until data.length < 100', async () => {
    const page1Items = Array.from({ length: 100 }, (_, i) => ({
      body: `${HISTORY_PREFIX}\n${JSON.stringify({
        type: 'updated' as const,
        actor: '@a',
        at: `2026-05-09T${String(i % 24).padStart(2, '0')}:00:00Z`,
      })}`,
      created_at: `2026-05-09T${String(i % 24).padStart(2, '0')}:00:00Z`,
    }));
    const page2Items = Array.from({ length: 5 }, (_, i) => ({
      body: `${HISTORY_PREFIX}\n${JSON.stringify({
        type: 'updated' as const,
        actor: '@b',
        at: `2026-05-10T0${i}:00:00Z`,
      })}`,
      created_at: `2026-05-10T0${i}:00:00Z`,
    }));
    const fetchFn = mockFetchSequence(
      { status: 200, body: page1Items },
      { status: 200, body: page2Items }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.fetchHistory('github:o/r#1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toHaveLength(105);
    }
    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0] as string).toContain('per_page=100');
    expect(calls[0]![0] as string).toContain('page=1');
    expect(calls[1]![0] as string).toContain('page=2');
  });

  it('d) returns events sorted by `at` ASC (chronological)', async () => {
    const a: HistoryEvent = { type: 'created', actor: '@a', at: '2026-05-09T03:00:00Z' };
    const b: HistoryEvent = { type: 'claimed', actor: '@b', at: '2026-05-09T01:00:00Z' };
    const c: HistoryEvent = { type: 'completed', actor: '@c', at: '2026-05-09T02:00:00Z' };
    const fetchFn = mockFetchSequence({
      status: 200,
      body: [
        { body: `${HISTORY_PREFIX}\n${JSON.stringify(a)}`, created_at: a.at },
        { body: `${HISTORY_PREFIX}\n${JSON.stringify(b)}`, created_at: b.at },
        { body: `${HISTORY_PREFIX}\n${JSON.stringify(c)}`, created_at: c.at },
      ],
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.fetchHistory('github:o/r#1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.map((e) => e.at)).toEqual([
        '2026-05-09T01:00:00Z',
        '2026-05-09T02:00:00Z',
        '2026-05-09T03:00:00Z',
      ]);
    }
  });

  it('e) `limit` parameter trims the result to the most-recent `limit` events', async () => {
    const events: HistoryEvent[] = [
      { type: 'created', actor: '@a', at: '2026-05-09T01:00:00Z' },
      { type: 'claimed', actor: '@b', at: '2026-05-09T02:00:00Z' },
      { type: 'updated', actor: '@c', at: '2026-05-09T03:00:00Z' },
      { type: 'completed', actor: '@d', at: '2026-05-09T04:00:00Z' },
    ];
    const fetchFn = mockFetchSequence({
      status: 200,
      body: events.map((e) => ({
        body: `${HISTORY_PREFIX}\n${JSON.stringify(e)}`,
        created_at: e.at,
      })),
    });
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.fetchHistory('github:o/r#1', 2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toHaveLength(2);
      expect(r.value.map((e) => e.at)).toEqual(['2026-05-09T03:00:00Z', '2026-05-09T04:00:00Z']);
    }
  });

  it('returns Err on invalid externalId', async () => {
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn: mockFetchSequence(),
    });
    const r = await adapter.fetchHistory('not-an-extid');
    expect(r.ok).toBe(false);
  });
});

describe('GitHubIssuesTrackerAdapter — claim/release/complete log history (best-effort)', () => {
  it('claim posts a history comment after primary PATCH succeeds', async () => {
    // Sequence:
    //   1) PATCH issue → 200 (primary write — no ifMatch supplied so no pre-fetch)
    //   2) POST comment (history append) → 201
    const fetchFn = mockFetchSequence(
      {
        status: 200,
        body: {
          number: 5,
          title: 'F',
          state: 'open',
          body: '',
          labels: [{ name: 'harness-managed' }],
          assignees: [{ login: 'alice' }],
          milestone: null,
          created_at: '2026-05-09T00:00:00Z',
          updated_at: '2026-05-09T00:00:00Z',
        },
      },
      { status: 201, body: { id: 1 } }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
    });
    const r = await adapter.claim('github:o/r#5', '@alice');
    expect(r.ok).toBe(true);
    const calls = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]![0] as string).toContain('/comments');
    const init = calls[1]![1] as { body: string };
    const parsed = JSON.parse(init.body) as { body: string };
    expect(parsed.body.startsWith(HISTORY_PREFIX)).toBe(true);
    const json = parsed.body.slice(HISTORY_PREFIX.length).trim();
    const evt = JSON.parse(json) as HistoryEvent;
    expect(evt.type).toBe('claimed');
    expect(evt.actor).toBe('@alice');
  });

  it('claim still returns Ok even if history append fails (best-effort)', async () => {
    const fetchFn = mockFetchSequence(
      {
        status: 200,
        body: {
          number: 5,
          title: 'F',
          state: 'open',
          body: '',
          labels: [{ name: 'harness-managed' }],
          assignees: [{ login: 'alice' }],
          milestone: null,
          created_at: '2026-05-09T00:00:00Z',
          updated_at: '2026-05-09T00:00:00Z',
        },
      },
      // history POST fails, all retries:
      { status: 500, body: { message: 'boom' } }
    );
    const adapter = new GitHubIssuesTrackerAdapter({
      token: 'tok',
      repo: 'o/r',
      fetchFn,
      maxRetries: 0,
      baseDelayMs: 1,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await adapter.claim('github:o/r#5', '@alice');
    expect(r.ok).toBe(true);
    warnSpy.mockRestore();
  });
});
