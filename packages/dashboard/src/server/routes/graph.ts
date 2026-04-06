import { Hono } from 'hono';
import { gatherGraph } from '../gather/graph';
import type { ApiResponse, GraphResult } from '../../shared/types';
import type { ServerContext } from '../context';

const CACHE_KEY = 'graph';

export function buildGraphRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/graph', async (c) => {
    const cached = ctx.cache.get<GraphResult>(CACHE_KEY);
    if (cached) {
      const response: ApiResponse<GraphResult> = {
        data: cached.data,
        timestamp: new Date(cached.timestamp).toISOString(),
      };
      return c.json(response);
    }

    const data = await gatherGraph(ctx.projectPath);
    const now = Date.now();
    ctx.cache.set(CACHE_KEY, data);

    const response: ApiResponse<GraphResult> = {
      data,
      timestamp: new Date(now).toISOString(),
    };
    return c.json(response);
  });

  return router;
}
