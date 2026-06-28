import { describe, it, expect, vi } from 'vitest';
import { LinearGraphQLClient } from './linear';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LinearGraphQLClient', () => {
  it('POSTs the query + variables with the API key and returns data', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ data: { viewer: { id: 'u1' } } })
    );
    const client = new LinearGraphQLClient({ apiKey: 'lin_api_test', fetchFn });

    const result = await client.query('query { viewer { id } }', { x: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ viewer: { id: 'u1' } });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.linear.app/graphql');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('lin_api_test');
    expect(JSON.parse(init?.body as string)).toEqual({
      query: 'query { viewer { id } }',
      variables: { x: 1 },
    });
  });

  it('returns Err on a non-2xx HTTP status with a truncated body', async () => {
    const fetchFn = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const client = new LinearGraphQLClient({ apiKey: 'bad', fetchFn });

    const result = await client.query('query { viewer { id } }');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/HTTP 401/);
    expect(result.error.message).toMatch(/unauthorized/);
  });

  it('returns Err when the GraphQL envelope carries errors', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ errors: [{ message: 'Field "nope" not found' }] })
    );
    const client = new LinearGraphQLClient({ apiKey: 'k', fetchFn });

    const result = await client.query('query { nope }');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/Field "nope" not found/);
  });

  it('returns Err when fetch throws (transport failure)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = new LinearGraphQLClient({ apiKey: 'k', fetchFn });

    const result = await client.query('query { viewer { id } }');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/request failed.*ECONNREFUSED/);
  });

  it('honors a custom endpoint', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ data: {} })
    );
    const client = new LinearGraphQLClient({
      apiKey: 'k',
      endpoint: 'https://proxy.example/graphql',
      fetchFn,
    });
    await client.query('query { __typename }');
    expect(fetchFn.mock.calls[0]![0]).toBe('https://proxy.example/graphql');
  });
});
