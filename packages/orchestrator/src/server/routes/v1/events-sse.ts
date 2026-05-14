import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';

/**
 * Event-bus topics the SSE handler subscribes to. Mirrors the WebSocket
 * broadcaster topics today + the two new Phase 2 interaction emits.
 * Phase 3 extends this with `webhook.*`; Phase 5 with `telemetry.*`.
 */
const SSE_TOPICS = [
  'state_change',
  'agent_event',
  'interaction.created',
  'interaction.resolved',
  'maintenance:started',
  'maintenance:completed',
  'maintenance:error',
  'maintenance:baseref_fallback',
  'local-model:status',
  // ── Phase 3 ──
  'webhook.subscription.created',
  'webhook.subscription.deleted',
] as const;

const HEARTBEAT_MS = 15_000;

function newEventId(): string {
  return `evt_${randomBytes(8).toString('hex')}`;
}

/**
 * GET /api/v1/events — Phase 2 bridge primitive.
 *
 * Spec D1: SSE stream alongside legacy /ws WebSocket. Each event is framed as:
 *   event: <type>
 *   data: <json>
 *   id: <evt_…>
 *
 * Reconnection-via-Last-Event-ID is deferred to Phase 4 when the SQLite
 * webhook queue lands (re-uses the same persistence layer).
 *
 * Scope: read-telemetry (enforced by dispatchAuthedRequest).
 */
export function handleV1EventsSseRoute(
  req: IncomingMessage,
  res: ServerResponse,
  bus: EventEmitter
): boolean {
  if (req.method !== 'GET' || req.url !== '/api/v1/events') return false;

  // Set headers via setHeader() so callers (and tests) can introspect via
  // getHeader() after dispatch. writeHead({...}) bypasses that storage.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disables proxy buffering (nginx, etc.)
  res.writeHead(200);
  // Initial comment frame opens the stream for the client.
  res.write(`: harness gateway SSE — connected at ${new Date().toISOString()}\n\n`);

  const listeners: Array<{ topic: string; fn: (data: unknown) => void }> = [];
  for (const topic of SSE_TOPICS) {
    const fn = (data: unknown): void => {
      try {
        const frame =
          `event: ${topic}\n` + `data: ${JSON.stringify(data)}\n` + `id: ${newEventId()}\n\n`;
        res.write(frame);
      } catch {
        // Connection write failure → unsubscribe on close handler below.
      }
    };
    bus.on(topic, fn);
    listeners.push({ topic, fn });
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      // ignore — close handler cleans up
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const cleanup = (): void => {
    clearInterval(heartbeat);
    for (const { topic, fn } of listeners) bus.removeListener(topic, fn);
  };
  res.on('close', cleanup);
  res.on('finish', cleanup);

  return true;
}
