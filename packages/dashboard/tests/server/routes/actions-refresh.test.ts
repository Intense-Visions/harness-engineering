import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { buildActionsRouter } from '../../../src/server/routes/actions';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import { SSEManager } from '../../../src/server/sse';

vi.mock('../../../src/server/gather/security', () => ({
  gatherSecurity: vi.fn().mockResolvedValue({
    valid: true,
    findings: [],
    stats: { filesScanned: 10, errorCount: 0, warningCount: 0, infoCount: 0 },
  }),
}));
vi.mock('../../../src/server/gather/perf', () => ({
  gatherPerf: vi.fn().mockResolvedValue({
    valid: true,
    violations: [],
    stats: { filesAnalyzed: 10, violationCount: 0 },
  }),
}));
vi.mock('../../../src/server/gather/arch', () => ({
  gatherArch: vi.fn().mockResolvedValue({
    passed: true,
    totalViolations: 0,
    regressions: [],
    newViolations: [],
  }),
}));
vi.mock('../../../src/server/gather/anomalies', () => ({
  gatherAnomalies: vi.fn().mockResolvedValue({
    outliers: [],
    articulationPoints: [],
    overlapCount: 0,
  }),
}));

function makeContext(): ServerContext {
  const sseManager = new SSEManager();
  vi.spyOn(sseManager, 'broadcast').mockResolvedValue(undefined);
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    chartsPath: '/fake/docs/roadmap-charts.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager,
    gatherCache: new GatherCache(),
  };
}

describe('POST /actions/refresh-checks', () => {
  let app: Hono;
  let ctx: ServerContext;

  beforeEach(() => {
    ctx = makeContext();
    app = new Hono();
    app.route('/api', buildActionsRouter(ctx));
  });

  it('returns 200 with checks data', async () => {
    const res = await app.request('/api/actions/refresh-checks', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks).toBeDefined();
    expect(body.checks.security).toBeDefined();
    expect(body.checks.perf).toBeDefined();
    expect(body.checks.arch).toBeDefined();
    expect(body.checks.anomalies).toBeDefined();
    expect(body.checks.lastRun).toBeTruthy();
  });

  it('broadcasts checks event via SSE manager', async () => {
    await app.request('/api/actions/refresh-checks', { method: 'POST' });
    expect(ctx.sseManager.broadcast).toHaveBeenCalledTimes(1);
    const broadcastCall = (ctx.sseManager.broadcast as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(broadcastCall.type).toBe('checks');
  });

  it('updates gatherCache entries', async () => {
    await app.request('/api/actions/refresh-checks', { method: 'POST' });
    expect(ctx.gatherCache.hasRun('security')).toBe(true);
    expect(ctx.gatherCache.hasRun('perf')).toBe(true);
    expect(ctx.gatherCache.hasRun('arch')).toBe(true);
    expect(ctx.gatherCache.hasRun('anomalies')).toBe(true);
  });
});
