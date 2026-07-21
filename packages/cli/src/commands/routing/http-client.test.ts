import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { orchestratorBase, authHeader, getJson, postJson } from './http-client';

/**
 * Pins current behavior of the shared HTTP helpers backing the
 * `harness routing` subcommands. Mocks `fetch` via
 * `vi.spyOn(globalThis, 'fetch')`; saves/restores the two env vars the
 * helpers read (`HARNESS_ORCHESTRATOR_URL`, `HARNESS_API_TOKEN`) so the
 * suite is hermetic and order-independent. No real network IO.
 */

const DEFAULT_BASE = 'http://127.0.0.1:8080';
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_BASE = process.env['HARNESS_ORCHESTRATOR_URL'];
const ORIGINAL_TOKEN = process.env['HARNESS_API_TOKEN'];

interface FetchCall {
  url: string;
  init: RequestInit;
}

/** Install a fetch stub that returns `response` and records each call. */
function mockFetch(response: Response | Promise<Response>): {
  fetchSpy: ReturnType<typeof vi.fn>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchSpy = vi.fn(async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response;
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  return { fetchSpy, calls };
}

/** Install a fetch stub that rejects, to exercise the catch branch. */
function mockFetchThrow(error: unknown): {
  fetchSpy: ReturnType<typeof vi.fn>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchSpy = vi.fn(async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    throw error;
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  return { fetchSpy, calls };
}

beforeEach(() => {
  delete process.env['HARNESS_ORCHESTRATOR_URL'];
  delete process.env['HARNESS_API_TOKEN'];
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_BASE === undefined) delete process.env['HARNESS_ORCHESTRATOR_URL'];
  else process.env['HARNESS_ORCHESTRATOR_URL'] = ORIGINAL_BASE;
  if (ORIGINAL_TOKEN === undefined) delete process.env['HARNESS_API_TOKEN'];
  else process.env['HARNESS_API_TOKEN'] = ORIGINAL_TOKEN;
  vi.restoreAllMocks();
});

describe('orchestratorBase', () => {
  it('returns the localhost default when HARNESS_ORCHESTRATOR_URL is unset', () => {
    expect(orchestratorBase()).toBe(DEFAULT_BASE);
  });

  it('returns the configured HARNESS_ORCHESTRATOR_URL when set', () => {
    process.env['HARNESS_ORCHESTRATOR_URL'] = 'http://example.test:9999';
    expect(orchestratorBase()).toBe('http://example.test:9999');
  });
});

describe('authHeader', () => {
  it('returns an empty object when HARNESS_API_TOKEN is unset', () => {
    expect(authHeader()).toEqual({});
  });

  it('returns a Bearer Authorization header when HARNESS_API_TOKEN is set', () => {
    process.env['HARNESS_API_TOKEN'] = 'sekret';
    expect(authHeader()).toEqual({ Authorization: 'Bearer sekret' });
  });
});

describe('getJson', () => {
  it('targets the resolved base + path and forwards the auth header', async () => {
    process.env['HARNESS_ORCHESTRATOR_URL'] = 'http://host:1234';
    process.env['HARNESS_API_TOKEN'] = 'tok';
    const { calls } = mockFetch(new Response('{}', { status: 200 }));

    await getJson('/routing/status');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://host:1234/routing/status');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('omits the Authorization header when no token is configured', async () => {
    const { calls } = mockFetch(new Response('{}', { status: 200 }));

    await getJson('/routing/status');

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('parses the JSON body and reports ok on a 2xx response', async () => {
    mockFetch(new Response(JSON.stringify({ backend: 'ollama' }), { status: 200 }));

    const result = await getJson<{ backend: string }>('/routing/status');

    expect(result).toEqual({ ok: true, status: 200, body: { backend: 'ollama' } });
  });

  it('returns a null body on an empty-string 2xx response', async () => {
    mockFetch(new Response('', { status: 200 }));

    const result = await getJson('/routing/status');

    expect(result).toEqual({ ok: true, status: 200, body: null });
  });

  it('returns ok:false with the raw text as error on a non-2xx response', async () => {
    mockFetch(new Response('forbidden', { status: 403 }));

    const result = await getJson('/routing/status');

    expect(result).toEqual({ ok: false, status: 403, body: null, error: 'forbidden' });
  });

  it('returns status 0 with the message when fetch rejects with an Error', async () => {
    mockFetchThrow(new Error('ECONNREFUSED'));

    const result = await getJson('/routing/status');

    expect(result).toEqual({ ok: false, status: 0, body: null, error: 'ECONNREFUSED' });
  });

  it('stringifies a non-Error rejection into the error field', async () => {
    mockFetchThrow('boom');

    const result = await getJson('/routing/status');

    expect(result).toEqual({ ok: false, status: 0, body: null, error: 'boom' });
  });
});

describe('postJson', () => {
  it('issues a POST with a JSON content-type and serialized body', async () => {
    const { calls } = mockFetch(new Response('{}', { status: 200 }));
    const payload = { policy: 'complexity' };

    await postJson('/routing/policy', payload);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${DEFAULT_BASE}/routing/policy`);
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json'
    );
    expect(calls[0]!.init.body).toBe(JSON.stringify(payload));
  });

  it('merges the auth header alongside the content-type when a token is set', async () => {
    process.env['HARNESS_API_TOKEN'] = 'tok';
    const { calls } = mockFetch(new Response('{}', { status: 200 }));

    await postJson('/routing/policy', {});

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('parses the JSON body and reports ok on a 2xx response', async () => {
    mockFetch(new Response(JSON.stringify({ applied: true }), { status: 200 }));

    const result = await postJson<{ applied: boolean }>('/routing/policy', {});

    expect(result).toEqual({ ok: true, status: 200, body: { applied: true } });
  });

  it('returns ok:false with the raw text as error on a non-2xx response', async () => {
    mockFetch(new Response('bad request', { status: 400 }));

    const result = await postJson('/routing/policy', {});

    expect(result).toEqual({ ok: false, status: 400, body: null, error: 'bad request' });
  });

  it('returns status 0 with the message when fetch rejects with an Error', async () => {
    mockFetchThrow(new Error('network down'));

    const result = await postJson('/routing/policy', {});

    expect(result).toEqual({ ok: false, status: 0, body: null, error: 'network down' });
  });
});
