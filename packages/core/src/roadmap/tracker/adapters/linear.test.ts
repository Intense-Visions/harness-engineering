import { describe, it, expect, vi } from 'vitest';
import { LinearTrackerAdapter } from './linear';
import { serializeBodyBlock } from '../body-metadata';

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * A fetch stub that routes each GraphQL operation to a canned response keyed by
 * a substring of the query. Records the parsed request bodies for assertions.
 */
function routedFetch(routes: Array<{ match: string; data: unknown }>) {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as {
      query: string;
      variables: Record<string, unknown>;
    };
    calls.push(body);
    const route = routes.find((r) => body.query.includes(r.match));
    return jsonResponse(route ? route.data : {});
  });
  return { fetchFn, calls };
}

function adapter(fetchFn: typeof fetch) {
  return new LinearTrackerAdapter({ apiKey: 'lin_test', teamId: 'team_1', fetchFn });
}

const ISSUE = {
  id: 'uuid-1',
  title: 'Ship login',
  description: serializeBodyBlock('A login flow', {
    spec: 'docs/login.md',
    plan: 'plans/login.md',
    blocked_by: ['auth-service'],
    priority: 'P1',
    milestone: 'MVP',
  }),
  state: { type: 'started', name: 'In Progress' },
  assignee: { displayName: 'Ada' },
  priority: 2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

describe('LinearTrackerAdapter — reads', () => {
  it('fetchAll maps a Linear issue to a TrackedFeature (status from state.type, body-meta)', async () => {
    const { fetchFn } = routedFetch([
      { match: 'team(id:$team)', data: { team: { issues: { nodes: [ISSUE] } } } },
    ]);
    const r = await adapter(fetchFn).fetchAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.features).toHaveLength(1);
    expect(r.value.features[0]).toMatchObject({
      externalId: 'linear:uuid-1',
      name: 'Ship login',
      status: 'in-progress', // state.type 'started'
      summary: 'A login flow',
      spec: 'docs/login.md',
      plans: ['plans/login.md'],
      blockedBy: ['auth-service'],
      assignee: 'Ada',
      priority: 'P1',
      milestone: 'MVP',
    });
  });

  it('fetchByStatus filters by mapped status', async () => {
    const { fetchFn } = routedFetch([
      { match: 'team(id:$team)', data: { team: { issues: { nodes: [ISSUE] } } } },
    ]);
    const r = await adapter(fetchFn).fetchByStatus(['done']);
    expect(r.ok && r.value).toEqual([]); // ISSUE is in-progress, not done
  });

  it('fetchById returns null when the issue is absent', async () => {
    const { fetchFn } = routedFetch([{ match: 'issue(id:$id)', data: { issue: null } }]);
    const r = await adapter(fetchFn).fetchById('linear:nope');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeNull();
  });
});

describe('LinearTrackerAdapter — writes', () => {
  it('create resolves a workflow state and posts issueCreate with a body-meta description', async () => {
    const { fetchFn, calls } = routedFetch([
      {
        match: 'states { nodes',
        data: { team: { states: { nodes: [{ id: 's-backlog', type: 'backlog' }] } } },
      },
      {
        match: 'issueCreate',
        data: { issueCreate: { issue: { ...ISSUE, id: 'new-1', title: 'New' } } },
      },
    ]);
    const r = await adapter(fetchFn).create({ name: 'New', summary: 'sum', spec: 'docs/x.md' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.externalId).toBe('linear:new-1');

    const createCall = calls.find((c) => c.query.includes('issueCreate'))!;
    const input = createCall.variables.input as Record<string, unknown>;
    expect(input.teamId).toBe('team_1');
    expect(input.stateId).toBe('s-backlog');
    expect(String(input.description)).toContain('harness-meta');
    expect(String(input.description)).toContain('docs/x.md');
  });

  it('update raises ConflictError when ifMatch != server updatedAt', async () => {
    const { fetchFn } = routedFetch([{ match: 'issue(id:$id)', data: { issue: ISSUE } }]);
    const r = await adapter(fetchFn).update('linear:uuid-1', { name: 'X' }, 'STALE-ETAG');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect((r.error as { code?: string }).code).toBe('TRACKER_CONFLICT');
  });
});

describe('LinearTrackerAdapter — history round-trip', () => {
  it('appendHistory posts a marked comment and fetchHistory parses it back', async () => {
    const { fetchFn, calls } = routedFetch([
      { match: 'commentCreate', data: { commentCreate: { success: true } } },
    ]);
    const a = adapter(fetchFn);
    const append = await a.appendHistory('linear:uuid-1', {
      type: 'claimed',
      actor: 'Ada',
      at: '2026-01-03T00:00:00Z',
    });
    expect(append.ok).toBe(true);
    const body = String((calls[0]!.variables.input as Record<string, unknown>).body);

    const { fetchFn: fetchFn2 } = routedFetch([
      { match: 'comments(first', data: { issue: { comments: { nodes: [{ body }] } } } },
    ]);
    const hist = await adapter(fetchFn2).fetchHistory('linear:uuid-1');
    expect(hist.ok).toBe(true);
    if (!hist.ok) return;
    expect(hist.value).toEqual([{ type: 'claimed', actor: 'Ada', at: '2026-01-03T00:00:00Z' }]);
  });
});

describe('LinearTrackerAdapter — claim / release / complete / update body merge', () => {
  const states = {
    match: 'states { nodes',
    data: {
      team: {
        states: {
          nodes: [
            { id: 's-backlog', type: 'backlog' },
            { id: 's-started', type: 'started' },
            { id: 's-done', type: 'completed' },
          ],
        },
      },
    },
  };
  const user = { match: 'users(filter', data: { users: { nodes: [{ id: 'u-ada' }] } } };
  const updated = { match: 'issueUpdate', data: { issueUpdate: { issue: ISSUE } } };

  it('claim resolves the user + started state and sets assignee', async () => {
    const { fetchFn, calls } = routedFetch([states, user, updated]);
    const r = await adapter(fetchFn).claim('linear:uuid-1', 'Ada');
    expect(r.ok).toBe(true);
    const input = calls.find((c) => c.query.includes('issueUpdate'))!.variables.input as Record<
      string,
      unknown
    >;
    expect(input.assigneeId).toBe('u-ada');
    expect(input.stateId).toBe('s-started');
  });

  it('claim errors when the user cannot be resolved', async () => {
    const { fetchFn } = routedFetch([{ match: 'users(filter', data: { users: { nodes: [] } } }]);
    const r = await adapter(fetchFn).claim('linear:uuid-1', 'Ghost');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/user not found/i);
  });

  it('release clears the assignee', async () => {
    const { fetchFn, calls } = routedFetch([updated]);
    const r = await adapter(fetchFn).release('linear:uuid-1');
    expect(r.ok).toBe(true);
    const input = calls[0]!.variables.input as Record<string, unknown>;
    expect(input.assigneeId).toBeNull();
  });

  it('complete moves the issue to a completed-type state', async () => {
    const { fetchFn, calls } = routedFetch([states, updated]);
    const r = await adapter(fetchFn).complete('linear:uuid-1');
    expect(r.ok).toBe(true);
    const input = calls.find((c) => c.query.includes('issueUpdate'))!.variables.input as Record<
      string,
      unknown
    >;
    expect(input.stateId).toBe('s-done');
  });

  it('update merges body-backed fields into the existing harness-meta block', async () => {
    const { fetchFn, calls } = routedFetch([
      { match: 'issue(id:$id)', data: { issue: ISSUE } },
      updated,
    ]);
    const r = await adapter(fetchFn).update('linear:uuid-1', { spec: 'docs/new-spec.md' });
    expect(r.ok).toBe(true);
    const input = calls.find((c) => c.query.includes('issueUpdate'))!.variables.input as Record<
      string,
      unknown
    >;
    const description = String(input.description);
    expect(description).toContain('docs/new-spec.md');
    // Untouched fields are preserved from the existing issue body.
    expect(description).toContain('auth-service');
  });
});

describe('LinearTrackerAdapter — status & priority mapping coverage', () => {
  const cases: Array<{ type: string; priority: number; status: string; mapped: string | null }> = [
    { type: 'backlog', priority: 1, status: 'backlog', mapped: 'P0' },
    { type: 'triage', priority: 2, status: 'backlog', mapped: 'P1' },
    { type: 'unstarted', priority: 3, status: 'planned', mapped: 'P2' },
    { type: 'completed', priority: 4, status: 'done', mapped: 'P3' },
    { type: 'canceled', priority: 0, status: 'done', mapped: null },
    { type: 'weird-unknown', priority: 9, status: 'backlog', mapped: null },
  ];

  it.each(cases)('state.type=$type → $status, priority=$priority → $mapped', async (c) => {
    const issue = {
      id: 'x',
      title: 'T',
      description: 'no meta here',
      state: { type: c.type },
      priority: c.priority,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: null,
    };
    const { fetchFn } = routedFetch([
      { match: 'team(id:$team)', data: { team: { issues: { nodes: [issue] } } } },
    ]);
    const r = await adapter(fetchFn).fetchAll();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.features[0]!.status).toBe(c.status);
    expect(r.value.features[0]!.priority).toBe(c.mapped);
  });

  it('fetchById returns the feature + etag on success', async () => {
    const { fetchFn } = routedFetch([{ match: 'issue(id:$id)', data: { issue: ISSUE } }]);
    const r = await adapter(fetchFn).fetchById('linear:uuid-1');
    expect(r.ok).toBe(true);
    if (!r.ok || !r.value) return;
    expect(r.value.feature.externalId).toBe('linear:uuid-1');
    expect(r.value.etag).toBe('2026-01-02T00:00:00Z');
  });

  it('create errors when the team has no workflow state of the wanted type', async () => {
    const { fetchFn } = routedFetch([
      { match: 'states { nodes', data: { team: { states: { nodes: [] } } } },
    ]);
    const r = await adapter(fetchFn).create({ name: 'N', summary: 's' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/no workflow state/i);
  });

  it('fetchHistory skips comments without the marker or with malformed JSON', async () => {
    const good = `${'<!-- harness-history -->'}\n\`\`\`json\n${JSON.stringify({ type: 'created', actor: 'x', at: '2026-01-01T00:00:00Z' })}\n\`\`\``;
    const malformed = `${'<!-- harness-history -->'}\n\`\`\`json\nnot-json\n\`\`\``;
    const { fetchFn } = routedFetch([
      {
        match: 'comments(first',
        data: {
          issue: { comments: { nodes: [{ body: 'plain' }, { body: malformed }, { body: good }] } },
        },
      },
    ]);
    const r = await adapter(fetchFn).fetchHistory('linear:uuid-1', 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual([{ type: 'created', actor: 'x', at: '2026-01-01T00:00:00Z' }]);
  });
});

describe('LinearTrackerAdapter — transport error mapping', () => {
  it('maps a non-JSON 2xx response to Err', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>not json</html>', { status: 200 }));
    const r = await adapter(fetchFn as unknown as typeof fetch).fetchAll();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/not JSON/i);
  });

  it('maps a non-2xx HTTP response to Err', async () => {
    const fetchFn = vi.fn(async () => new Response('forbidden', { status: 403 }));
    const r = await adapter(fetchFn as unknown as typeof fetch).fetchAll();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/HTTP 403/);
  });

  it('maps a GraphQL errors[] payload to Err', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(undefined as never));
    // Re-stub to return an errors array (jsonResponse wraps under data).
    const erroring = vi.fn(
      async () =>
        new Response(JSON.stringify({ errors: [{ message: 'bad query' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    void fetchFn;
    const r = await adapter(erroring as unknown as typeof fetch).fetchAll();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/bad query/);
  });

  it('maps a transport throw to Err', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const r = await adapter(fetchFn as unknown as typeof fetch).fetchAll();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/request failed.*ECONNREFUSED/);
  });
});

describe('createTrackerClient (linear kind)', () => {
  it('builds a Linear adapter from config', async () => {
    const { createTrackerClient } = await import('../factory');
    const r = createTrackerClient({ kind: 'linear', teamId: 't', token: 'k' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeInstanceOf(LinearTrackerAdapter);
  });

  it('errors when the Linear API key is missing', async () => {
    const { createTrackerClient } = await import('../factory');
    const prev = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;
    const r = createTrackerClient({ kind: 'linear', teamId: 't' });
    if (prev !== undefined) process.env.LINEAR_API_KEY = prev;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/missing Linear API key/);
  });
});
