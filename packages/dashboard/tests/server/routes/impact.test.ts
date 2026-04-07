import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import type { AnomalyData } from '../../../src/shared/types';

// Mock blast-radius gatherer
vi.mock('../../../src/server/gather/blast-radius', () => ({
  gatherBlastRadius: vi.fn().mockResolvedValue({
    sourceNodeId: 'node-1',
    sourceName: 'index.ts',
    layers: [
      {
        depth: 1,
        nodes: [
          {
            nodeId: 'node-2',
            name: 'utils.ts',
            type: 'file',
            probability: 0.8,
            parentId: 'node-1',
          },
        ],
      },
    ],
    summary: {
      totalAffected: 1,
      maxDepth: 1,
      highRisk: 0,
      mediumRisk: 1,
      lowRisk: 0,
    },
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

describe('GET /api/impact/anomalies', () => {
  let app: Hono;
  let ctx: ServerContext;

  beforeEach(async () => {
    ctx = makeCtx();
    const { buildImpactRouter } = await import('../../../src/server/routes/impact');
    app = new Hono();
    app.route('/api', buildImpactRouter(ctx));
  });

  it('returns empty anomalies when cache has no data', async () => {
    const res = await app.request('/api/impact/anomalies');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { outliers: unknown[]; articulationPoints: unknown[]; overlapCount: number };
      timestamp: string;
    };
    expect(body.data.outliers).toEqual([]);
    expect(body.data.articulationPoints).toEqual([]);
    expect(body.data.overlapCount).toBe(0);
    expect(body.timestamp).toBeTypeOf('string');
  });

  it('returns cached anomaly data when available', async () => {
    const anomalyData: AnomalyData = {
      outliers: [
        { nodeId: 'n1', name: 'big.ts', type: 'file', metric: 'inDegree', value: 42, zScore: 3.5 },
      ],
      articulationPoints: [
        { nodeId: 'n2', name: 'core.ts', componentsIfRemoved: 3, dependentCount: 15 },
      ],
      overlapCount: 1,
    };
    await ctx.gatherCache.run('anomalies', async () => anomalyData);

    const res = await app.request('/api/impact/anomalies');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: AnomalyData };
    expect(body.data.outliers).toHaveLength(1);
    expect(body.data.outliers[0].nodeId).toBe('n1');
    expect(body.data.articulationPoints).toHaveLength(1);
    expect(body.data.articulationPoints[0].dependentCount).toBe(15);
  });

  it('returns empty data when cache has unavailable result', async () => {
    await ctx.gatherCache.run('anomalies', async () => ({
      available: false,
      reason: 'Graph not found',
    }));

    const res = await app.request('/api/impact/anomalies');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: AnomalyData };
    expect(body.data.outliers).toEqual([]);
  });
});

describe('POST /api/impact/blast-radius', () => {
  let app: Hono;
  let ctx: ServerContext;

  beforeEach(async () => {
    ctx = makeCtx();
    const { buildImpactRouter } = await import('../../../src/server/routes/impact');
    app = new Hono();
    app.route('/api', buildImpactRouter(ctx));
  });

  it('returns 400 when nodeId is missing', async () => {
    const res = await app.request('/api/impact/blast-radius', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('nodeId is required');
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await app.request('/api/impact/blast-radius', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid JSON body');
  });

  it('returns blast radius data for valid nodeId', async () => {
    const res = await app.request('/api/impact/blast-radius', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: 'node-1', maxDepth: 2 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sourceNodeId: string; layers: unknown[]; summary: { totalAffected: number } };
    };
    expect(body.data.sourceNodeId).toBe('node-1');
    expect(body.data.layers).toHaveLength(1);
    expect(body.data.summary.totalAffected).toBe(1);
  });

  it('calls gatherBlastRadius with correct arguments', async () => {
    const { gatherBlastRadius } = await import('../../../src/server/gather/blast-radius');

    await app.request('/api/impact/blast-radius', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: 'test-node', maxDepth: 4 }),
    });

    expect(gatherBlastRadius).toHaveBeenCalledWith('/fake', 'test-node', 4);
  });
});
