import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { InteractionQueue } from '../../../src/core/interaction-queue';
import { handleInteractionsRoute } from '../../../src/server/routes/interactions';

function createServer(queue: InteractionQueue): http.Server {
  return http.createServer((req, res) => {
    if (!handleInteractionsRoute(req, res, queue)) {
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
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 500,
          body: data ? JSON.parse(data) : null,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('interactions routes', () => {
  let tmpDir: string;
  let queue: InteractionQueue;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'int-route-test-'));
    queue = new InteractionQueue(tmpDir);
    port = Math.floor(Math.random() * 10000) + 30000;
    server = createServer(queue);
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  afterEach(async () => {
    server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/interactions returns empty array initially', async () => {
    const res = await request(server, port, 'GET', '/api/interactions');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/interactions returns pushed interactions', async () => {
    await queue.push({
      id: 'int-1',
      issueId: 'issue-1',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'Test',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    const res = await request(server, port, 'GET', '/api/interactions');
    expect(res.statusCode).toBe(200);
    expect((res.body as any[]).length).toBe(1);
    expect((res.body as any[])[0].id).toBe('int-1');
  });

  it('PATCH /api/interactions/:id updates status', async () => {
    await queue.push({
      id: 'int-2',
      issueId: 'issue-2',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'Test',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    const res = await request(server, port, 'PATCH', '/api/interactions/int-2', {
      status: 'resolved',
    });
    expect(res.statusCode).toBe(200);

    const listRes = await request(server, port, 'GET', '/api/interactions');
    expect((listRes.body as any[])[0].status).toBe('resolved');
  });

  it('PATCH /api/interactions/:id returns 404 for unknown id', async () => {
    const res = await request(server, port, 'PATCH', '/api/interactions/nonexistent', {
      status: 'resolved',
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/interactions/:id returns 400 for invalid status', async () => {
    await queue.push({
      id: 'int-3',
      issueId: 'issue-3',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'Test',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    const res = await request(server, port, 'PATCH', '/api/interactions/int-3', {
      status: 'invalid',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns false for non-matching routes', async () => {
    const res = await request(server, port, 'GET', '/api/other');
    expect(res.statusCode).toBe(404);
  });
});
