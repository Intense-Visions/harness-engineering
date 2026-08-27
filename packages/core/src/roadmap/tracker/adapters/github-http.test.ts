import { describe, it, expect, vi, afterEach } from 'vitest';
import { GitHubHttp, parseExternalId, buildExternalId } from './github-http';
import {
  RateBudget,
  sharedRateBudget,
  ThrottledFetchError,
  TruncatedFetchError,
} from '../../../fleet/rate-budget';

const TOKEN = 'ghp_test_token';

/** Build a Response with an optional ETag header and JSON/text body. */
function res(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const isNoBodyStatus = status === 304 || status === 204;
  const payload = isNoBodyStatus || body === undefined ? null : JSON.stringify(body);
  return new Response(payload, { status, headers });
}

/** A fetchFn that returns each queued response in order, recording call args. */
function queuedFetch(responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let i = 0;
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: url instanceof Request ? url.url : url instanceof URL ? url.href : url,
      init,
    });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return r;
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls, count: () => i };
}

function http(fetchFn: typeof fetch, extra?: Partial<ConstructorParameters<typeof GitHubHttp>[0]>) {
  return new GitHubHttp({ token: TOKEN, fetchFn, ...extra });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // The default budget is the process-wide singleton; clear it so a penalize()
  // in one test cannot leak a cooldown into the next.
  sharedRateBudget.reset();
});

describe('GitHubHttp — construction & headers', () => {
  it('defaults apiBase to the public GitHub API host', () => {
    const client = http(vi.fn() as unknown as typeof fetch);
    expect(client.apiBase).toBe('https://api.github.com');
  });

  it('honors an injected apiBase override', () => {
    const client = http(vi.fn() as unknown as typeof fetch, {
      apiBase: 'https://ghe.example.com/api/v3',
    });
    expect(client.apiBase).toBe('https://ghe.example.com/api/v3');
  });

  it('headers() carries bearer auth and the GitHub API version', () => {
    const client = http(vi.fn() as unknown as typeof fetch);
    expect(client.headers()).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  });

  it('headers() merges extra headers over the defaults', () => {
    const client = http(vi.fn() as unknown as typeof fetch);
    const merged = client.headers({ 'If-None-Match': '"abc"', Accept: 'text/plain' });
    expect(merged['If-None-Match']).toBe('"abc"');
    // Caller-supplied Accept wins over the default.
    expect(merged.Accept).toBe('text/plain');
    expect(merged.Authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe('GitHubHttp — request()', () => {
  it('passes the method through and injects auth + extra headers', async () => {
    const { fetchFn, calls } = queuedFetch([res(200, { ok: true })]);
    const client = http(fetchFn);
    const r = await client.request('https://api.github.com/x', {
      method: 'POST',
      body: '{}',
      extraHeaders: { 'If-None-Match': '"tag"' },
    });
    expect(r.status).toBe(200);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://api.github.com/x');
    const sentHeaders = call.init?.headers as Record<string, string>;
    expect(sentHeaders.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(sentHeaders['If-None-Match']).toBe('"tag"');
    // extraHeaders must be stripped from the RequestInit and folded into headers.
    expect(call.init && 'extraHeaders' in call.init).toBe(false);
    expect(call.init?.method).toBe('POST');
    expect(call.init?.body).toBe('{}');
  });

  it('returns a 2xx response immediately without retrying', async () => {
    const { fetchFn, count } = queuedFetch([res(201, { created: true })]);
    const r = await http(fetchFn).request('https://api.github.com/x', { method: 'GET' });
    expect(r.status).toBe(201);
    expect(count()).toBe(1);
  });

  it('does not retry a 4xx that is not 403/429 (e.g. 404)', async () => {
    const { fetchFn, count } = queuedFetch([res(404, { message: 'Not Found' })]);
    const r = await http(fetchFn).request('https://api.github.com/x', { method: 'GET' });
    expect(r.status).toBe(404);
    expect(count()).toBe(1);
  });
});

describe('GitHubHttp — fetchWithRetry backoff', () => {
  it('retries on 500 up to maxRetries then returns the last failing response', async () => {
    vi.useFakeTimers();
    // Deterministic jitter so timer advancement is predictable.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const maxRetries = 3;
    const { fetchFn, count } = queuedFetch([res(500, { e: 1 })]);
    const client = http(fetchFn, { maxRetries, baseDelayMs: 10 });

    const p = client.request('https://api.github.com/x', { method: 'GET' });
    await vi.runAllTimersAsync();
    const r = await p;

    expect(r.status).toBe(500);
    // 1 initial attempt + maxRetries retries.
    expect(count()).toBe(maxRetries + 1);
  });

  it('stops retrying as soon as a retryable status clears (429 then 200)', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { fetchFn, count } = queuedFetch([res(429, { rate: 'limited' }), res(200, { ok: true })]);
    const client = http(fetchFn, { maxRetries: 5, baseDelayMs: 10 });

    const p = client.request('https://api.github.com/x', { method: 'GET' });
    await vi.runAllTimersAsync();
    const r = await p;

    expect(r.status).toBe(200);
    expect(count()).toBe(2);
  });

  it('waits Retry-After seconds when the header is present', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const retryAfterSeconds = 2;
    const { fetchFn } = queuedFetch([
      res(403, { secondary: 'rate limit' }, { 'Retry-After': String(retryAfterSeconds) }),
      res(200, { ok: true }),
    ]);
    const client = http(fetchFn, { maxRetries: 5, baseDelayMs: 10 });

    const p = client.request('https://api.github.com/x', { method: 'GET' });
    await vi.runAllTimersAsync();
    const r = await p;

    expect(r.status).toBe(200);
    // The backoff sleep must use Retry-After (seconds -> ms), not the base delay.
    const delays = setTimeoutSpy.mock.calls.map((c) => c[1]);
    expect(delays).toContain(retryAfterSeconds * 1000);
  });
});

describe('GitHubHttp — paginate()', () => {
  const buildUrl = (page: number) => `https://api.github.com/items?page=${page}`;

  it('walks pages until a short page and concatenates items with the latest ETag', async () => {
    const perPage = 2;
    const { fetchFn, calls } = queuedFetch([
      res(200, [{ id: 1 }, { id: 2 }], { ETag: '"p1"' }),
      res(200, [{ id: 3 }], { ETag: '"p2"' }),
    ]);
    const out = await http(fetchFn).paginate<{ id: number }>(buildUrl, perPage);

    expect(out.status).toBe(200);
    expect(out.items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(out.lastEtag).toBe('"p2"');
    // Stopped after the short second page — did not request a third.
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.github.com/items?page=1',
      'https://api.github.com/items?page=2',
    ]);
  });

  it('returns status 304 and no items when the first page is a cache hit', async () => {
    const { fetchFn, count } = queuedFetch([res(304, undefined, { ETag: '"cached"' })]);
    const out = await http(fetchFn).paginate<{ id: number }>(buildUrl, 100);

    expect(out.status).toBe(304);
    expect(out.items).toEqual([]);
    expect(out.lastEtag).toBe('"cached"');
    expect(count()).toBe(1);
  });

  it('treats a mid-walk 304 as end-of-items, preserving accumulated items with status 200', async () => {
    const perPage = 2;
    const { fetchFn } = queuedFetch([
      res(200, [{ id: 1 }, { id: 2 }], { ETag: '"p1"' }),
      res(304, undefined, { ETag: '"p2"' }),
    ]);
    const out = await http(fetchFn).paginate<{ id: number }>(buildUrl, perPage);

    expect(out.status).toBe(200);
    expect(out.items).toEqual([{ id: 1 }, { id: 2 }]);
    // Mid-walk 304 ETag is adopted as the latest seen.
    expect(out.lastEtag).toBe('"p2"');
  });

  it('forwards extraHeaders (e.g. If-None-Match) on every page request', async () => {
    const { fetchFn, calls } = queuedFetch([res(200, [], { ETag: '"e"' })]);
    await http(fetchFn).paginate(buildUrl, 100, { 'If-None-Match': '"prev"' });

    const sent = calls[0]!.init?.headers as Record<string, string>;
    expect(sent['If-None-Match']).toBe('"prev"');
    expect(calls[0]!.init?.method).toBe('GET');
  });

  it('throws a descriptive error on a non-ok, non-304 response', async () => {
    const { fetchFn } = queuedFetch([res(422, { message: 'Unprocessable' })]);
    await expect(http(fetchFn).paginate(buildUrl, 100)).rejects.toThrow(/GitHub 422/);
  });
});

describe('GitHubHttp — rate-limit budget wiring (#1532)', () => {
  const url = 'https://api.github.com/x';
  const buildUrl = (page: number) => `https://api.github.com/items?page=${page}`;

  it('acquires the shared budget before fetching (a cooldown defers the fetch)', async () => {
    vi.useFakeTimers();
    const budget = new RateBudget();
    budget.penalize('github.core', 5000);
    const { fetchFn, count } = queuedFetch([res(200, { ok: true })]);
    const client = http(fetchFn, { budget });

    const p = client.request(url, { method: 'GET' });
    // The request suspends inside budget.acquire() — no fetch until the cooldown clears.
    expect(count()).toBe(0);

    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.status).toBe(200);
    expect(count()).toBe(1);
  });

  it('throws ThrottledFetchError on terminal throttle AND penalizes the shared budget', async () => {
    const budget = new RateBudget();
    const before = Date.now();
    const { fetchFn } = queuedFetch([res(429, { rate: 'limited' }, { 'Retry-After': '3' })]);
    // maxRetries: 0 → single attempt, no retry sleep; 429 is terminal.
    const client = http(fetchFn, { budget, resource: 'github.search', maxRetries: 0 });

    await expect(client.request(url, { method: 'GET' })).rejects.toBeInstanceOf(
      ThrottledFetchError
    );
    // The 429 recorded a shared cooldown a sibling leaf on this resource observes.
    expect(budget.delayFor('github.search', before)).toBeGreaterThan(0);
  });

  it('paginate throws TruncatedFetchError when a short page still advertises rel="next"', async () => {
    const { fetchFn } = queuedFetch([
      res(200, [{ id: 1 }], {
        ETag: '"p1"',
        Link: '<https://api.github.com/items?page=2>; rel="next"',
      }),
    ]);
    // Short page (1 < perPage 2) but a next page exists → server truncated → fail.
    await expect(http(fetchFn).paginate(buildUrl, 2)).rejects.toBeInstanceOf(TruncatedFetchError);
  });

  it('paginate does NOT throw on a genuinely-final short page (no next link)', async () => {
    const { fetchFn } = queuedFetch([res(200, [{ id: 1 }], { ETag: '"p1"' })]);
    const out = await http(fetchFn).paginate<{ id: number }>(buildUrl, 2);
    expect(out.items).toEqual([{ id: 1 }]);
  });

  it('search throws TruncatedFetchError when incomplete_results is true', async () => {
    const { fetchFn } = queuedFetch([
      res(200, { total_count: 5, incomplete_results: true, items: [{ id: 1 }] }),
    ]);
    // A server-truncated search must fail the leaf, NOT return the partial items.
    await expect(http(fetchFn).search(buildUrl, 2)).rejects.toBeInstanceOf(TruncatedFetchError);
  });

  it('search returns items (no throw) when incomplete_results is false', async () => {
    const { fetchFn } = queuedFetch([
      res(200, { total_count: 2, incomplete_results: false, items: [{ id: 1 }] }),
    ]);
    const out = await http(fetchFn).search<{ id: number }>(buildUrl, 2);
    expect(out.items).toEqual([{ id: 1 }]);
    expect(out.totalCount).toBe(2);
  });

  it('search behaves identically when incomplete_results is absent (byte-identical to false)', async () => {
    const { fetchFn } = queuedFetch([res(200, { total_count: 1, items: [{ id: 7 }] })]);
    const out = await http(fetchFn).search<{ id: number }>(buildUrl, 2);
    expect(out.items).toEqual([{ id: 7 }]);
    expect(out.totalCount).toBe(1);
  });

  it('search follows rel="next" pagination (rel=next is paging, not truncation)', async () => {
    const { fetchFn, count } = queuedFetch([
      res(
        200,
        { total_count: 3, incomplete_results: false, items: [{ id: 1 }, { id: 2 }] },
        { Link: '<https://api.github.com/search/issues?page=2>; rel="next"' }
      ),
      res(200, { total_count: 3, incomplete_results: false, items: [{ id: 3 }] }),
    ]);
    // perPage 2: page 1 is full AND advertises rel="next" → fetch page 2.
    const out = await http(fetchFn).search<{ id: number }>(buildUrl, 2);
    expect(out.items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(count()).toBe(2);
  });
});

describe('re-exported External-ID helpers', () => {
  it('parseExternalId round-trips with buildExternalId', () => {
    const id = buildExternalId('octocat', 'hello-world', 42);
    expect(id).toBe('github:octocat/hello-world#42');
    expect(parseExternalId(id)).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
      number: 42,
    });
  });

  it('parseExternalId returns null for a malformed id', () => {
    expect(parseExternalId('not-a-valid-id')).toBeNull();
  });
});
