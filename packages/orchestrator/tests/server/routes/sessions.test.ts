import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleSessionsRoute } from '../../../src/server/routes/sessions';

function createServer(sessionsDir: string): http.Server {
  return http.createServer((req, res) => {
    if (!handleSessionsRoute(req, res, sessionsDir)) {
      res.writeHead(404);
      res.end();
    }
  });
}

function request(
  server: http.Server,
  port: number,
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: payload
          ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ statusCode: res.statusCode ?? 500, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const SESSION_A = {
  sessionId: 'aaaaaaaa-1111-2222-3333-444444444444',
  command: null,
  interactionId: null,
  label: 'Session A',
  createdAt: '2026-04-29T00:00:00.000Z',
  lastActiveAt: '2026-04-29T00:05:00.000Z',
  artifacts: [],
  status: 'active',
  messages: [
    { role: 'user', content: 'hello' },
    { role: 'assistant', blocks: [{ kind: 'text', text: 'hi there' }] },
  ],
  input: '',
};

const SESSION_B = {
  sessionId: 'bbbbbbbb-1111-2222-3333-444444444444',
  command: null,
  interactionId: null,
  label: 'Session B',
  createdAt: '2026-04-30T00:00:00.000Z',
  lastActiveAt: '2026-04-30T00:01:00.000Z',
  artifacts: [],
  status: 'active',
  messages: [],
  input: '',
};

describe('sessions routes', () => {
  let server: http.Server;
  let port: number;
  let sessionsDir: string;

  beforeEach(async () => {
    sessionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sessions-test-'));
    server = createServer(sessionsDir);
    // Bind to port 0 so the OS assigns a free port. Avoids EACCES on
    // Windows runners when a random 40000-50000 port hits a reserved range.
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const address = server.address();
    if (!address || typeof address !== 'object') {
      throw new Error('Server failed to bind to an address');
    }
    port = address.port;
  });

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    await fs.rm(sessionsDir, { recursive: true, force: true });
  });

  async function seed(session: typeof SESSION_A): Promise<void> {
    const dir = path.join(sessionsDir, session.sessionId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'session.json'), JSON.stringify(session));
  }

  it('GET /api/sessions returns array sorted by lastActiveAt desc', async () => {
    await seed(SESSION_A);
    await seed(SESSION_B);
    const res = await request(server, port, 'GET', '/api/sessions');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const sessions = res.body as Array<{ sessionId: string }>;
    expect(sessions.map((s) => s.sessionId)).toEqual([SESSION_B.sessionId, SESSION_A.sessionId]);
  });

  it('GET /api/sessions/<id> returns the single session, not an array', async () => {
    await seed(SESSION_A);
    await seed(SESSION_B);
    const res = await request(server, port, 'GET', `/api/sessions/${SESSION_A.sessionId}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(false);
    expect(res.body).toMatchObject({
      sessionId: SESSION_A.sessionId,
      messages: SESSION_A.messages,
    });
  });

  it('GET /api/sessions/<id> returns 404 when the session does not exist', async () => {
    const res = await request(
      server,
      port,
      'GET',
      '/api/sessions/cccccccc-1111-2222-3333-444444444444'
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/sessions/<id> rejects unsafe ids', async () => {
    const res = await request(server, port, 'GET', '/api/sessions/..%2Fescape');
    expect([400, 404]).toContain(res.statusCode);
    expect(Array.isArray(res.body)).toBe(false);
  });

  it('POST /api/sessions writes session.json and round-trips via GET /<id>', async () => {
    const post = await request(server, port, 'POST', '/api/sessions', SESSION_A);
    expect(post.statusCode).toBe(200);
    const get = await request(server, port, 'GET', `/api/sessions/${SESSION_A.sessionId}`);
    expect(get.statusCode).toBe(200);
    expect(get.body).toMatchObject({ sessionId: SESSION_A.sessionId });
  });

  it('DELETE /api/sessions/<id> removes the session directory and excludes it from GET list', async () => {
    await seed(SESSION_A);
    await seed(SESSION_B);

    const del = await request(server, port, 'DELETE', `/api/sessions/${SESSION_A.sessionId}`);
    expect(del.statusCode).toBe(200);

    await expect(fs.access(path.join(sessionsDir, SESSION_A.sessionId))).rejects.toThrow();

    const list = await request(server, port, 'GET', '/api/sessions');
    const ids = (list.body as Array<{ sessionId: string }>).map((s) => s.sessionId);
    expect(ids).not.toContain(SESSION_A.sessionId);
    expect(ids).toContain(SESSION_B.sessionId);
  });

  it('DELETE /api/sessions/<id> rejects unsafe ids', async () => {
    const res = await request(server, port, 'DELETE', '/api/sessions/..%2Fescape');
    expect(res.statusCode).toBe(400);
  });
});
