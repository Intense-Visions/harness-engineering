/** Default port for the Hono API server */
export const API_PORT = 3701;

/**
 * Returns the host address the server should bind to.
 * Defaults to 127.0.0.1 (loopback) unless the HOST env var is set (e.g. 0.0.0.0 for containers).
 */
export function getBindHost(): string {
  return process.env['HOST'] ?? '127.0.0.1';
}

/** Default port for the Vite dev server / dashboard UI */
export const DASHBOARD_PORT = 3700;

/** API route prefix */
export const API_PREFIX = '/api';

/** SSE polling interval in milliseconds (default 30s) */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;

/** SSE event stream endpoint */
export const SSE_ENDPOINT = '/api/sse';

/** Default port for the orchestrator server */
export const ORCHESTRATOR_PORT = 8080;

/** Path to the harness knowledge graph directory (relative to project root) */
export const GRAPH_DIR = '.harness/graph';
