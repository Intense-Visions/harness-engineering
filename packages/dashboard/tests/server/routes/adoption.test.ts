import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';

const FAKE_SNAPSHOT = {
  period: 'all-time',
  totalInvocations: 3,
  uniqueSkills: 2,
  topSkills: [
    {
      skill: 'harness-brainstorming',
      invocations: 2,
      successRate: 0.5,
      avgDuration: 6000,
      lastUsed: '2026-04-16T12:00:00.000Z',
    },
    {
      skill: 'harness-planning',
      invocations: 1,
      successRate: 1,
      avgDuration: 10000,
      lastUsed: '2026-04-16T13:00:00.000Z',
    },
  ],
  generatedAt: '2026-04-16T14:00:00.000Z',
};

vi.mock('../../../src/server/gather/adoption', () => ({
  gatherAdoption: vi.fn().mockReturnValue(FAKE_SNAPSHOT),
}));

function makeCtx(): ServerContext {
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    chartsPath: '/fake/docs/roadmap-charts.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager: undefined!,
    gatherCache: new GatherCache(),
  };
}

describe('GET /api/adoption', () => {
  let app: Hono;

  beforeEach(async () => {
    const { buildAdoptionRouter } = await import('../../../src/server/routes/adoption');
    app = new Hono();
    app.route('/api', buildAdoptionRouter(makeCtx()));
  });

  it('returns 200 with AdoptionSnapshot', async () => {
    const res = await app.request('/api/adoption');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof FAKE_SNAPSHOT; timestamp: string };
    expect(body.data.totalInvocations).toBe(3);
    expect(body.data.uniqueSkills).toBe(2);
    expect(body.data.topSkills).toHaveLength(2);
    expect(body.data.topSkills[0]!.skill).toBe('harness-brainstorming');
    expect(body.timestamp).toBeTypeOf('string');
  });
});
