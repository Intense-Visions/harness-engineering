import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  HuggingFaceClient,
  cacheKeyForList,
  cacheKeyForGet,
} from '../../src/huggingface/client.js';
import type { HttpFetcher, HttpResponse } from '../../src/huggingface/http.js';
import { InMemoryHuggingFaceCache } from '../../src/huggingface/cache.js';

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'hf-models-page1.json');

async function loadFixture(): Promise<unknown[]> {
  return JSON.parse(await readFile(FIXTURE_PATH, 'utf8')) as unknown[];
}

interface StubResponseInit {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  /** Force `text()` to reject — used to exercise the JSON parse failure path. */
  textThrows?: Error;
}

function stubResponse(init: StubResponseInit = {}): HttpResponse {
  const status = init.status ?? 200;
  const body = init.body ?? '[]';
  const headers = new Headers(init.headers ?? {});
  return {
    status,
    headers,
    text: () => (init.textThrows ? Promise.reject(init.textThrows) : Promise.resolve(body)),
    json: () => Promise.resolve(JSON.parse(body)),
  };
}

function fetcherReturning(...responses: HttpResponse[]): {
  http: HttpFetcher;
  calls: string[];
} {
  const calls: string[] = [];
  let i = 0;
  const http: HttpFetcher = {
    fetch: vi.fn(async (url: string) => {
      calls.push(url);
      const r = responses[i] ?? responses[responses.length - 1];
      i += 1;
      if (!r) throw new Error('no stub response');
      return r;
    }),
  };
  return { http, calls };
}

describe('HuggingFaceClient.listModels', () => {
  it('issues a single GET with the expected query string (OT1)', async () => {
    const { http, calls } = fetcherReturning(stubResponse({ body: '[]' }));
    const client = new HuggingFaceClient({ http });
    await client.listModels({ author: 'Qwen', limit: 20 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe('https://huggingface.co/api/models?author=Qwen&limit=20');
  });

  it('returns parsed rows with no warnings on 200 (OT2)', async () => {
    const fixture = await loadFixture();
    const { http } = fetcherReturning(stubResponse({ body: JSON.stringify(fixture) }));
    const client = new HuggingFaceClient({ http });
    const result = await client.listModels({ author: 'Qwen' });
    expect(result.source).toBe('live');
    expect(result.warnings).toEqual([]);
    expect(result.value).toHaveLength(5);
    expect(result.value[0]).toMatchObject({
      id: 'Qwen/Qwen3-32B-GGUF',
      downloads: 145823,
      likes: 312,
      libraryName: 'gguf',
      pipelineTag: 'text-generation',
    });
  });

  it('translates 5xx into a warning instead of throwing (OT3)', async () => {
    const { http } = fetcherReturning(stubResponse({ status: 503, body: 'service unavailable' }));
    const client = new HuggingFaceClient({ http });
    const result = await client.listModels({ author: 'Qwen' });
    expect(result.value).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('hf_fetch_failed');
  });

  it('translates a network error into a warning (OT3)', async () => {
    const http: HttpFetcher = {
      fetch: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    };
    const client = new HuggingFaceClient({ http });
    const result = await client.listModels({ author: 'Qwen' });
    expect(result.value).toEqual([]);
    expect(result.warnings[0]?.code).toBe('hf_fetch_failed');
    expect(result.warnings[0]?.cause).toContain('ECONNREFUSED');
  });

  it('follows Link rel="next" cursors when paginate is true (OT4)', async () => {
    const page1 = [{ id: 'org/a' }, { id: 'org/b' }];
    const page2 = [{ id: 'org/c' }];
    const { http, calls } = fetcherReturning(
      stubResponse({
        body: JSON.stringify(page1),
        headers: { link: '<https://huggingface.co/api/models?cursor=abc>; rel="next"' },
      }),
      stubResponse({ body: JSON.stringify(page2) })
    );
    const client = new HuggingFaceClient({ http });
    const result = await client.listModels({ author: 'org', paginate: true });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe('https://huggingface.co/api/models?cursor=abc');
    expect(result.value.map((m) => m.id)).toEqual(['org/a', 'org/b', 'org/c']);
  });

  it('does not paginate when paginate is false (default) (OT4)', async () => {
    const { http, calls } = fetcherReturning(
      stubResponse({
        body: '[{"id":"org/a"}]',
        headers: { link: '<https://huggingface.co/api/models?cursor=next>; rel="next"' },
      })
    );
    const client = new HuggingFaceClient({ http });
    const result = await client.listModels({ author: 'org' });
    expect(calls).toHaveLength(1);
    expect(result.value).toHaveLength(1);
  });

  it('caps pagination at maxPages (OT4)', async () => {
    const stub = stubResponse({
      body: '[{"id":"org/x"}]',
      headers: { link: '<https://huggingface.co/api/models?cursor=loop>; rel="next"' },
    });
    const http: HttpFetcher = { fetch: vi.fn(() => Promise.resolve(stub)) };
    const client = new HuggingFaceClient({ http });
    const result = await client.listModels({ author: 'org', paginate: true, maxPages: 3 });
    expect((http.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
    expect(result.value).toHaveLength(3);
  });

  it('emits a decode-warning when some rows fail schema decode', async () => {
    const { http } = fetcherReturning(
      stubResponse({
        body: JSON.stringify([{ id: 'org/good' }, { notAnId: true }, { id: 'org/also-good' }]),
      })
    );
    const client = new HuggingFaceClient({ http });
    const result = await client.listModels({ author: 'org' });
    expect(result.value).toHaveLength(2);
    expect(result.warnings.map((w) => w.code)).toContain('hf_decode_dropped_rows');
  });

  it('emits hf_decode_failed when the response is not JSON', async () => {
    const { http } = fetcherReturning(stubResponse({ body: 'not-json-at-all' }));
    const client = new HuggingFaceClient({ http });
    const result = await client.listModels({ author: 'org' });
    expect(result.value).toEqual([]);
    expect(result.warnings[0]?.code).toBe('hf_decode_failed');
  });
});

describe('HuggingFaceClient.getModel', () => {
  it('returns the parsed model on 200 (OT5)', async () => {
    const { http, calls } = fetcherReturning(
      stubResponse({ body: JSON.stringify({ id: 'Qwen/Qwen3-32B-GGUF', downloads: 1 }) })
    );
    const client = new HuggingFaceClient({ http });
    const result = await client.getModel('Qwen/Qwen3-32B-GGUF');
    expect(calls[0]).toBe('https://huggingface.co/api/models/Qwen/Qwen3-32B-GGUF');
    expect(result.value?.id).toBe('Qwen/Qwen3-32B-GGUF');
    expect(result.warnings).toEqual([]);
  });

  it('returns null with a 404 warning when HF replies 404 (OT5)', async () => {
    const { http } = fetcherReturning(stubResponse({ status: 404, body: 'not found' }));
    const client = new HuggingFaceClient({ http });
    const result = await client.getModel('Qwen/Deleted');
    expect(result.value).toBeNull();
    expect(result.warnings[0]?.code).toBe('hf_fetch_status_404');
  });

  it('rejects malformed repo ids without making a request', async () => {
    const { http, calls } = fetcherReturning(stubResponse({ body: '{}' }));
    const client = new HuggingFaceClient({ http });
    const result = await client.getModel('no-slash');
    expect(calls).toHaveLength(0);
    expect(result.warnings[0]?.code).toBe('hf_invalid_repo_id');
  });

  it('tombstones a 404 in the cache so repeats avoid the network', async () => {
    const cache = new InMemoryHuggingFaceCache();
    const { http } = fetcherReturning(stubResponse({ status: 404, body: 'not found' }));
    const client = new HuggingFaceClient({ http, cache });
    await client.getModel('Qwen/Deleted');
    const second = await client.getModel('Qwen/Deleted');
    expect((http.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(second.source).toBe('cache');
    expect(second.value).toBeNull();
  });
});

describe('HuggingFaceClient caching', () => {
  it('serves repeats from the cache within TTL (OT9)', async () => {
    const cache = new InMemoryHuggingFaceCache();
    const { http } = fetcherReturning(stubResponse({ body: '[{"id":"org/x"}]' }));
    const client = new HuggingFaceClient({ http, cache });
    const first = await client.listModels({ author: 'org' });
    const second = await client.listModels({ author: 'org' });
    expect(first.source).toBe('live');
    expect(second.source).toBe('cache');
    expect((http.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(second.value).toEqual(first.value);
  });

  it('exposes deterministic cache keys for tests and the scheduler', () => {
    expect(cacheKeyForList({ author: 'Qwen', limit: 10 })).toBe('hf:list:author=Qwen&limit=10');
    expect(cacheKeyForGet('Qwen/Qwen3-32B-GGUF')).toBe('hf:get:Qwen/Qwen3-32B-GGUF');
  });
});
