import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import type { SecurityData, PerfData, ArchData } from '../../../src/shared/types';

vi.mock('../../../src/server/gather/health', () => ({
  gatherHealth: vi.fn().mockResolvedValue({
    totalIssues: 3,
    errors: 0,
    warnings: 3,
    fixableCount: 1,
    suggestionCount: 0,
    durationMs: 150,
    analysisErrors: [],
  }),
}));

const mockSecurity: SecurityData = {
  valid: true,
  findings: [
    {
      ruleId: 'no-hardcoded-secrets',
      category: 'secrets',
      severity: 'warning',
      file: 'src/config.ts',
      line: 10,
      message: 'Possible hardcoded secret',
    },
  ],
  stats: { filesScanned: 50, errorCount: 0, warningCount: 1, infoCount: 0 },
};

const mockPerf: PerfData = {
  valid: false,
  violations: [
    {
      metric: 'complexity',
      file: 'src/engine.ts',
      value: 25,
      threshold: 15,
      severity: 'error',
    },
  ],
  stats: { filesAnalyzed: 30, violationCount: 1 },
};

const mockArch: ArchData = {
  passed: false,
  totalViolations: 2,
  regressions: [{ category: 'coupling', delta: 1 }],
  newViolations: [
    { file: 'src/api.ts', detail: 'Direct import of internal module', severity: 'error' },
  ],
};

function makeCtxWithCache(): ServerContext {
  const gc = new GatherCache();
  // Pre-populate the gather cache
  gc.refresh('security', async () => mockSecurity);
  gc.refresh('perf', async () => mockPerf);
  gc.refresh('arch', async () => mockArch);
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    chartsPath: '/fake/docs/roadmap-charts.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 30_000,
    sseManager: undefined!,
    gatherCache: gc,
  };
}

function makeCtxWithoutCache(): ServerContext {
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

describe('GET /api/health (extended)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes security/perf/arch data when GatherCache is populated', async () => {
    const ctx = makeCtxWithCache();
    // Wait for async cache population
    await new Promise((r) => setTimeout(r, 10));

    const { buildHealthRouter } = await import('../../../src/server/routes/health');
    const app = new Hono();
    app.route('/api', buildHealthRouter(ctx));

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = (
      body as { data: { health: unknown; security: unknown; perf: unknown; arch: unknown } }
    ).data;

    expect(data.health).toBeDefined();
    expect(data.security).toEqual(mockSecurity);
    expect(data.perf).toEqual(mockPerf);
    expect(data.arch).toEqual(mockArch);
  });

  it('returns null for security/perf/arch when GatherCache is empty', async () => {
    const ctx = makeCtxWithoutCache();
    const { buildHealthRouter } = await import('../../../src/server/routes/health');
    const app = new Hono();
    app.route('/api', buildHealthRouter(ctx));

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = (body as { data: { security: null; perf: null; arch: null } }).data;

    expect(data.security).toBeNull();
    expect(data.perf).toBeNull();
    expect(data.arch).toBeNull();
  });

  it('returns security error when security gatherer failed', async () => {
    const gc = new GatherCache();
    await gc.refresh('security', async () => ({ error: 'Scanner unavailable' }));
    const ctx: ServerContext = {
      projectPath: '/fake',
      roadmapPath: '/fake/docs/roadmap.md',
      chartsPath: '/fake/docs/roadmap-charts.md',
      cache: new DataCache(60_000),
      pollIntervalMs: 30_000,
      sseManager: undefined!,
      gatherCache: gc,
    };

    const { buildHealthRouter } = await import('../../../src/server/routes/health');
    const app = new Hono();
    app.route('/api', buildHealthRouter(ctx));

    const res = await app.request('/api/health');
    const body = await res.json();
    const data = (body as { data: { security: { error: string } } }).data;

    expect(data.security).toEqual({ error: 'Scanner unavailable' });
  });
});
