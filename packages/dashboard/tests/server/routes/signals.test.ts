import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { ServerContext } from '../../../src/server/context';
import { DataCache } from '../../../src/server/cache';
import { GatherCache } from '../../../src/server/gather-cache';
import type { SignalsResult } from '@harness-engineering/signals';

const fakeSignals: SignalsResult = {
  signals: [
    {
      id: 'complexity-trend-up-30d',
      label: 'Complexity trend (30d)',
      value: 12,
      unit: 'count',
      trend: 'up',
      betterDirection: 'down',
      status: 'warn',
      threshold: { warn: 5, alert: 15 },
      history: [{ date: '2026-06-22', value: 12 }],
      detail: 'fake',
      source: 'arch/timeline.json',
    },
  ],
  generatedAt: '2026-06-22T00:00:00.000Z',
};

vi.mock('@harness-engineering/signals', () => ({
  gatherSignals: vi.fn(async () => fakeSignals),
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

describe('GET /api/signals', () => {
  let app: Hono;

  beforeEach(async () => {
    const { buildSignalsRouter } = await import('../../../src/server/routes/signals');
    app = new Hono();
    app.route('/api', buildSignalsRouter(makeCtx()));
  });

  it('returns 200 with the gathered signals shape', async () => {
    const res = await app.request('/api/signals');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SignalsResult; timestamp: string };
    expect(body.data.signals).toHaveLength(1);
    expect(body.data.signals[0].id).toBe('complexity-trend-up-30d');
    expect(body.data.generatedAt).toBe('2026-06-22T00:00:00.000Z');
    expect(body.timestamp).toBeTypeOf('string');
  });
});
