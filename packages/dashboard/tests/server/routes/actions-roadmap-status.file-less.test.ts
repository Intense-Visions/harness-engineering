/**
 * Phase 4 Task 14: file-less roadmap-status helper. Calls
 * `client.update(externalId, { status })` and surfaces ConflictError as a
 * 409 with the TRACKER_CONFLICT body shape (D-P4-B).
 */
import { describe, it, expect, vi } from 'vitest';
import { Ok, Err, type Result } from '@harness-engineering/types';
import { handleRoadmapStatusFileLess } from '../../../src/server/routes/actions-claim-file-less';
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
  update?: (
    id: string,
    patch: FeaturePatch
  ) => Promise<Result<TrackedFeature, ConflictError | Error>>;
}

function makeClient(over: ClientOverrides = {}): RoadmapTrackerClient {
  return {
    fetchAll: over.fetchAll ?? (async () => Ok({ features: [], etag: null })),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    create: async (f: NewFeatureInput) => Ok(tf({ name: f.name, summary: f.summary })),
    update: over.update ?? (async () => Ok(tf())),
    claim: async () => Ok(tf()),
    release: async () => Ok(tf()),
    complete: async () => Ok(tf()),
    appendHistory: async (_id: string, _e: HistoryEvent) => Ok(undefined as void),
    fetchHistory: async () => Ok([]),
  };
}

function makeContext() {
  const responses: { status: number; body: unknown }[] = [];
  const json = vi.fn((body: unknown, status?: number): unknown => {
    const r = { status: status ?? 200, body };
    responses.push(r);
    return r;
  });
  return {
    c: { json } as { json: (b: unknown, s?: number) => unknown },
    responses,
  };
}

describe('handleRoadmapStatusFileLess (S5)', () => {
  it('valid status update: 200 with feature/status', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#1' })];
    const update = vi.fn(async (id: string, patch: FeaturePatch) =>
      Ok(tf({ externalId: id, name: 'Alpha', status: patch.status as TrackedFeature['status'] }))
    );
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
      update,
    });
    const { c, responses } = makeContext();
    await handleRoadmapStatusFileLess(c, client, { feature: 'Alpha', status: 'in-progress' });
    expect(responses[0]?.status).toBe(200);
    const body = responses[0]?.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.feature).toBe('Alpha');
    expect(body.status).toBe('in-progress');
    expect(update).toHaveBeenCalledWith('github:o/r#1', { status: 'in-progress' });
  });

  it('feature not found: 404', async () => {
    const client = makeClient({ fetchAll: async () => Ok({ features: [], etag: null }) });
    const { c, responses } = makeContext();
    await handleRoadmapStatusFileLess(c, client, { feature: 'X', status: 'in-progress' });
    expect(responses[0]?.status).toBe(404);
  });

  it('invalid status: 400', async () => {
    const client = makeClient();
    const { c, responses } = makeContext();
    await handleRoadmapStatusFileLess(c, client, { feature: 'Alpha', status: 'not-a-status' });
    expect(responses[0]?.status).toBe(400);
  });

  it('ConflictError: 409 with TRACKER_CONFLICT shape', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#1' })];
    const update = vi.fn(async () =>
      Err(
        new ConflictError(
          'github:o/r#1',
          { status: { ours: 'in-progress', theirs: 'done' } },
          null,
          'status changed'
        )
      )
    );
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
      update,
    });
    const { c, responses } = makeContext();
    await handleRoadmapStatusFileLess(c, client, { feature: 'Alpha', status: 'in-progress' });
    expect(responses[0]?.status).toBe(409);
    const body = responses[0]?.body as Record<string, unknown>;
    expect(body.code).toBe('TRACKER_CONFLICT');
    expect(body.externalId).toBe('github:o/r#1');
    expect(body.refreshHint).toBe('reload-roadmap');
  });

  it('missing fields: 400', async () => {
    const client = makeClient();
    const { c, responses } = makeContext();
    await handleRoadmapStatusFileLess(c, client, { feature: '', status: '' });
    expect(responses[0]?.status).toBe(400);
  });
});
