import { describe, it, expect } from 'vitest';
import {
  createHttpComprehensionReadIO,
  RemoteUnitNotFoundError,
} from '../../src/comprehension/http-io';
import { COMPREHENSION_ROOT, UNIT_FILE } from '../../src/comprehension/store';

const BASE = 'https://core.pnyon.example';
const TOKEN = 'pnyon_cst_secret';
const OUTPOST = '7a11f0e0-0000-4000-8000-000000000001';
const MODULE = 'src/services/ingestion';
const UNIT_BLOB = '# src/services/ingestion\n\n## Summary (advisory)\nDrains the queue.\n';
const STORE_PATH = `${COMPREHENSION_ROOT}/${MODULE}/${UNIT_FILE}`;

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

function io(fetch: typeof globalThis.fetch) {
  return createHttpComprehensionReadIO({ baseUrl: BASE, token: TOKEN, outpost: OUTPOST, fetch });
}

describe('createHttpComprehensionReadIO — readFile', () => {
  it('GETs the serve route (outpost+module) with a Bearer token and returns the unit blob', async () => {
    const { fetch, calls } = fakeFetch(200, { unit: UNIT_BLOB, sourceHash: 'x' });
    const result = await io(fetch).readFile(STORE_PATH);
    expect(result).toBe(UNIT_BLOB);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/comprehension-unit`);
    expect(url.searchParams.get('outpost')).toBe(OUTPOST);
    expect(url.searchParams.get('module')).toBe(MODULE); // module recovered from the store path
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe(
      `Bearer ${TOKEN}`
    );
  });

  it('404 → RemoteUnitNotFoundError (ENOENT-shaped, so the gate treats it as absent)', async () => {
    const { fetch } = fakeFetch(404, { error: 'not found' });
    const err = await io(fetch)
      .readFile(STORE_PATH)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RemoteUnitNotFoundError);
    expect((err as RemoteUnitNotFoundError).code).toBe('ENOENT');
  });

  it('a non-2xx (401/403/5xx) throws status-only — never the token', async () => {
    const { fetch } = fakeFetch(403, { error: 'forbidden' });
    const err = await io(fetch)
      .readFile(STORE_PATH)
      .catch((e: unknown) => e);
    expect((err as Error).message).toContain('HTTP 403');
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it('a 200 with an unparseable body throws', async () => {
    const { fetch } = fakeFetch(200, 'not json');
    await expect(io(fetch).readFile(STORE_PATH)).rejects.toThrow(/unparseable/);
  });

  it('a 200 with no unit blob throws', async () => {
    const { fetch } = fakeFetch(200, { sourceHash: 'x' });
    await expect(io(fetch).readFile(STORE_PATH)).rejects.toThrow(/no unit/);
  });

  it('a network failure throws a generic error (no token leaked)', async () => {
    const fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof globalThis.fetch;
    const err = await io(fetch)
      .readFile(STORE_PATH)
      .catch((e: unknown) => e);
    expect((err as Error).message).toContain('network error');
    expect((err as Error).message).not.toContain(TOKEN);
  });
});

describe('createHttpComprehensionReadIO — read-only', () => {
  it('writeFile throws (the remote vault is authoritative; local recompiles cache locally)', async () => {
    const { fetch } = fakeFetch(200, { unit: UNIT_BLOB });
    await expect(io(fetch).writeFile(STORE_PATH, UNIT_BLOB)).rejects.toThrow(/read-only/);
  });
});

describe('createHttpComprehensionReadIO — listUnitPaths (batch) + cache', () => {
  it('POSTs the batch route and returns a store path per returned module', async () => {
    const { fetch, calls } = fakeFetch(200, {
      units: [
        { module: 'src/a', unit: '# a' },
        { module: 'src/b', unit: '# b' },
      ],
    });
    const paths = await io(fetch).listUnitPaths(COMPREHENSION_ROOT);
    expect(paths).toEqual([
      `${COMPREHENSION_ROOT}/src/a/${UNIT_FILE}`,
      `${COMPREHENSION_ROOT}/src/b/${UNIT_FILE}`,
    ]);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/comprehension-units`);
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ outpost: OUTPOST, modules: [] });
  });

  it('primes the cache so a subsequent readFile is a HIT (no extra request)', async () => {
    const { fetch, calls } = fakeFetch(200, { units: [{ module: 'src/a', unit: '# cached a' }] });
    const adapter = io(fetch);
    await adapter.listUnitPaths(COMPREHENSION_ROOT); // 1 request (batch)
    const blob = await adapter.readFile(`${COMPREHENSION_ROOT}/src/a/${UNIT_FILE}`);
    expect(blob).toBe('# cached a');
    expect(calls.length).toBe(1); // readFile served from cache — no second call
  });

  it('a non-2xx or unparseable batch → [] (caller degrades to local)', async () => {
    expect(await io(fakeFetch(500, {}).fetch).listUnitPaths(COMPREHENSION_ROOT)).toEqual([]);
    expect(await io(fakeFetch(200, 'not json').fetch).listUnitPaths(COMPREHENSION_ROOT)).toEqual(
      []
    );
  });

  it('skips malformed entries (no module or no unit)', async () => {
    const { fetch } = fakeFetch(200, {
      units: [{ module: 'src/a', unit: '# a' }, { module: 'src/b' }, { unit: '# c' }],
    });
    expect(await io(fetch).listUnitPaths(COMPREHENSION_ROOT)).toEqual([
      `${COMPREHENSION_ROOT}/src/a/${UNIT_FILE}`,
    ]);
  });
});
