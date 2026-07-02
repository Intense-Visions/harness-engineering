import { Hono } from 'hono';
import { gatherSignals, type SignalsResult } from '@harness-engineering/signals';
import type { ApiResponse } from '../../shared/types';
import type { ServerContext } from '../context';

/**
 * Read-only signals API. `GET /api/signals` computes the five curated signals
 * for `ctx.projectPath` and returns them in canonical display order.
 *
 * @internal Reads only resolved server-context paths; takes no HTTP input.
 */
export function buildSignalsRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/signals', async (c) => {
    const data = await gatherSignals(ctx.projectPath);
    return c.json({
      data,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse<SignalsResult>);
  });

  return router;
}
