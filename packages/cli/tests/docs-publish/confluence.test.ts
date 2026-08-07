import { describe, it, expect } from 'vitest';
import { ConfluenceConnector } from '../../src/docs-publish/connectors/confluence';
import type { HttpClient, HttpResponse } from '../../src/docs-publish/interface';

/** Fake HTTP client that records every request and returns a canned page. */
function fakeHttp(): { client: HttpClient; calls: Array<{ url: string; method: string }> } {
  const calls: Array<{ url: string; method: string }> = [];
  const client: HttpClient = (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    const response: HttpResponse = {
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ id: 'PAGE123', _links: { tinyui: '/x/abc' } }),
    };
    return Promise.resolve(response);
  };
  return { client, calls };
}

describe('ConfluenceConnector.attachMedia', () => {
  it('returns a typed manual step preserving the recipe + three traps', async () => {
    const c = new ConfluenceConnector({ baseUrl: 'https://example.atlassian.net' });
    const result = await c.attachMedia({ pageId: 'PAGE123', mediaFilePath: '/tmp/figure.png' });
    expect(result.status).toBe('manual-step-required');
    if (result.status === 'manual-step-required') {
      const i = result.instructions;
      // Recipe markers
      expect(i).toContain('X-Atlassian-Token');
      expect(i).toContain('nocheck');
      expect(i).toContain('osascript');
      expect(i).toContain('FormData');
      expect(i).toContain('atob');
      expect(i).toContain('attachment?status=draft');
      // Three traps
      expect(i).toContain('127.0.0.1');
      expect(i).toContain('base64');
      expect(i.toLowerCase()).toContain('authenticated');
      expect(result.verifyWith).toContain('GET');
    }
  });
});

describe('ConfluenceConnector.draft', () => {
  it('confirms via read-back and never issues a publish (status=current) call', async () => {
    const { client, calls } = fakeHttp();
    const c = new ConfluenceConnector({ baseUrl: 'https://example.atlassian.net' }, client);
    const result = await c.draft({ spaceId: 'SPACE', title: 'A draft' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pageId).toBe('PAGE123');
      expect(result.value.draftStatus).toBe('draft');
      // confirmedByReadBack is true only because the read-back GET returned ok.
      expect(result.confirmedByReadBack).toBe(true);
    }

    // Every call targets a draft; none promotes to current/live.
    expect(calls.length).toBeGreaterThanOrEqual(2); // write + read-back
    for (const call of calls) {
      expect(call.url).not.toContain('status=current');
    }
    expect(calls.some((call) => call.url.includes('status=draft'))).toBe(true);
    // A create issues a POST (not a PUT update).
    expect(calls[0]?.method).toBe('POST');
  });

  it('returns confirmedByReadBack=false when the read-back GET fails', async () => {
    const calls: string[] = [];
    let n = 0;
    const client: HttpClient = (url) => {
      calls.push(url);
      n += 1;
      // First call (write) ok; second call (read-back) not ok.
      const ok = n === 1;
      const response: HttpResponse = {
        ok,
        status: ok ? 200 : 404,
        text: async () => '',
        json: async () => ({ id: 'PAGE123' }),
      };
      return Promise.resolve(response);
    };
    const c = new ConfluenceConnector({ baseUrl: 'https://example.atlassian.net' }, client);
    const result = await c.draft({ spaceId: 'SPACE', title: 'A draft' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.confirmedByReadBack).toBe(false);
  });

  it('degrades with an actionable error when baseUrl is missing', async () => {
    const c = new ConfluenceConnector({});
    const result = await c.draft({ spaceId: 'SPACE', title: 'A draft' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('baseUrl');
  });

  it('issues a PUT (not POST) when updating an existing page id, still draft-only', async () => {
    const { client, calls } = fakeHttp();
    const c = new ConfluenceConnector({ baseUrl: 'https://example.atlassian.net' }, client);
    const result = await c.draft({ pageId: 'EXISTING1', spaceId: 'SPACE', title: 'Updated' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.pageId).toBe('EXISTING1');
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.url).toContain('/content/EXISTING1');
    for (const call of calls) expect(call.url).not.toContain('status=current');
  });

  it('serializes ADF body as atlas_doc_format on the write request', async () => {
    const bodies: Array<string | undefined> = [];
    const client: HttpClient = (url, init) => {
      bodies.push(typeof init?.body === 'string' ? init.body : undefined);
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ id: 'PAGE123' }),
      } as HttpResponse);
    };
    const c = new ConfluenceConnector({ baseUrl: 'https://example.atlassian.net' }, client);
    await c.draft({ spaceId: 'SPACE', title: 'T', adf: { type: 'doc', content: [] } });
    expect(bodies[0]).toContain('atlas_doc_format');
  });
});

describe('ConfluenceConnector.pageTree', () => {
  it('creates each child draft-only and applies the move endpoint for ordering', async () => {
    const { client, calls } = fakeHttp();
    const c = new ConfluenceConnector({ baseUrl: 'https://example.atlassian.net' }, client);
    const result = await c.pageTree({
      spaceId: 'SPACE',
      parentId: 'PARENT1',
      children: [
        { title: 'Child A' },
        { title: 'Child B', movePosition: 'after', targetId: 'PAGE123' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.parentId).toBe('PARENT1');
      expect(result.value.childPageIds).toHaveLength(2);
    }
    // Exactly one move call for the single child that specified ordering.
    const moves = calls.filter((call) => call.url.includes('/move/'));
    expect(moves).toHaveLength(1);
    expect(moves[0]?.url).toContain('/move/after/PAGE123');
    expect(moves[0]?.method).toBe('PUT');
  });

  it('returns a structured error when a move fails', async () => {
    let n = 0;
    const client: HttpClient = (url) => {
      n += 1;
      // draft write + read-back ok; the move (3rd call) fails.
      const ok = !url.includes('/move/');
      return Promise.resolve({
        ok,
        status: ok ? 200 : 500,
        text: async () => '',
        json: async () => ({ id: 'PAGE123' }),
      } as HttpResponse);
    };
    const c = new ConfluenceConnector({ baseUrl: 'https://example.atlassian.net' }, client);
    const result = await c.pageTree({
      spaceId: 'SPACE',
      parentId: 'PARENT1',
      children: [{ title: 'Child', movePosition: 'append', targetId: 'PARENT1' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/move failed/);
    expect(n).toBeGreaterThanOrEqual(3);
  });
});
