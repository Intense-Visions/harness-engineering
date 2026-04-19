import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { readBody } from '../utils';
import type { InteractionQueue } from '../../core/interaction-queue';

const InteractionUpdateSchema = z.object({
  status: z.enum(['pending', 'claimed', 'resolved']),
});
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Handle interactions API routes.
 *
 * @returns true if the route was handled, false otherwise
 */
export function handleInteractionsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  queue: InteractionQueue
): boolean {
  const { method, url } = req;

  // GET /api/interactions
  if (method === 'GET' && url === '/api/interactions') {
    void (async () => {
      try {
        const interactions = await queue.list();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(interactions));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to list interactions' }));
      }
    })();
    return true;
  }

  // PATCH /api/interactions/:id
  const patchMatch = method === 'PATCH' && url?.match(/^\/api\/interactions\/([^/]+)$/);
  if (patchMatch && patchMatch[1]) {
    const id = patchMatch[1];
    if (!SAFE_ID_RE.test(id)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid interaction id' }));
      return true;
    }
    void (async () => {
      try {
        const body = await readBody(req);
        // harness-ignore SEC-DES-001: input validated by Zod schema (InteractionUpdateSchema)
        const result = InteractionUpdateSchema.safeParse(JSON.parse(body));
        if (!result.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'Invalid status. Must be pending, claimed, or resolved.' })
          );
          return;
        }

        await queue.updateStatus(id, result.data.status);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Interaction ${id} not found` }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to update interaction' }));
        }
      }
    })();
    return true;
  }

  return false;
}
