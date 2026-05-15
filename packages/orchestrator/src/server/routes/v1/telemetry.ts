import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CacheMetricsRecorder } from '@harness-engineering/core';

/**
 * Phase 5 Task 11 — `GET /api/v1/telemetry/cache/stats`
 *
 * Returns the in-memory prompt-cache hit/miss snapshot from the
 * orchestrator's {@link CacheMetricsRecorder}. The dashboard's `/insights/cache`
 * widget polls this endpoint every 5 s.
 *
 * Scope: `read-telemetry` (registered in `v1-bridge-routes.ts`). When the
 * orchestrator has no recorder (e.g. FakeOrchestrator-based tests, or
 * `telemetry.export.otlp` disabled and no separate recorder), the route
 * returns 503 — same pattern as `/api/v1/webhooks/queue/stats` so the
 * dashboard can degrade gracefully.
 */

const CACHE_STATS_PATH_RE = /^\/api\/v1\/telemetry\/cache\/stats(?:\?.*)?$/;

interface Deps {
  cacheMetrics?: CacheMetricsRecorder;
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function handleV1TelemetryRoute(
  req: IncomingMessage,
  res: ServerResponse,
  deps: Deps
): boolean {
  const url = req.url ?? '';
  const method = req.method ?? 'GET';

  if (method === 'GET' && CACHE_STATS_PATH_RE.test(url)) {
    if (!deps.cacheMetrics) {
      sendJSON(res, 503, { error: 'Cache metrics recorder not available' });
      return true;
    }
    sendJSON(res, 200, deps.cacheMetrics.getStats());
    return true;
  }

  return false;
}
