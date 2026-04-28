import { Hono } from 'hono';
import { gatherTraceability, type TraceabilitySnapshot } from '../gather/traceability';
import type { ApiResponse } from '../../shared/types';
import type { ServerContext } from '../context';

const CACHE_KEY = 'traceability';

export function buildTraceabilityRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/traceability', async (c) => {
    const traceabilityData = await ctx.gatherCache.run<TraceabilitySnapshot | null>(
      CACHE_KEY,
      async () => gatherTraceability(ctx.projectPath)
    );

    const response: ApiResponse<TraceabilitySnapshot | null> = {
      data: traceabilityData,
      timestamp: new Date().toISOString(),
    };
    return c.json(response);
  });

  return router;
}
