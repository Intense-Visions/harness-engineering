/**
 * Reverse proxy for orchestrator API routes and WebSocket connections.
 *
 * In dev mode, Vite's built-in proxy handles forwarding. In production the
 * Hono server has no proxy — this module fills that gap so `harness dashboard run`
 * can relay traffic to a running orchestrator.
 *
 * Activated when ORCHESTRATOR_URL or ORCHESTRATOR_PORT is set.
 */
import http from 'node:http';
import type { Context, Next } from 'hono';
import { isBadPort } from '@harness-engineering/core';
import { ORCHESTRATOR_PORT } from '../shared/constants';

/**
 * Route prefixes that belong to the orchestrator.
 * Order matches vite.config.ts — more-specific prefixes first.
 */
const ORCHESTRATOR_PREFIXES = [
  '/ws',
  '/api/v1',
  '/api/state',
  '/api/interactions',
  '/api/chat',
  '/api/plans',
  '/api/analyze',
  '/api/roadmap',
  '/api/dispatch',
  '/api/sessions',
  '/api/streams',
  '/api/analyses',
  '/api/maintenance',
];

/** Resolve the orchestrator base URL from environment, or null if unconfigured. */
export function getOrchestratorTarget(): URL | null {
  const target = resolveOrchestratorUrl();
  if (target) warnIfBadProxyPort(target);
  return target;
}

function resolveOrchestratorUrl(): URL | null {
  const explicit = process.env['ORCHESTRATOR_URL'];
  if (explicit) {
    try {
      return new URL(explicit);
    } catch {
      console.error(`Invalid ORCHESTRATOR_URL: ${explicit}`);
      return null;
    }
  }
  const port = process.env['ORCHESTRATOR_PORT'];
  if (port) return new URL(`http://127.0.0.1:${port}`);
  return null;
}

let warnedBadProxyPort = false;
function warnIfBadProxyPort(target: URL): void {
  if (warnedBadProxyPort) return;
  const port = Number(target.port) || ORCHESTRATOR_PORT;
  if (isBadPort(port)) {
    warnedBadProxyPort = true;
    console.error(
      `Orchestrator target ${target.origin} uses port ${port}, which is on the ` +
        `WHATWG fetch bad-ports list. Every proxy request will fail with 502 ` +
        `'fetch failed (cause: bad port)'. Restart the orchestrator on a different ` +
        `port. See https://fetch.spec.whatwg.org/#port-blocking.`
    );
  }
}

function isOrchestratorRoute(pathname: string): boolean {
  return ORCHESTRATOR_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  );
}

/**
 * Extract the most informative message from a thrown error, including
 * `cause.message` / `cause.code` when present.
 *
 * Node's undici-based `fetch()` wraps the real failure in
 * `TypeError: fetch failed` and stashes the actionable reason on `err.cause`
 * (`'bad port'`, `ECONNREFUSED`, `ENOTFOUND`, ...). The default `err.message`
 * is uniformly `'fetch failed'`, which makes proxy 502s opaque. Surfacing the
 * cause turns multi-hour goose chases (see #287) into one-line diagnoses.
 *
 * Exported for testing.
 */
export function formatProxyErrorMessage(err: unknown): string {
  const baseMsg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
  if (!cause) return baseMsg;

  const causeMsg = cause instanceof Error ? cause.message : undefined;
  const causeCode =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : undefined;
  const detail = causeMsg ?? causeCode;
  return detail ? `${baseMsg} (cause: ${detail})` : baseMsg;
}

/**
 * Hono middleware that proxies orchestrator-bound HTTP requests.
 * Falls through to the next handler when:
 *   - no orchestrator target is configured, or
 *   - the request path is not an orchestrator route.
 */
export function orchestratorProxyMiddleware() {
  return async (c: Context, next: Next) => {
    const target = getOrchestratorTarget();
    if (!target) return next();

    const reqUrl = new URL(c.req.url);
    if (!isOrchestratorRoute(reqUrl.pathname)) return next();

    const proxyUrl = new URL(reqUrl.pathname + reqUrl.search, target);

    const headers = new Headers(c.req.raw.headers);
    // Rewrite Host to match the orchestrator
    headers.set('host', `${target.hostname}:${target.port}`);

    try {
      const resp = await fetch(proxyUrl.toString(), {
        method: c.req.method,
        headers,
        body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
        // @ts-expect-error — Node fetch supports duplex
        duplex: 'half',
      });

      // Forward the response as-is
      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
      });
    } catch (err) {
      return c.json({ error: `Orchestrator proxy error: ${formatProxyErrorMessage(err)}` }, 502);
    }
  };
}

function handleWsUpgrade(
  target: URL,
  req: http.IncomingMessage,
  socket: import('node:stream').Duplex
): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname !== '/ws') {
    // Not our route — let it fall through (Hono doesn't use upgrades, so just destroy)
    socket.destroy();
    return;
  }

  const proxyReq = http.request({
    hostname: target.hostname,
    port: Number(target.port) || ORCHESTRATOR_PORT,
    path: '/ws',
    method: 'GET',
    headers: {
      ...req.headers,
      host: `${target.hostname}:${target.port}`,
    },
  });

  proxyReq.on('upgrade', (_proxyRes, proxySocket, proxyHead) => {
    // Forward the 101 response headers back to the client
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(_proxyRes.headers)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join('\r\n') +
        '\r\n\r\n'
    );
    if (proxyHead.length) socket.write(proxyHead);

    // Bidirectional pipe
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });

  proxyReq.on('error', (err) => {
    console.error(`WebSocket proxy error: ${err.message}`);
    socket.destroy();
  });

  proxyReq.end();
}

/**
 * Attach a WebSocket upgrade handler to the given HTTP server.
 * Proxies `/ws` connections to the orchestrator using raw TCP piping.
 */
export function attachWsProxy(server: http.Server): void {
  const target = getOrchestratorTarget();
  if (!target) return;

  server.on('upgrade', (req, socket, _head) => {
    handleWsUpgrade(target, req, socket);
  });

  console.log(`WebSocket proxy enabled → ${target.origin}/ws`);
}
