import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { OrchestratorServer } from './http';
import { TokenStore } from '../auth/tokens';

/**
 * Method-aware scope enforcement at the HTTP boundary.
 *
 * The prefix-based scope map is the last resort in `requiredScopeForRoute`, and
 * for a long time it keyed on path alone. That made a read-only bearer
 * sufficient for every method on a prefix — including the mutating ones. These
 * tests pin the boundary end to end (real server, real token store, real
 * dispatch) so a future prefix entry cannot silently re-open it.
 */

class FakeOrchestrator {
  getSnapshot(): Record<string, unknown> {
    return { ok: true };
  }
  on(): void {}
  removeListener(): void {}
}

interface HttpResponse {
  status: number;
  body: string;
}

let dir: string;
let plansDir: string;
let sessionsDir: string;
let server: OrchestratorServer;
let port: number;
let store: TokenStore;

function safeRmTemp(target: string): void {
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Temp-dir teardown is not an assertion; the audit writer flushes
    // asynchronously and can recreate a file mid-removal.
  }
}

async function request(
  p: string,
  method: string,
  scopeToken: string,
  body?: unknown
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = { authorization: `Bearer ${scopeToken}` };
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
    }
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += String(c)));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: chunks }));
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

describe('prefix-mapped routes enforce scope per HTTP method', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'harness-scope-method-'));
    plansDir = join(dir, 'plans');
    sessionsDir = join(dir, 'sessions');
    mkdirSync(plansDir, { recursive: true });
    mkdirSync(sessionsDir, { recursive: true });
    process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
    process.env['HARNESS_AUDIT_PATH'] = join(dir, 'audit.log');
    delete process.env['HARNESS_API_TOKEN'];

    store = new TokenStore(process.env['HARNESS_TOKENS_PATH'] as string);
    server = new OrchestratorServer(new FakeOrchestrator() as never, 0, {
      plansDir,
      sessionsDir,
    });
    port = await new Promise<number>((resolve) => {
      (server as unknown as { httpServer: http.Server }).httpServer.listen(
        0,
        '127.0.0.1',
        function (this: http.Server) {
          const addr = this.address();
          resolve(typeof addr === 'object' && addr ? addr.port : 0);
        }
      );
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      (server as unknown as { httpServer: http.Server }).httpServer.close(() => resolve());
    });
    safeRmTemp(dir);
    delete process.env['HARNESS_TOKENS_PATH'];
    delete process.env['HARNESS_AUDIT_PATH'];
  });

  it('rejects POST /api/plans from a read-status bearer and writes no plan file', async () => {
    const { token } = await store.create({ name: 'reader', scopes: ['read-status'] });

    const res = await request('/api/plans', 'POST', token, {
      filename: 'injected.md',
      content: '# written by a read-only token',
    });

    expect(res.status).toBe(403);
    expect(existsSync(join(plansDir, 'injected.md'))).toBe(false);
  });

  it('rejects DELETE /api/sessions/<id> from a read-status bearer and leaves the session on disk', async () => {
    const { token } = await store.create({ name: 'reader', scopes: ['read-status'] });
    const sessionId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const sessionDir = join(sessionsDir, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      join(sessionDir, 'session.json'),
      JSON.stringify({ sessionId, lastActiveAt: new Date(0).toISOString() })
    );

    const res = await request(`/api/sessions/${sessionId}`, 'DELETE', token);

    expect(res.status).toBe(403);
    expect(existsSync(join(sessionDir, 'session.json'))).toBe(true);
  });

  it('rejects PATCH /api/sessions/<id> from a read-status bearer', async () => {
    const { token } = await store.create({ name: 'reader', scopes: ['read-status'] });
    const sessionId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const sessionDir = join(sessionsDir, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'session.json'), JSON.stringify({ sessionId, note: 'before' }));

    const res = await request(`/api/sessions/${sessionId}`, 'PATCH', token, { note: 'after' });

    expect(res.status).toBe(403);
  });

  it('still allows GET /api/sessions for a read-status bearer', async () => {
    const { token } = await store.create({ name: 'reader', scopes: ['read-status'] });
    const res = await request('/api/sessions', 'GET', token);
    expect(res.status).toBe(200);
  });

  it('allows POST /api/plans for a trigger-job bearer', async () => {
    const { token } = await store.create({ name: 'writer', scopes: ['trigger-job'] });

    const res = await request('/api/plans', 'POST', token, {
      filename: 'authorized.md',
      content: '# written by a write-scoped token',
    });

    expect(res.status).toBe(201);
    expect(existsSync(join(plansDir, 'authorized.md'))).toBe(true);
  });

  it('allows DELETE /api/sessions/<id> for a trigger-job bearer', async () => {
    const { token } = await store.create({ name: 'writer', scopes: ['trigger-job'] });
    const sessionId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const sessionDir = join(sessionsDir, sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'session.json'), JSON.stringify({ sessionId }));

    const res = await request(`/api/sessions/${sessionId}`, 'DELETE', token);

    expect(res.status).toBe(200);
    expect(existsSync(sessionDir)).toBe(false);
  });
});
