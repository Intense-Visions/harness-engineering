import { Hono } from 'hono';
import { gatherHealth } from '../gather/health';
import type {
  ApiResponse,
  ChecksData,
  HealthResult,
  ExtendedHealthData,
  SecurityResult,
  PerfResult,
  ArchResult,
  AnomalyResult,
} from '../../shared/types';
import type { ServerContext } from '../context';

const CACHE_KEY = 'health';

function buildChecksData(ctx: ServerContext): ChecksData {
  const pending = 'Checks have not completed yet';
  return {
    security: ctx.gatherCache.get<SecurityResult>('security') ?? { error: pending },
    perf: ctx.gatherCache.get<PerfResult>('perf') ?? { error: pending },
    arch: ctx.gatherCache.get<ArchResult>('arch') ?? { error: pending },
    anomalies: ctx.gatherCache.get<AnomalyResult>('anomalies') ?? {
      available: false as const,
      reason: pending,
    },
    lastRun: new Date().toISOString(),
  };
}

async function getHealthResult(ctx: ServerContext): Promise<HealthResult> {
  const cached = ctx.cache.get<HealthResult>(CACHE_KEY);
  if (cached) return cached.data;
  const result = await gatherHealth(ctx.projectPath);
  ctx.cache.set(CACHE_KEY, result);
  return result;
}

export function buildHealthRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/checks', (c) => {
    const data = buildChecksData(ctx);
    return c.json({ data, timestamp: new Date().toISOString() } satisfies ApiResponse<ChecksData>);
  });

  router.get('/health', async (c) => {
    const data: ExtendedHealthData = {
      health: await getHealthResult(ctx),
      security: ctx.gatherCache.get<SecurityResult>('security'),
      perf: ctx.gatherCache.get<PerfResult>('perf'),
      arch: ctx.gatherCache.get<ArchResult>('arch'),
    };
    return c.json({
      data,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse<ExtendedHealthData>);
  });

  return router;
}
