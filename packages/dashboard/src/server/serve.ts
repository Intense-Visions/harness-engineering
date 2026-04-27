import { serve } from '@hono/node-server';
import type http from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_PORT, getBindHost } from '../shared/constants';
import { attachWsProxy, getOrchestratorTarget } from './orchestrator-proxy';

// Resolve built client directory relative to this script.
// In dev mode (__dirname = src/server/), ../client has no built assets — skip.
// In production (__dirname = dist/server/), ../client has the Vite build output.
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(__dirname, '..', 'client');
if (existsSync(join(clientDir, 'index.html')) && existsSync(join(clientDir, 'assets'))) {
  process.env['DASHBOARD_CLIENT_ROOT'] = clientDir;
  console.log(`Serving dashboard client from ${clientDir}`);
}

// Import app after setting env so buildApp() picks it up
const { app } = await import('./index');

const port = Number(process.env['DASHBOARD_API_PORT'] ?? API_PORT);

const hostname = getBindHost();

console.log(`Hono server starting on http://${hostname}:${port}`);

// @hono/node-server's serve() returns ServerType (HTTP | HTTP2).
// We always use HTTP here so the cast is safe.
const server = serve({
  fetch: app.fetch,
  port,
  hostname,
}) as unknown as http.Server;

// Attach WebSocket proxy for orchestrator connections
if (getOrchestratorTarget()) {
  attachWsProxy(server);
}

// Graceful shutdown — close server and exit cleanly on termination signals
function shutdown() {
  console.log('Dashboard shutting down...');
  server.close(() => {
    process.exit(0);
  });
  // Force exit if server doesn't close within 5 seconds
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
