import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';

vi.mock('../../../src/server/gather/graph', () => ({
  gatherGraph: vi.fn().mockResolvedValue({ available: false, reason: 'not connected' }),
}));

function makeCtx(): ServerContext {
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
  };
}

describe('GET /api/graph', () => {
  let app: Hono;

  beforeEach(async () => {
    const { buildGraphRouter } = await import('../../../src/server/routes/graph');
    app = new Hono();
    app.route('/api', buildGraphRouter(makeCtx()));
  });

  it('returns 200 with GraphResult', async () => {
    const res = await app.request('/api/graph');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { available: boolean }; timestamp: string };
    expect(body.data.available).toBe(false);
    expect(body.timestamp).toBeTypeOf('string');
  });
});
