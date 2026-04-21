import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { readBody } from '../utils';
import type { InteractionQueue } from '../../core/interaction-queue';

const InteractionUpdateSchema = z.object({
  status: z.enum(['pending', 'claimed', 'resolved']),
});
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handlePatchInteraction(
  req: IncomingMessage,
  res: ServerResponse,
  queue: InteractionQueue,
  id: string
): Promise<void> {
  try {
    const body = await readBody(req);
    // harness-ignore SEC-DES-001: input validated by Zod schema (InteractionUpdateSchema)
    const result = InteractionUpdateSchema.safeParse(JSON.parse(body));
    if (!result.success) {
      sendJson(res, 400, { error: 'Invalid status. Must be pending, claimed, or resolved.' });
      return;
    }

    await queue.updateStatus(id, result.data.status);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    const isNotFound = err instanceof Error && err.message.includes('not found');
    sendJson(res, isNotFound ? 404 : 500, {
      error: isNotFound ? `Interaction ${id} not found` : 'Failed to update interaction',
    });
  }
}

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
        sendJson(res, 200, interactions);
      } catch {
        sendJson(res, 500, { error: 'Failed to list interactions' });
      }
    })();
    return true;
  }

  // PATCH /api/interactions/:id
  const patchMatch = method === 'PATCH' && url?.match(/^\/api\/interactions\/([^/]+)$/);
  if (patchMatch && patchMatch[1]) {
    const id = patchMatch[1];
    if (!SAFE_ID_RE.test(id)) {
      sendJson(res, 400, { error: 'Invalid interaction id' });
      return true;
    }
    void handlePatchInteraction(req, res, queue, id);
    return true;
  }

  return false;
}
