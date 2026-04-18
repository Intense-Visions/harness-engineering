import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { readBody } from '../utils';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const PlanWriteSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(1),
});

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
        // harness-ignore SEC-DES-001: input validated by Zod schema (PlanWriteSchema)
        const result = PlanWriteSchema.safeParse(JSON.parse(body));
        if (!result.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: result.error.issues[0]?.message ?? 'Invalid request body' })
          );
          return;
        }
        const parsed = result.data;

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
