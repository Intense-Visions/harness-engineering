import { Hono } from 'hono';
import type { ServerContext } from '../context';
import { gatherCI } from '../gather/ci';
import type { ApiResponse, CIData } from '../../shared/types';

export function buildCIRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/ci', (c) => {
    const data = gatherCI(ctx.gatherCache);

    const response: ApiResponse<CIData> = {
      data,
      timestamp: new Date().toISOString(),
    };
    return c.json(response);
  });

  return router;
}
