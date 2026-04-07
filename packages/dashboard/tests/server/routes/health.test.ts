import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';

vi.mock('../../../src/server/gather/health', () => ({
  gatherHealth: vi.fn().mockResolvedValue({
    totalIssues: 5,
    errors: 1,
    warnings: 4,
    fixableCount: 2,
    suggestionCount: 0,
    durationMs: 200,
    analysisErrors: [],
  }),
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

describe('GET /api/health', () => {
  let app: Hono;

  beforeEach(async () => {
    const { buildHealthRouter } = await import('../../../src/server/routes/health');
    app = new Hono();
    app.route('/api', buildHealthRouter(makeCtx()));
  });

  it('returns 200 with ExtendedHealthData', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { health: { totalIssues: number }; security: null; perf: null; arch: null };
      timestamp: string;
    };
    expect(body.data.health.totalIssues).toBe(5);
    expect(body.data.security).toBeNull();
    expect(body.data.perf).toBeNull();
    expect(body.data.arch).toBeNull();
    expect(body.timestamp).toBeTypeOf('string');
  });
});
