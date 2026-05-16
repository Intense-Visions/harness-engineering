import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { verify } from './signer.js';
import { log } from './logger.js';
import type { GatewayEvent, MaintenanceCompletedData } from './types.js';
import type { SlackPoster } from './slack-client.js';

export interface HandlerOptions {
  secret: string;
  slack: SlackPoster;
  /** Path the orchestrator subscription is configured to POST to. Default: /webhooks/maintenance-completed */
  path?: string;
  /** Max ms to allow in-flight handlers during graceful shutdown. Default: 5000. */
  shutdownTimeoutMs?: number;
}

/**
 * Build a Node http.Server that:
 *   - accepts POST <path> only
 *   - reads the raw body into a Buffer
 *   - verifies X-Harness-Signature via HMAC SHA-256
 *   - filters to type === 'maintenance.completed'
 *   - dispatches to Slack
 *   - logs every step at info/warn/error
 *
 * The factory returns the server WITHOUT calling listen(); the caller
 * picks the port. SIGTERM wiring is the CALLER's responsibility (index.ts).
 */
export function createServer_(opts: HandlerOptions): Server {
  const path = opts.path ?? '/webhooks/maintenance-completed';

  async function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(payload);
  }

  return createServer((req, res) => {
    void (async () => {
      if (req.method !== 'POST' || req.url !== path) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      const deliveryId = String(req.headers['x-harness-delivery-id'] ?? '');
      const eventType = String(req.headers['x-harness-event-type'] ?? '');
      const sigHeader = req.headers['x-harness-signature'];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

      try {
        const rawBody = await readBody(req);

        if (!verify(opts.secret, rawBody, sig)) {
          log.warn('webhook.signature.mismatch', { deliveryId, eventType });
          sendJson(res, 401, { error: 'signature mismatch' });
          return;
        }

        let event: GatewayEvent;
        try {
          event = JSON.parse(rawBody.toString('utf8')) as GatewayEvent;
        } catch (err) {
          log.warn('webhook.body.parse_failed', { deliveryId, error: String(err) });
          sendJson(res, 400, { error: 'invalid json body' });
          return;
        }

        if (event.type !== 'maintenance.completed') {
          log.warn('webhook.event.unsupported', { deliveryId, eventType: event.type });
          sendJson(res, 400, { error: `unsupported event type: ${event.type}` });
          return;
        }

        log.info('webhook.received', { deliveryId, eventType: event.type, id: event.id });

        try {
          await opts.slack.postMaintenanceCompleted(event.data as MaintenanceCompletedData);
          log.info('webhook.delivered', { deliveryId, id: event.id });
          sendJson(res, 200, { ok: true });
        } catch (err) {
          log.error('slack.postMessage.failed', {
            deliveryId,
            eventType: event.type,
            slackError: String(err),
          });
          sendJson(res, 502, { error: 'slack delivery failed', detail: String(err) });
        }
      } catch (err) {
        log.error('webhook.unexpected_error', { deliveryId, error: String(err) });
        sendJson(res, 500, { error: 'internal error' });
      }
    })();
  });
}

// Re-export with the natural name for callers; the trailing underscore on
// the implementation avoids shadowing the imported `createServer`.
export { createServer_ as createWebhookServer };

/**
 * Wire SIGTERM / SIGINT to a graceful shutdown: stop accepting new
 * connections, wait up to shutdownTimeoutMs for in-flight to drain,
 * then exit 0.
 */
export function installShutdownHandlers(server: Server, shutdownTimeoutMs = 5_000): void {
  const shutdown = (signal: string): void => {
    log.info('shutdown.signal', { signal });
    server.close(() => {
      log.info('shutdown.complete', {});
      process.exit(0);
    });
    setTimeout(() => {
      log.warn('shutdown.timeout_forced_exit', { shutdownTimeoutMs });
      process.exit(0);
    }, shutdownTimeoutMs).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
