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
    ctx.cache.set(CACHE_KEY, data);

    const entry = ctx.cache.get<HealthResult>(CACHE_KEY)!;
    const response: ApiResponse<HealthResult> = {
      data: entry.data,
      timestamp: new Date(entry.timestamp).toISOString(),
    };
    return c.json(response);
  });

  return router;
}
