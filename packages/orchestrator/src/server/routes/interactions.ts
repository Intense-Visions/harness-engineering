import type { IncomingMessage, ServerResponse } from 'node:http';
import type { InteractionQueue } from '../../core/interaction-queue';

const VALID_STATUSES = new Set(['pending', 'claimed', 'resolved']);

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
    void (async () => {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { status?: string };

        if (!parsed.status || !VALID_STATUSES.has(parsed.status)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'Invalid status. Must be pending, claimed, or resolved.' })
          );
          return;
        }

        await queue.updateStatus(id, parsed.status as 'pending' | 'claimed' | 'resolved');
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
