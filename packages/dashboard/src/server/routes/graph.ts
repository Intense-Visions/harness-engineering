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
    ctx.cache.set(CACHE_KEY, data);

    const entry = ctx.cache.get<GraphResult>(CACHE_KEY)!;
    const response: ApiResponse<GraphResult> = {
      data: entry.data,
      timestamp: new Date(entry.timestamp).toISOString(),
    };
    return c.json(response);
  });

  return router;
}
