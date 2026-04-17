import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { readBody } from '../utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSafeId(id: string): boolean {
  return UUID_RE.test(id) || (path.basename(id) === id && !id.includes('..'));
}

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function extractSessionId(url: string): string | null {
  const segments = new URL(url, 'http://localhost').pathname.split(path.posix.sep);
  const id = segments.pop();
  return id && id !== 'sessions' ? id : null;
}

async function handleList(res: ServerResponse, sessionsDir: string): Promise<void> {
  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
    const sessions = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const content = await fs.readFile(
          path.join(sessionsDir, entry.name, 'session.json'),
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

async function handleCreate(
  req: IncomingMessage,
  res: ServerResponse,
  sessionsDir: string
): Promise<void> {
  try {
    const body = await readBody(req);
    const session = JSON.parse(body);
    if (!session.sessionId) {
      jsonResponse(res, 400, { error: 'Missing sessionId' });
      return;
    }
    if (!isSafeId(session.sessionId)) {
      jsonResponse(res, 400, { error: 'Invalid sessionId' });
      return;
    }
    const sessionDir = path.join(sessionsDir, session.sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, 'session.json'), JSON.stringify(session, null, 2));
    jsonResponse(res, 200, { ok: true });
  } catch {
    jsonResponse(res, 500, { error: 'Failed to save session' });
  }
}

async function handleUpdate(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  sessionsDir: string
): Promise<void> {
  try {
    const id = extractSessionId(url);
    if (!id || !isSafeId(id)) {
      jsonResponse(res, 400, { error: 'Missing or invalid sessionId' });
      return;
    }
    const body = await readBody(req);
    const updates = JSON.parse(body);
    const sessionFilePath = path.join(sessionsDir, id, 'session.json');
    const current = JSON.parse(await fs.readFile(sessionFilePath, 'utf-8'));
    await fs.writeFile(sessionFilePath, JSON.stringify({ ...current, ...updates }, null, 2));
    jsonResponse(res, 200, { ok: true });
  } catch {
    jsonResponse(res, 500, { error: 'Failed to update session' });
  }
}

async function handleDelete(res: ServerResponse, url: string, sessionsDir: string): Promise<void> {
  try {
    const id = extractSessionId(url);
    if (!id || !isSafeId(id)) {
      jsonResponse(res, 400, { error: 'Missing or invalid sessionId' });
      return;
    }
    await fs.rm(path.join(sessionsDir, id), { recursive: true, force: true });
    jsonResponse(res, 200, { ok: true });
  } catch {
    jsonResponse(res, 500, { error: 'Failed to delete session' });
  }
}

const API_PREFIX = '/api/sessions';

export function handleSessionsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  sessionsDir: string
): boolean {
  const { method, url } = req;
  if (!url?.startsWith(API_PREFIX)) return false;

  switch (method) {
    case 'GET':
      void handleList(res, sessionsDir);
      return true;
    case 'POST':
      void handleCreate(req, res, sessionsDir);
      return true;
    case 'PATCH':
      void handleUpdate(req, res, url, sessionsDir);
      return true;
    case 'DELETE':
      void handleDelete(res, url, sessionsDir);
      return true;
    default:
      return false;
  }
}
