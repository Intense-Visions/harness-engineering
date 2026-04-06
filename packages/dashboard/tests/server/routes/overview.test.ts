import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';

vi.mock('../../../src/server/gather/roadmap', () => ({
  gatherRoadmap: vi.fn().mockResolvedValue({
    milestones: [],
    features: [],
    totalFeatures: 3,
    totalDone: 1,
    totalInProgress: 1,
    totalPlanned: 1,
    totalBlocked: 0,
    totalBacklog: 0,
  }),
}));
vi.mock('../../../src/server/gather/health', () => ({
  gatherHealth: vi.fn().mockResolvedValue({
    totalIssues: 2,
    errors: 0,
    warnings: 2,
    fixableCount: 1,
    suggestionCount: 0,
    durationMs: 100,
    analysisErrors: [],
  }),
}));
vi.mock('../../../src/server/gather/graph', () => ({
  gatherGraph: vi.fn().mockResolvedValue({ available: false, reason: 'no graph' }),
}));

function makeCtx(): ServerContext {
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
  };
}

describe('GET /api/overview', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { buildOverviewRouter } = await import('../../../src/server/routes/overview');
    app = new Hono();
    app.route('/api', buildOverviewRouter(makeCtx()));
  });

  it('returns 200 with OverviewData', async () => {
    const res = await app.request('/api/overview');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { roadmap: unknown; health: unknown; graph: unknown };
      timestamp: string;
    };
    expect(body.data.roadmap).toBeDefined();
    expect(body.data.health).toBeDefined();
    expect(body.data.graph).toBeDefined();
    expect(body.timestamp).toBeTypeOf('string');
  });

  it('uses cached result on second call', async () => {
    const { gatherRoadmap } = await import('../../../src/server/gather/roadmap');
    await app.request('/api/overview');
    await app.request('/api/overview');
    expect(vi.mocked(gatherRoadmap)).toHaveBeenCalledTimes(1);
  });
});
