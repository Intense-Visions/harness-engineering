import { Hono } from 'hono';
import { gatherRoadmap } from '../gather/roadmap';
import { gatherHealth } from '../gather/health';
import { gatherGraph } from '../gather/graph';
import type { ApiResponse, OverviewData } from '../../shared/types';
import type { ServerContext } from '../context';

const CACHE_KEY = 'overview';

export function buildOverviewRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/overview', async (c) => {
    const cached = ctx.cache.get<OverviewData>(CACHE_KEY);
    if (cached) {
      const response: ApiResponse<OverviewData> = {
        data: cached.data,
        timestamp: new Date(cached.timestamp).toISOString(),
      };
      return c.json(response);
    }

    const [roadmap, health, graph] = await Promise.all([
      gatherRoadmap(ctx.roadmapPath),
      gatherHealth(ctx.projectPath),
      gatherGraph(ctx.projectPath),
    ]);

    const data: OverviewData = { roadmap, health, graph };
    const now = Date.now();
    ctx.cache.set(CACHE_KEY, data);

    const response: ApiResponse<OverviewData> = {
      data,
      timestamp: new Date(now).toISOString(),
    };
    return c.json(response);
  });

  return router;
}
