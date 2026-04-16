import type { IncomingMessage, ServerResponse } from 'node:http';
import { readBody } from '../utils';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Handle plan write API routes.
 *
 * @returns true if the route was handled, false otherwise
 */
export function handlePlansRoute(
  req: IncomingMessage,
  res: ServerResponse,
  plansDir: string
): boolean {
  const { method, url } = req;

  if (method === 'POST' && url === '/api/plans') {
    void (async () => {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { filename?: string; content?: string };

        if (!parsed.filename || typeof parsed.filename !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid filename' }));
          return;
        }

        if (!parsed.content || typeof parsed.content !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid content' }));
          return;
        }

        // Security: reject path traversal and non-.md files
        const basename = path.basename(parsed.filename);
        if (basename !== parsed.filename || !basename.endsWith('.md')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'Filename must be a simple .md filename (no path separators)' })
          );
          return;
        }

        await fs.mkdir(plansDir, { recursive: true });
        const filePath = path.join(plansDir, basename);
        await fs.writeFile(filePath, parsed.content, 'utf-8');

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, filename: basename }));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to write plan' }));
      }
    })();
    return true;
  }

  return false;
}
