import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/**
 * Serve static files from the dashboard dist directory.
 * Falls back to index.html for SPA client-side routing.
 *
 * Does NOT handle /api/* or /ws paths (returns false for those).
 *
 * @returns true if the request was handled, false otherwise
 */
export function handleStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  dashboardDir: string
): boolean {
  const { method, url } = req;

  // Only handle GET requests
  if (method !== 'GET') return false;

  // Don't handle API or WebSocket paths (URL paths always use forward slashes)
  const apiPrefix = path.posix.join(path.posix.sep, 'api', path.posix.sep);
  const wsPath = path.posix.join(path.posix.sep, 'ws');
  if (url?.startsWith(apiPrefix) || url === wsPath) return false;

  const urlPath = new URL(url ?? '/', 'http://localhost').pathname;

  // Resolve and verify the path is within dashboardDir
  const requestedPath = path.join(dashboardDir, urlPath === '/' ? 'index.html' : urlPath);
  const resolved = path.resolve(requestedPath);

  // Security: ensure resolved path is within dashboardDir
  if (!resolved.startsWith(path.resolve(dashboardDir))) {
    // SPA fallback
    return serveFile(path.join(dashboardDir, 'index.html'), res);
  }

  // Try to serve the requested file
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return serveFile(resolved, res);
  }

  // SPA fallback: serve index.html for all other paths
  const indexPath = path.join(dashboardDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return serveFile(indexPath, res);
  }

  return false;
}

function serveFile(filePath: string, res: ServerResponse): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}
