import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import type { SecurityData } from '../../../src/shared/types';

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

describe('GET /api/ci', () => {
  let app: Hono;
  let ctx: ServerContext;

  beforeEach(async () => {
    ctx = makeCtx();
    const { buildCIRouter } = await import('../../../src/server/routes/ci');
    app = new Hono();
    app.route('/api', buildCIRouter(ctx));
  });

  it('returns 200 with empty checks when cache is empty', async () => {
    const res = await app.request('/api/ci');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { checks: unknown[]; lastRun: null };
      timestamp: string;
    };
    expect(body.data.checks).toEqual([]);
    expect(body.data.lastRun).toBeNull();
    expect(body.timestamp).toBeTypeOf('string');
  });

  it('returns 200 with check data when cache has entries', async () => {
    const securityData: SecurityData = {
      valid: true,
      findings: [],
      stats: { filesScanned: 10, errorCount: 0, warningCount: 0, infoCount: 0 },
    };
    await ctx.gatherCache.run('security', async () => securityData);

    const res = await app.request('/api/ci');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { checks: { name: string }[]; lastRun: string } };
    expect(body.data.checks).toHaveLength(1);
    expect(body.data.checks[0].name).toBe('check-security');
    expect(body.data.lastRun).toBeTruthy();
  });
});
