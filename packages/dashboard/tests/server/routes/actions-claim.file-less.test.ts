/**
 * Phase 4 Task 12: file-less claim helper. Calls `client.claim(id, assignee)`
 * with the 409 TRACKER_CONFLICT shape on conflict.
 */
import { describe, it, expect, vi } from 'vitest';
import { Ok, Err, type Result } from '@harness-engineering/types';
import { handleClaimFileLess } from '../../../src/server/routes/actions-claim-file-less';
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
  claim?: (id: string, assignee: string) => Promise<Result<TrackedFeature, ConflictError | Error>>;
}

function makeClient(over: ClientOverrides = {}): RoadmapTrackerClient {
  return {
    fetchAll: over.fetchAll ?? (async () => Ok({ features: [], etag: null })),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    create: async (f: NewFeatureInput) => Ok(tf({ name: f.name, summary: f.summary })),
    update: async () => Ok(tf()),
    claim: over.claim ?? (async () => Ok(tf({ status: 'in-progress', assignee: 'orch-1' }))),
    release: async () => Ok(tf()),
    complete: async () => Ok(tf()),
    appendHistory: async (_id: string, _e: HistoryEvent) => Ok(undefined as void),
    fetchHistory: async () => Ok([]),
  };
}

interface MockResponse {
  status: number;
  body: unknown;
}

function makeContext() {
  const responses: MockResponse[] = [];
  const json = vi.fn((body: unknown, status?: number): unknown => {
    const r = { status: status ?? 200, body };
    responses.push(r);
    return r;
  });
  return {
    c: { json } as unknown as { json: (b: unknown, s?: number) => unknown },
    responses,
  };
}

describe('handleClaimFileLess (S3)', () => {
  it('successful claim: returns 200 with ClaimResponse shape', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    const claim = vi.fn(async (id: string, assignee: string) =>
      Ok(tf({ externalId: id, status: 'in-progress', assignee, name: 'Alpha' }))
    );
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
      claim,
    });
    const { c, responses } = makeContext();
    await handleClaimFileLess(c, client, { feature: 'Alpha', assignee: 'orch-1' });
    expect(responses).toHaveLength(1);
    expect(responses[0]?.status).toBe(200);
    const body = responses[0]?.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.feature).toBe('Alpha');
    expect(body.status).toBe('in-progress');
    expect(body.assignee).toBe('orch-1');
    expect(claim).toHaveBeenCalledWith('github:o/r#42', 'orch-1');
  });

  it('feature not found: returns 404', async () => {
    const client = makeClient({ fetchAll: async () => Ok({ features: [], etag: null }) });
    const { c, responses } = makeContext();
    await handleClaimFileLess(c, client, { feature: 'Missing', assignee: 'orch-1' });
    expect(responses[0]?.status).toBe(404);
    const body = responses[0]?.body as Record<string, unknown>;
    expect(body.error).toMatch(/Missing/);
  });

  it('ConflictError: returns 409 with TRACKER_CONFLICT shape', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    const claim = vi.fn(async () =>
      Err(
        new ConflictError(
          'github:o/r#42',
          { assignee: { ours: 'orch-1', theirs: 'other' } },
          'locked by other'
        )
      )
    );
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
      claim,
    });
    const { c, responses } = makeContext();
    await handleClaimFileLess(c, client, { feature: 'Alpha', assignee: 'orch-1' });
    expect(responses[0]?.status).toBe(409);
    const body = responses[0]?.body as Record<string, unknown>;
    expect(body.code).toBe('TRACKER_CONFLICT');
    expect(body.externalId).toBe('github:o/r#42');
    expect(body.refreshHint).toBe('reload-roadmap');
    expect(body.error).toMatch(/locked/);
    expect(body.conflictedWith).toBeDefined();
  });

  it('tracker fetchAll error: returns 502', async () => {
    const client = makeClient({ fetchAll: async () => Err(new Error('network')) });
    const { c, responses } = makeContext();
    await handleClaimFileLess(c, client, { feature: 'Alpha', assignee: 'orch-1' });
    expect(responses[0]?.status).toBe(502);
    const body = responses[0]?.body as Record<string, unknown>;
    expect(body.error).toMatch(/network/);
  });

  it('tracker claim non-conflict error: returns 502', async () => {
    const features = [tf({ name: 'Alpha', externalId: 'github:o/r#42' })];
    const claim = vi.fn(async () => Err(new Error('rate limit')));
    const client = makeClient({
      fetchAll: async () => Ok({ features, etag: null }),
      claim,
    });
    const { c, responses } = makeContext();
    await handleClaimFileLess(c, client, { feature: 'Alpha', assignee: 'orch-1' });
    expect(responses[0]?.status).toBe(502);
    const body = responses[0]?.body as Record<string, unknown>;
    expect(body.error).toMatch(/rate limit/);
  });
});
