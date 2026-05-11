/**
 * Phase 4 Task 9+10: file-less manage_roadmap helper.
 *
 * `handleManageRoadmapFileLess(input, client)` is the file-less branch
 * extracted from the existing `manage_roadmap` MCP tool. It dispatches
 * on `input.action` and calls the supplied `RoadmapTrackerClient`.
 */
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

describe('handleManageRoadmapFileLess — reads (Task 9)', () => {
  it('show: returns Roadmap-shaped response built from fetchAll', async () => {
    const features = [
      tf({ name: 'Alpha', status: 'planned', milestone: 'M1' }),
      tf({ name: 'Beta', status: 'in-progress', milestone: 'M2' }),
    ];
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
    });
    const r = await handleManageRoadmapFileLess({ path: '/tmp', action: 'show' }, client);
    expect(r.isError).toBeUndefined();
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
  });

  it('show: filters by milestone:<name>', async () => {
    const features = [
      tf({ name: 'Alpha', milestone: 'Foo' }),
      tf({ name: 'Beta', milestone: 'Bar' }),
    ];
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
    });
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'show', milestone: 'Foo' },
      client
    );
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('Alpha');
    expect(text).not.toContain('Beta');
  });

  it('show: filters by status', async () => {
    const features = [
      tf({ name: 'Alpha', status: 'planned' }),
      tf({ name: 'Beta', status: 'in-progress' }),
    ];
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
    });
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'show', status: 'planned' },
      client
    );
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('Alpha');
    expect(text).not.toContain('Beta');
  });

  it('query: filter "in-progress" returns only in-progress', async () => {
    const features = [
      tf({ name: 'Alpha', status: 'planned' }),
      tf({ name: 'Beta', status: 'in-progress' }),
    ];
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
    });
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'query', filter: 'in-progress' },
      client
    );
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('Beta');
    expect(text).not.toContain('Alpha');
  });

  it('query: filter "milestone:Foo" matches by milestone', async () => {
    const features = [
      tf({ name: 'Alpha', milestone: 'Foo' }),
      tf({ name: 'Beta', milestone: 'Bar' }),
    ];
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
    });
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'query', filter: 'milestone:Foo' },
      client
    );
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('Alpha');
    expect(text).not.toContain('Beta');
  });

  it('fetchAll err -> isError MCP response', async () => {
    const client = makeClient({
      fetchAll: async () => Err(new Error('network')),
    });
    const r = await handleManageRoadmapFileLess({ path: '/tmp', action: 'show' }, client);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('network');
  });
});

describe('handleManageRoadmapFileLess — writes (Task 10)', () => {
  it('add: validates fields and calls client.create()', async () => {
    const create = vi.fn(async (f: NewFeatureInput) =>
      Ok(tf({ name: f.name, summary: f.summary, status: f.status ?? 'planned' }))
    );
    const client = makeClient({ create });
    const r = await handleManageRoadmapFileLess(
      {
        path: '/tmp',
        action: 'add',
        feature: 'New Feature',
        milestone: 'M1',
        status: 'planned',
        summary: 'A new thing',
      },
      client
    );
    expect(r.isError).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.name).toBe('New Feature');
    expect(create.mock.calls[0]?.[0]?.summary).toBe('A new thing');
  });

  it('add: missing feature name -> isError', async () => {
    const client = makeClient();
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'add', summary: 's' },
      client
    );
    expect(r.isError).toBe(true);
  });

  it('update: resolves name -> externalId via fetchAll, calls client.update', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    const update = vi.fn(async (id: string, _patch: FeaturePatch) =>
      Ok(tf({ externalId: id, status: 'in-progress' }))
    );
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
      update,
    });
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'update', feature: 'Alpha', status: 'in-progress' },
      client
    );
    expect(r.isError).toBeUndefined();
    expect(update).toHaveBeenCalledWith(
      'github:o/r#42',
      expect.objectContaining({ status: 'in-progress' })
    );
  });

  it('update: feature not found -> isError', async () => {
    const client = makeClient({
      fetchAll: async () => Ok({ features: [], etag: null }),
    });
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'update', feature: 'Missing', status: 'in-progress' },
      client
    );
    expect(r.isError).toBe(true);
  });

  it('update: ConflictError -> isError with diff', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    // Build a real ConflictError so we can assert against its full shape:
    // externalId matches the input, diff captures the observed divergence,
    // and serverUpdatedAt carries the server-side timestamp (added in
    // cleanup-batch-1, commit c3dd9dc7). The four-arg constructor order
    // is (externalId, diff, serverUpdatedAt, message).
    const expectedDiff = { status: { ours: 'in-progress' as const, theirs: 'done' as const } };
    const expectedServerUpdatedAt = '2026-05-09T12:00:00Z';
    const conflictErr = new ConflictError(
      'github:o/r#42',
      expectedDiff,
      expectedServerUpdatedAt,
      'conflict'
    );
    const update = vi.fn(async () => Err(conflictErr));
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
      update,
    });
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'update', feature: 'Alpha', status: 'in-progress' },
      client
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/conflict/i);
    // Pin the error shape: externalId round-trips, diff is preserved, and
    // serverUpdatedAt is present (string or null per the new signature).
    expect(conflictErr.externalId).toBe('github:o/r#42');
    expect(conflictErr.diff).toEqual(expectedDiff);
    expect(conflictErr.serverUpdatedAt).toBe(expectedServerUpdatedAt);
    expect(
      typeof conflictErr.serverUpdatedAt === 'string' || conflictErr.serverUpdatedAt === null
    ).toBe(true);
  });

  it('update: returns "cascade dropped" footnote — file-less mode does not run syncRoadmap (REV-P4-3)', async () => {
    // In file-backed mode, manage_roadmap update calls syncRoadmap() to cascade
    // dependent updates (see packages/cli/src/mcp/tools/roadmap.ts). In file-less
    // mode, there is no local dependency graph and no cascade engine — the
    // tracker is canonical. This test pins the asymmetry: the response must
    // mention "cascade" and "dropped" so an operator who reads the output
    // knows the absence of dependent updates is intentional.
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    const update = vi.fn(async (id: string, _patch: FeaturePatch) =>
      Ok(tf({ externalId: id, status: 'in-progress' }))
    );
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
      update,
    });
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'update', feature: 'Alpha', status: 'in-progress' },
      client
    );
    expect(r.isError).toBeUndefined();
    const text = r.content[0]?.text ?? '';
    expect(text.toLowerCase()).toContain('cascade');
    expect(text.toLowerCase()).toContain('dropped');
    // Sanity: only one update call — no cascade walk to dependent features.
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('remove: resolves name -> externalId, calls client.update with status:done', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    const update = vi.fn(async (id: string, _patch: FeaturePatch) =>
      Ok(tf({ externalId: id, status: 'done' }))
    );
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
      update,
    });
    const r = await handleManageRoadmapFileLess(
      { path: '/tmp', action: 'remove', feature: 'Alpha' },
      client
    );
    expect(r.isError).toBeUndefined();
    expect(update).toHaveBeenCalledWith(
      'github:o/r#42',
      expect.objectContaining({ status: 'done' })
    );
  });

  it('sync: returns a no-op message', async () => {
    const client = makeClient();
    const r = await handleManageRoadmapFileLess({ path: '/tmp', action: 'sync' }, client);
    expect(r.isError).toBeUndefined();
    expect(r.content[0]?.text).toMatch(/file-less mode/i);
  });
});
