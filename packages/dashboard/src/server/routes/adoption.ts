import { Hono } from 'hono';
import { gatherAdoption } from '../gather/adoption';
import type { AdoptionSnapshot } from '@harness-engineering/types';
import type { ApiResponse } from '../../shared/types';
import type { ServerContext } from '../context';

const CACHE_KEY = 'adoption';

export function buildAdoptionRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/adoption', async (c) => {
    const adoptionData = await ctx.gatherCache.run<AdoptionSnapshot>(CACHE_KEY, async () =>
      gatherAdoption(ctx.projectPath)
    );

    const response: ApiResponse<AdoptionSnapshot> = {
      data: adoptionData,
      timestamp: new Date().toISOString(),
    };
    return c.json(response);
  });

  return router;
}
