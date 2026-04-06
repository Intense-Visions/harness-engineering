import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';

const FAKE_ROADMAP_DATA = {
  milestones: [
    {
      name: 'M1',
      isBacklog: false,
      total: 2,
      done: 1,
      inProgress: 0,
      planned: 1,
      blocked: 0,
      backlog: 0,
    },
  ],
  features: [
    {
      name: 'feat-a',
      status: 'done',
      summary: 'first',
      milestone: 'M1',
      blockedBy: [],
      assignee: null,
      priority: null,
    },
    {
      name: 'feat-b',
      status: 'planned',
      summary: 'second',
      milestone: 'M1',
      blockedBy: ['feat-a'],
      assignee: null,
      priority: null,
    },
  ],
  totalFeatures: 2,
  totalDone: 1,
  totalInProgress: 0,
  totalPlanned: 1,
  totalBlocked: 0,
  totalBacklog: 0,
};

vi.mock('../../../src/server/gather/roadmap', () => ({
  gatherRoadmap: vi.fn().mockResolvedValue(FAKE_ROADMAP_DATA),
}));

function makeCtx(): ServerContext {
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    chartsPath: '/fake/docs/roadmap-charts.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager: undefined!,
    gatherCache: undefined!,
  };
}

describe('GET /api/roadmap', () => {
  let app: Hono;

  beforeEach(async () => {
    const { buildRoadmapRouter } = await import('../../../src/server/routes/roadmap');
    app = new Hono();
    app.route('/api', buildRoadmapRouter(makeCtx()));
  });

  it('returns 200 with RoadmapResult', async () => {
    const res = await app.request('/api/roadmap');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof FAKE_ROADMAP_DATA; timestamp: string };
    expect(body.data.totalFeatures).toBe(2);
    expect(body.data.milestones).toHaveLength(1);
    expect(body.timestamp).toBeTypeOf('string');
  });
});

describe('GET /api/roadmap/charts', () => {
  let app: Hono;

  beforeEach(async () => {
    const { buildRoadmapRouter } = await import('../../../src/server/routes/roadmap');
    app = new Hono();
    app.route('/api', buildRoadmapRouter(makeCtx()));
  });

  it('returns 200 with chart-shaped data', async () => {
    const res = await app.request('/api/roadmap/charts');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        milestones: unknown[];
        features: unknown[];
        blockerEdges: unknown[];
      };
      timestamp: string;
    };
    expect(body.data.milestones).toBeDefined();
    expect(body.data.features).toBeDefined();
    expect(Array.isArray(body.data.blockerEdges)).toBe(true);
  });

  it('derives blocker edges from features with blockedBy', async () => {
    const res = await app.request('/api/roadmap/charts');
    const body = (await res.json()) as {
      data: { blockerEdges: { from: string; to: string }[] };
    };
    expect(body.data.blockerEdges).toEqual([{ from: 'feat-a', to: 'feat-b' }]);
  });

  it('returns empty blockerEdges when no blockers exist', async () => {
    const { gatherRoadmap } = await import('../../../src/server/gather/roadmap');
    vi.mocked(gatherRoadmap).mockResolvedValueOnce({
      ...FAKE_ROADMAP_DATA,
      features: [{ ...FAKE_ROADMAP_DATA.features[0], blockedBy: [] }],
    });
    const res = await app.request('/api/roadmap/charts');
    const body = (await res.json()) as { data: { blockerEdges: unknown[] } };
    expect(body.data.blockerEdges).toHaveLength(0);
  });
});
