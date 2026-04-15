import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { readBody } from '../utils';

const SESSIONS_DIR = path.resolve('.harness', 'sessions');

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function extractSessionId(url: string): string | null {
  const segments = new URL(url, 'http://localhost').pathname.split(path.posix.sep);
  const id = segments.pop();
  return id && id !== 'sessions' ? id : null;
}

async function handleList(res: ServerResponse): Promise<void> {
  try {
    const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
    const sessions = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const content = await fs.readFile(
          path.join(SESSIONS_DIR, entry.name, 'session.json'),
          'utf-8'
        );
        sessions.push(JSON.parse(content));
      } catch {
        /* skip directories without valid session.json */
      }
    }
    sessions.sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
    jsonResponse(res, 200, sessions);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      jsonResponse(res, 200, []);
      return;
    }
    jsonResponse(res, 500, { error: 'Failed to list sessions' });
  }
}

async function handleCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readBody(req);
    const session = JSON.parse(body);
    if (!session.sessionId) {
      jsonResponse(res, 400, { error: 'Missing sessionId' });
      return;
    }
    const sessionDir = path.join(SESSIONS_DIR, session.sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, 'session.json'), JSON.stringify(session, null, 2));
    jsonResponse(res, 200, { ok: true });
  } catch {
    jsonResponse(res, 500, { error: 'Failed to save session' });
  }
}

async function handleUpdate(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
  try {
    const id = extractSessionId(url);
    if (!id) {
      jsonResponse(res, 400, { error: 'Missing sessionId' });
      return;
    }
    const body = await readBody(req);
    const updates = JSON.parse(body);
    const sessionFilePath = path.join(SESSIONS_DIR, id, 'session.json');
    const current = JSON.parse(await fs.readFile(sessionFilePath, 'utf-8'));
    await fs.writeFile(sessionFilePath, JSON.stringify({ ...current, ...updates }, null, 2));
    jsonResponse(res, 200, { ok: true });
  } catch {
    jsonResponse(res, 500, { error: 'Failed to update session' });
  }
}

async function handleDelete(res: ServerResponse, url: string): Promise<void> {
  try {
    const id = extractSessionId(url);
    if (!id) {
      jsonResponse(res, 400, { error: 'Missing sessionId' });
      return;
    }
    await fs.rm(path.join(SESSIONS_DIR, id), { recursive: true, force: true });
    jsonResponse(res, 200, { ok: true });
  } catch {
    jsonResponse(res, 500, { error: 'Failed to delete session' });
  }
}

const API_PREFIX = '/api/sessions';

export function handleSessionsRoute(req: IncomingMessage, res: ServerResponse): boolean {
  const { method, url } = req;
  if (!url?.startsWith(API_PREFIX)) return false;

  switch (method) {
    case 'GET':
      void handleList(res);
      return true;
    case 'POST':
      void handleCreate(req, res);
      return true;
    case 'PATCH':
      void handleUpdate(req, res, url);
      return true;
    case 'DELETE':
      void handleDelete(res, url);
      return true;
    default:
      return false;
  }
}
