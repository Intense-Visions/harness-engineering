import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_PORT } from '../shared/constants';

/**
 * Returns the host address the server should bind to.
 * Defaults to 127.0.0.1 (loopback) unless the HOST env var is set (e.g. 0.0.0.0 for containers).
 *
 * NOTE: Duplicated in packages/orchestrator/src/server/http.ts
 */
export function getBindHost(): string {
  return process.env['HOST'] ?? '127.0.0.1';
}

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

console.log(`Hono server starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname: getBindHost(),
});
