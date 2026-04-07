import { Hono } from 'hono';
import { gatherHealth } from '../gather/health';
import type {
  ApiResponse,
  HealthResult,
  ExtendedHealthData,
  SecurityResult,
  PerfResult,
  ArchResult,
} from '../../shared/types';
import type { ServerContext } from '../context';

const CACHE_KEY = 'health';

export function buildHealthRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/health', async (c) => {
    // Get entropy-based health data (TTL-cached)
    let healthResult: HealthResult;
    const cached = ctx.cache.get<HealthResult>(CACHE_KEY);
    if (cached) {
      healthResult = cached.data;
    } else {
      healthResult = await gatherHealth(ctx.projectPath);
      ctx.cache.set(CACHE_KEY, healthResult);
    }

    // Get expensive gather data from GatherCache (null if not yet run)
    const security = ctx.gatherCache.get<SecurityResult>('security');
    const perf = ctx.gatherCache.get<PerfResult>('perf');
    const arch = ctx.gatherCache.get<ArchResult>('arch');

    const data: ExtendedHealthData = {
      health: healthResult,
      security,
      perf,
      arch,
    };

    const response: ApiResponse<ExtendedHealthData> = {
      data,
      timestamp: new Date().toISOString(),
    };
    return c.json(response);
  });

  return router;
}
