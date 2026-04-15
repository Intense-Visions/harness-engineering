import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { readBody } from '../utils';

const SESSIONS_DIR = path.resolve('.harness', 'sessions');

export function handleSessionsRoute(req: IncomingMessage, res: ServerResponse): boolean {
  const { method, url } = req;
  if (url?.startsWith('/api/sessions')) {
    if (method === 'GET') {
      void (async () => {
        try {
          const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
          const sessions = [];
          for (const entry of entries) {
            if (entry.isDirectory()) {
              try {
                const sessionFilePath = path.join(SESSIONS_DIR, entry.name, 'session.json');
                const content = await fs.readFile(sessionFilePath, 'utf-8');
                sessions.push(JSON.parse(content));
              } catch { 
                /* skip non-chat sessions or directories without session.json */ 
              }
            }
          }
          // Sort by lastActiveAt descending
          sessions.sort((a, b) => 
            new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
          );
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(sessions));
        } catch (err) {
          // If dir doesn't exist yet, return empty list
          if ((err as any).code === 'ENOENT') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([]));
            return;
          }
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to list sessions' }));
        }
      })();
      return true;
    }
    
    if (method === 'POST') {
      void (async () => {
        try {
          const body = await readBody(req);
          const session = JSON.parse(body);
          
          if (!session.sessionId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing sessionId' }));
            return;
          }

          const sessionDir = path.join(SESSIONS_DIR, session.sessionId);
          await fs.mkdir(sessionDir, { recursive: true });
          await fs.writeFile(
            path.join(sessionDir, 'session.json'), 
            JSON.stringify(session, null, 2)
          );
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to save session' }));
        }
      })();
      return true;
    }

    if (method === 'PATCH') {
      void (async () => {
        try {
          const id = url.split('/').pop();
          if (!id || id === 'sessions') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing sessionId' }));
            return;
          }

          const body = await readBody(req);
          const updates = JSON.parse(body);
          const sessionFilePath = path.join(SESSIONS_DIR, id, 'session.json');
          
          const currentContent = await fs.readFile(sessionFilePath, 'utf-8');
          const current = JSON.parse(currentContent);
          const updated = { ...current, ...updates };
          
          await fs.writeFile(sessionFilePath, JSON.stringify(updated, null, 2));
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to update session' }));
        }
      })();
      return true;
    }

    if (method === 'DELETE') {
      void (async () => {
        try {
          const id = url.split('/').pop();
          if (!id || id === 'sessions') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing sessionId' }));
            return;
          }

          const sessionDir = path.join(SESSIONS_DIR, id);
          await fs.rm(sessionDir, { recursive: true, force: true });
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to delete session' }));
        }
      })();
      return true;
    }
  }
  return false;
}
