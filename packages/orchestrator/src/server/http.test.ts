import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { OrchestratorServer } from './http';
import { TokenStore } from '../auth/tokens';

class FakeOrchestrator {
  getSnapshot() {
    return { ok: true };
  }
  on() {}
  removeListener() {}
}

let dir: string;
let server: OrchestratorServer;
let port: number;
let store: TokenStore;

async function request(
  p: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: p, method: 'GET', headers },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Phase 1 auth middleware', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'harness-http-'));
    process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
    process.env['HARNESS_AUDIT_PATH'] = join(dir, 'audit.log');
    delete process.env['HARNESS_API_TOKEN'];
    store = new TokenStore(process.env['HARNESS_TOKENS_PATH'] as string);
    server = new OrchestratorServer(new FakeOrchestrator() as never, 0);
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
  afterEach(() => {
    (server as unknown as { httpServer: http.Server }).httpServer.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/state returns 401 without a token (when tokens.json non-empty)', async () => {
    await store.create({ name: 'x', scopes: ['read-status'] });
    const res = await request('/api/state');
    expect(res.status).toBe(401);
  });

  it('GET /api/state returns 200 with a read-status bearer token', async () => {
    const { token } = await store.create({ name: 'x', scopes: ['read-status'] });
    const res = await request('/api/state', { authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
  });

  it('GET /api/state returns 403 with a non-matching scope', async () => {
    const { token } = await store.create({ name: 'x', scopes: ['trigger-job'] });
    const res = await request('/api/state', { authorization: `Bearer ${token}` });
    expect(res.status).toBe(403);
  });

  it('HARNESS_API_TOKEN env var still authenticates as admin', async () => {
    process.env['HARNESS_API_TOKEN'] = 'legacy-secret-xyz';
    const res = await request('/api/state', { authorization: 'Bearer legacy-secret-xyz' });
    expect(res.status).toBe(200);
    delete process.env['HARNESS_API_TOKEN'];
  });
});
