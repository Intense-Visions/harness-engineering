import { describe, it, expect } from 'vitest';
import { fetchPublicOutposts } from '../../src/comprehension/public-outposts';

const BASE = 'https://core.pnyon.example';
const TOKEN = 'pnyon_cst_secret';

/** A fake fetch returning a fixed status/body, capturing the request. */
function fakeFetch(
  status: number,
  body: unknown
): { fetch: typeof globalThis.fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

describe('fetchPublicOutposts', () => {
  it('GETs /public-outposts with a Bearer token and parses id/name/knowledgeCount', async () => {
    const { fetch, calls } = fakeFetch(200, {
      outposts: [
        { outpostId: 'o-1', name: 'Harness Engineering', knowledgeCount: 9 },
        { outpostId: 'o-2' },
      ],
    });
    const rows = await fetchPublicOutposts({ baseUrl: BASE, token: TOKEN, fetch });
    expect(rows).toEqual([
      { outpostId: 'o-1', name: 'Harness Engineering', knowledgeCount: 9 },
      { outpostId: 'o-2' },
    ]);
    expect(calls[0].url).toBe(`${BASE}/public-outposts`);
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe(
      `Bearer ${TOKEN}`
    );
  });

  it('trims a trailing slash on the base URL', async () => {
    const { fetch, calls } = fakeFetch(200, { outposts: [] });
    await fetchPublicOutposts({ baseUrl: `${BASE}/`, token: TOKEN, fetch });
    expect(calls[0].url).toBe(`${BASE}/public-outposts`);
  });

  it('skips malformed entries (no usable outpostId) and tolerates a missing outposts field', async () => {
    const { fetch } = fakeFetch(200, {
      outposts: [{ name: 'no id' }, { outpostId: '' }, { outpostId: 'o-3' }],
    });
    expect(await fetchPublicOutposts({ baseUrl: BASE, token: TOKEN, fetch })).toEqual([
      { outpostId: 'o-3' },
    ]);
    const empty = fakeFetch(200, {});
    expect(await fetchPublicOutposts({ baseUrl: BASE, token: TOKEN, fetch: empty.fetch })).toEqual(
      []
    );
  });

  it('throws status-only (never the token) on a non-2xx', async () => {
    const { fetch } = fakeFetch(401, { error: 'unauthorized' });
    const err = await fetchPublicOutposts({ baseUrl: BASE, token: TOKEN, fetch }).catch(
      (e: unknown) => e
    );
    expect((err as Error).message).toContain('HTTP 401');
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it('throws on a network failure and on an unparseable body (no token leaked)', async () => {
    const netFetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof globalThis.fetch;
    const netErr = await fetchPublicOutposts({
      baseUrl: BASE,
      token: TOKEN,
      fetch: netFetch,
    }).catch((e: unknown) => e);
    expect((netErr as Error).message).toContain('network error');
    expect((netErr as Error).message).not.toContain(TOKEN);

    const { fetch: badJson } = fakeFetch(200, 'not json');
    await expect(
      fetchPublicOutposts({ baseUrl: BASE, token: TOKEN, fetch: badJson })
    ).rejects.toThrow(/unparseable/);
  });
});
