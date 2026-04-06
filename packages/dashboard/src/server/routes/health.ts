import { Hono } from 'hono';
import { gatherHealth } from '../gather/health';
import type { ApiResponse, HealthResult } from '../../shared/types';
import type { ServerContext } from '../context';

const CACHE_KEY = 'health';

export function buildHealthRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/health', async (c) => {
    const cached = ctx.cache.get<HealthResult>(CACHE_KEY);
    if (cached) {
      const response: ApiResponse<HealthResult> = {
        data: cached.data,
        timestamp: new Date(cached.timestamp).toISOString(),
      };
      return c.json(response);
    }

    const data = await gatherHealth(ctx.projectPath);
    const now = Date.now();
    ctx.cache.set(CACHE_KEY, data);

    const response: ApiResponse<HealthResult> = {
      data,
      timestamp: new Date(now).toISOString(),
    };
    return c.json(response);
  });

  return router;
}
