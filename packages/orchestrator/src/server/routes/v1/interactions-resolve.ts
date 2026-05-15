import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { InteractionQueue } from '../../../core/interaction-queue';
import { readBody } from '../../utils.js';

const BodySchema = z.object({ answer: z.unknown().optional() });
const RESOLVE_PATH_RE = /^\/api\/v1\/interactions\/([a-zA-Z0-9_-]+)\/resolve(?:\?.*)?$/;

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * POST /api/v1/interactions/{id}/resolve — Phase 2 bridge primitive.
 *
 * Wraps InteractionQueue.updateStatus(id, 'resolved'). 409 if already resolved
 * (per spec). The interaction event-bus emit (interaction.resolved) is owned by
 * InteractionQueue.updateStatus itself in Phase 2's Task 8, NOT this handler —
 * keeps the emit on a single code path regardless of caller (legacy PATCH or
 * v1 POST).
 *
 * Scope: resolve-interaction (enforced by dispatchAuthedRequest).
 */
export function handleV1InteractionsResolveRoute(
  req: IncomingMessage,
  res: ServerResponse,
  queue: InteractionQueue | undefined
): boolean {
  if (req.method !== 'POST') return false;
  const match = RESOLVE_PATH_RE.exec(req.url ?? '');
  if (!match || !match[1]) return false;
  if (!queue) {
    sendJSON(res, 503, { error: 'Interaction queue not available' });
    return true;
  }
  const id = match[1];
  void (async () => {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      sendJSON(res, 413, { error: 'Body too large' });
      return;
    }
    if (raw.length > 0) {
      // Allow empty body OR a JSON body with optional `answer`.
      try {
        // harness-ignore SEC-DES-001: input validated by Zod schema (BodySchema) below
        const json = JSON.parse(raw);
        const parsed = BodySchema.safeParse(json);
        if (!parsed.success) {
          sendJSON(res, 400, { error: 'Invalid body', issues: parsed.error.issues });
          return;
        }
      } catch {
        sendJSON(res, 400, { error: 'Invalid JSON body' });
        return;
      }
    }
    try {
      // Read first so we can distinguish 404 vs. 409 without race.
      const existing = (await queue.list()).find((i) => i.id === id);
      if (!existing) {
        sendJSON(res, 404, { error: `Interaction ${id} not found` });
        return;
      }
      if (existing.status === 'resolved') {
        sendJSON(res, 409, { error: `Interaction ${id} already resolved` });
        return;
      }
      await queue.updateStatus(id, 'resolved');
      sendJSON(res, 200, { resolved: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resolve';
      if (msg.includes('not found')) {
        sendJSON(res, 404, { error: msg });
        return;
      }
      sendJSON(res, 500, { error: 'Internal error resolving interaction' });
    }
  })();
  return true;
}
