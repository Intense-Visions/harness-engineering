import { Hono } from 'hono';
import { gatherDecayTrends } from '../gather/decay-trends';
import type { TrendResult } from '@harness-engineering/core';
import type { ApiResponse } from '../../shared/types';
import type { ServerContext } from '../context';

const CACHE_KEY = 'decay-trends';

export function buildDecayTrendsRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/decay-trends', async (c) => {
    const trendData = await ctx.gatherCache.run<TrendResult>(CACHE_KEY, async () =>
      gatherDecayTrends(ctx.projectPath)
    );

    const response: ApiResponse<TrendResult> = {
      data: trendData,
      timestamp: new Date().toISOString(),
    };
    return c.json(response);
  });

  return router;
}
