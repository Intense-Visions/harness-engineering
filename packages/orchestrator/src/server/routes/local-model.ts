import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LocalModelStatus } from '@harness-engineering/types';

/**
 * Callback returning the latest LocalModelStatus snapshot, or null when
 * no local backend is configured (cloud-only orchestrator). The route
 * returns 503 in the latter case so the dashboard banner renders an
 * informational state rather than failing silently.
 */
export type GetLocalModelStatusFn = () => LocalModelStatus | null;

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Handles GET /api/v1/local-model/status.
 *
 * - Returns 200 with the LocalModelStatus snapshot when the orchestrator
 *   has an active LocalModelResolver.
 * - Returns 503 with { error: 'Local backend not configured' } when the
 *   getStatus callback is null or returns null.
 * - Returns 405 for non-GET methods.
 *
 * Returns true if the route matched, false otherwise.
 */
export function handleLocalModelRoute(
  req: IncomingMessage,
  res: ServerResponse,
  getStatus: GetLocalModelStatusFn | null
): boolean {
  const { method, url } = req;
  if (url !== '/api/v1/local-model/status') return false;

  if (method !== 'GET') {
    sendJSON(res, 405, { error: 'Method not allowed' });
    return true;
  }

  if (!getStatus) {
    sendJSON(res, 503, { error: 'Local backend not configured' });
    return true;
  }

  const status = getStatus();
  if (!status) {
    sendJSON(res, 503, { error: 'Local backend not configured' });
    return true;
  }

  sendJSON(res, 200, status);
  return true;
}
