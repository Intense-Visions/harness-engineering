import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ServerContext } from '../context';
import { gatherBlastRadius } from '../gather/blast-radius';
import type {
  ApiResponse,
  ApiErrorResponse,
  AnomalyResult,
  AnomalyData,
  BlastRadiusResult,
} from '../../shared/types';

const EMPTY_ANOMALIES: AnomalyData = {
  outliers: [],
  articulationPoints: [],
  overlapCount: 0,
};

function isAnomalyData(r: AnomalyResult): r is AnomalyData {
  return 'outliers' in r;
}

function jsonError(c: Context, message: string, status: 400 | 422 = 400) {
  const err: ApiErrorResponse = { error: message, timestamp: new Date().toISOString() };
  return c.json(err, status);
}

type ParsedBody = { ok: true; nodeId: string; maxDepth?: number } | { ok: false; reason: string };

async function parseBlastRadiusBody(c: Context): Promise<ParsedBody> {
  let body: { nodeId?: string; maxDepth?: number };
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, reason: 'Invalid JSON body' };
  }
  if (!body.nodeId || typeof body.nodeId !== 'string') {
    return { ok: false, reason: 'nodeId is required' };
  }
  if (typeof body.maxDepth === 'number' && body.maxDepth >= 1 && body.maxDepth <= 5) {
    return { ok: true, nodeId: body.nodeId, maxDepth: body.maxDepth };
  }
  return { ok: true, nodeId: body.nodeId };
}

export function buildImpactRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/impact/anomalies', (c) => {
    const cached = ctx.gatherCache.get<AnomalyResult>('anomalies');
    const data: AnomalyData = cached && isAnomalyData(cached) ? cached : EMPTY_ANOMALIES;
    const response: ApiResponse<AnomalyData> = {
      data,
      timestamp: new Date().toISOString(),
    };
    return c.json(response);
  });

  router.post('/impact/blast-radius', async (c) => {
    const parsed = await parseBlastRadiusBody(c);
    if (!parsed.ok) return jsonError(c, parsed.reason);

    const data: BlastRadiusResult = await gatherBlastRadius(
      ctx.projectPath,
      parsed.nodeId,
      parsed.maxDepth
    );
    const response: ApiResponse<BlastRadiusResult> = {
      data,
      timestamp: new Date().toISOString(),
    };
    return c.json(response);
  });

  return router;
}
