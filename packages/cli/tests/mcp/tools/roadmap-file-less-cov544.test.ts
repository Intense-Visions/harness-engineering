import { describe, it, expect, vi } from 'vitest';
import { Ok, Err, type Result } from '@harness-engineering/types';
import { handleManageRoadmapFileLess } from '../../../src/mcp/tools/roadmap-file-less';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  HistoryEvent,
  FeaturePatch,
  NewFeatureInput,
} from '@harness-engineering/core';
import { ConflictError } from '@harness-engineering/core';

const tf = (over: Partial<TrackedFeature> = {}): TrackedFeature => ({
  externalId: over.externalId ?? 'github:o/r#1',
  name: over.name ?? 'F',
  status: over.status ?? 'planned',
  summary: over.summary ?? 'summary',
  spec: over.spec ?? null,
  plans: over.plans ?? [],
  blockedBy: over.blockedBy ?? [],
  assignee: over.assignee ?? null,
  priority: over.priority ?? null,
  milestone: over.milestone ?? null,
  createdAt: over.createdAt ?? '2026-01-01T00:00:00Z',
  updatedAt: over.updatedAt ?? null,
});

interface ClientOverrides {
  fetchAll?: () => Promise<Result<{ features: TrackedFeature[]; etag: string | null }, Error>>;
  create?: (f: NewFeatureInput) => Promise<Result<TrackedFeature, Error>>;
  update?: (
    id: string,
    patch: FeaturePatch
  ) => Promise<Result<TrackedFeature, ConflictError | Error>>;
  appendHistory?: (id: string, event: HistoryEvent) => Promise<Result<void, Error>>;
}

function makeClient(over: ClientOverrides = {}): RoadmapTrackerClient {
  return {
    fetchAll: over.fetchAll ?? (async () => Ok({ features: [], etag: null })),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    create:
      over.create ?? (async (f: NewFeatureInput) => Ok(tf({ name: f.name, summary: f.summary }))),
    update: over.update ?? (async () => Ok(tf())),
    claim: async () => Ok(tf()),
    release: async () => Ok(tf()),
    complete: async () => Ok(tf()),
    appendHistory: over.appendHistory ?? (async () => Ok(undefined as void)),
    fetchHistory: async () => Ok([]),
  };
}

describe('handleManageRoadmapFileLess — dispatch + guards', () => {
  it('groom action is unsupported in file-less mode', async () => {
    const r = await handleManageRoadmapFileLess({ path: '/tmp', action: 'groom' }, makeClient());
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/file-based/i);
  });

  it('unknown action returns an error response', async () => {
    const r = await handleManageRoadmapFileLess(
      // deliberately invalid action
      { path: '/tmp', action: 'bogus' as unknown as 'show' },
      makeClient()
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/unknown action/i);
  });

  it('query without a filter is an error', async () => {
    const r = await handleManageRoadmapFileLess({ path: '/tmp', action: 'query' }, makeClient());
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/requires a filter/i);
  });

  it('query "blocked" returns only features with blockers', async () => {
    const features = [tf({ name: 'Alpha', blockedBy: ['x'] }), tf({ name: 'Beta', blockedBy: [] })];
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'query', filter: 'blocked' },
      makeClient({ fetchAll: async () => Ok({ features, etag: null }) })
    );
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('Alpha');
    expect(text).not.toContain('Beta');
  });

  it('query surfaces a fetchAll failure as an error', async () => {
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'query', filter: 'planned' },
      makeClient({ fetchAll: async () => Err(new Error('down')) })
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('down');
  });

  it('show with no features renders the empty placeholder', async () => {
    const r = await handleManageRoadmapFileLess({ path: '/tmp', action: 'show' }, makeClient());
    expect(r.isError).toBeUndefined();
    expect(r.content[0]?.text).toContain('(no features)');
  });

  it('show renders priority/assignee/externalId and summary lines', async () => {
    const features = [
      tf({
        name: 'Alpha',
        status: 'planned',
        milestone: 'M1',
        priority: 'P0',
        assignee: 'dev',
        externalId: 'github:o/r#5',
        summary: 'the summary line',
      }),
    ];
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'show' },
      makeClient({ fetchAll: async () => Ok({ features, etag: null }) })
    );
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('priority: P0');
    expect(text).toContain('assignee: dev');
    expect(text).toContain('externalId: github:o/r#5');
    expect(text).toContain('the summary line');
  });
});

describe('handleManageRoadmapFileLess — add/update error + optional fields', () => {
  it('add threads all optional fields into client.create', async () => {
    const create = vi.fn(async (f: NewFeatureInput) => Ok(tf({ name: f.name })));
    const r = await handleManageRoadmapFileLess(
      {
        path: '/tmp',
        action: 'add',
        feature: 'Full',
        summary: 'S',
        status: 'backlog',
        spec: 'docs/spec.md',
        plans: ['p1.md'],
        blocked_by: ['B'],
        milestone: 'M9',
        assignee: 'dev',
      },
      makeClient({ create })
    );
    expect(r.isError).toBeUndefined();
    const arg = create.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      name: 'Full',
      status: 'backlog',
      spec: 'docs/spec.md',
      plans: ['p1.md'],
      blockedBy: ['B'],
      milestone: 'M9',
      assignee: 'dev',
    });
  });

  it('add surfaces a create failure', async () => {
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'add', feature: 'X', summary: 'S' },
      makeClient({ create: async () => Err(new Error('create-failed')) })
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('create-failed');
  });

  it('update requires a feature name', async () => {
    const r = await handleManageRoadmapFileLess({ path: '/tmp', action: 'update' }, makeClient());
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/requires feature/i);
  });

  it('update threads summary/spec/plans/blocked_by/assignee into the patch', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    const update = vi.fn(async (id: string, _p: FeaturePatch) => Ok(tf({ externalId: id })));
    const r = await handleManageRoadmapFileLess(
      {
        path: '/tmp',
        action: 'update',
        feature: 'Alpha',
        summary: 'new sum',
        spec: 'new.md',
        plans: ['a.md'],
        blocked_by: ['C'],
        assignee: 'someone',
      },
      makeClient({ fetchAll: async () => Ok({ features, etag: null }), update })
    );
    expect(r.isError).toBeUndefined();
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      summary: 'new sum',
      spec: 'new.md',
      plans: ['a.md'],
      blockedBy: ['C'],
      assignee: 'someone',
    });
  });

  it('update surfaces a non-conflict update failure', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'update', feature: 'Alpha', status: 'done' },
      makeClient({
        fetchAll: async () => Ok({ features, etag: null }),
        update: async () => Err(new Error('write-broke')),
      })
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('write-broke');
  });

  it('update surfaces a fetchAll failure (resolveFeatureByName)', async () => {
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'update', feature: 'Alpha', status: 'done' },
      makeClient({ fetchAll: async () => Err(new Error('fetch-broke')) })
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('fetch-broke');
  });
});

describe('handleManageRoadmapFileLess — remove branches', () => {
  it('remove requires a feature name', async () => {
    const r = await handleManageRoadmapFileLess({ path: '/tmp', action: 'remove' }, makeClient());
    expect(r.isError).toBe(true);
  });

  it('remove appends completion history (best-effort) and succeeds', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    const appendHistory = vi.fn(async () => Ok(undefined as void));
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'remove', feature: 'Alpha' },
      makeClient({ fetchAll: async () => Ok({ features, etag: null }), appendHistory })
    );
    expect(r.isError).toBeUndefined();
    expect(appendHistory).toHaveBeenCalledTimes(1);
    expect(appendHistory.mock.calls[0]?.[1]).toMatchObject({ type: 'completed' });
  });

  it('remove reports a ConflictError from update', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    const conflict = new ConflictError(
      'github:o/r#42',
      { status: { ours: 'done', theirs: 'planned' } },
      null,
      'conflict'
    );
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'remove', feature: 'Alpha' },
      makeClient({
        fetchAll: async () => Ok({ features, etag: null }),
        update: async () => Err(conflict),
      })
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/conflict/i);
  });

  it('remove of a missing feature is an error', async () => {
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'remove', feature: 'Ghost' },
      makeClient({ fetchAll: async () => Ok({ features: [], etag: null }) })
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/not found/i);
  });
});

describe('handleManageRoadmapFileLess — promote branches', () => {
  const SPEC = 'docs/changes/x/proposal.md';

  it('promote requires a feature name', async () => {
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'promote', spec: SPEC },
      makeClient()
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/requires feature/i);
  });

  it('promote surfaces a fetchAll failure', async () => {
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'promote', feature: 'Alpha', spec: SPEC },
      makeClient({ fetchAll: async () => Err(new Error('fetch-down')) })
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('fetch-down');
  });

  it('promote is ambiguous when the same heading matches multiple rows', async () => {
    const features = [
      tf({ name: 'Alpha', status: 'backlog', milestone: 'M1' }),
      tf({ name: 'Alpha', status: 'backlog', milestone: 'M2' }),
    ];
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'promote', feature: 'Alpha', spec: SPEC },
      makeClient({ fetchAll: async () => Ok({ features, etag: null }) })
    );
    expect(r.isError).toBe(true);
    const env = JSON.parse(r.content[0]?.text ?? '{}');
    expect(env).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect(env.matches.length).toBe(2);
  });

  it('promote surfaces a create failure on a not-found row', async () => {
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'promote', feature: 'Brand New', spec: SPEC },
      makeClient({
        fetchAll: async () => Ok({ features: [], etag: null }),
        create: async () => Err(new Error('create-down')),
      })
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('create-down');
  });

  it('promote on a done row refuses', async () => {
    const features = [tf({ name: 'Alpha', status: 'done', spec: 'old.md' })];
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'promote', feature: 'Alpha', spec: SPEC },
      makeClient({ fetchAll: async () => Ok({ features, etag: null }) })
    );
    expect(r.isError).toBe(true);
    const env = JSON.parse(r.content[0]?.text ?? '{}');
    expect(env).toMatchObject({ ok: false, reason: 'done' });
  });

  it('promote fills an empty summary from the provided H1 on a backlog row', async () => {
    const captured: { patch?: FeaturePatch } = {};
    const features = [
      tf({ externalId: 'github:o/r#9', name: 'Alpha', status: 'backlog', summary: '—' }),
    ];
    const update = vi.fn(async (id: string, patch: FeaturePatch) => {
      captured.patch = patch;
      return Ok(tf({ externalId: id, name: 'Alpha', status: 'planned', spec: SPEC }));
    });
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'promote', feature: 'Alpha', spec: SPEC, summary: 'Fresh Title' },
      makeClient({ fetchAll: async () => Ok({ features, etag: null }), update })
    );
    expect(r.isError).toBe(false);
    expect(captured.patch).toMatchObject({ spec: SPEC, status: 'planned', summary: 'Fresh Title' });
  });

  it('promote reports a ConflictError from the update path', async () => {
    const features = [
      tf({ externalId: 'github:o/r#9', name: 'Alpha', status: 'backlog', spec: 'old.md' }),
    ];
    const conflict = new ConflictError(
      'github:o/r#9',
      { status: { ours: 'planned', theirs: 'done' } },
      null,
      'conflict'
    );
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'promote', feature: 'Alpha', spec: SPEC },
      makeClient({
        fetchAll: async () => Ok({ features, etag: null }),
        update: async () => Err(conflict),
      })
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/conflict/i);
  });
});
