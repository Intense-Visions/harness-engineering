import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { OrchestratorServer } from '../http';
import { TokenStore } from '../../auth/tokens';
import type { AuthTokenPublic } from '@harness-engineering/types';

class FakeOrchestrator {
  getSnapshot() {
    return { ok: true };
  }
  on() {}
  removeListener() {}
}

interface HttpResponse {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

let dir: string;
let server: OrchestratorServer;
let port: number;
let store: TokenStore;

async function request(
  p: string,
  method: string,
  headers: Record<string, string> = {},
  body?: string
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: chunks, headers: res.headers })
      );
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function json(body: unknown): { body: string; headers: Record<string, string> } {
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  };
}

describe('Phase 1 /api/v1/auth/* route handlers', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'harness-auth-routes-'));
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
    delete process.env['HARNESS_TOKENS_PATH'];
    delete process.env['HARNESS_AUDIT_PATH'];
  });

  describe('POST /api/v1/auth/token', () => {
    it('returns 401 without bearer when tokens.json is populated', async () => {
      // Seed at least one token so the unauth-dev fallback does NOT fire.
      await store.create({ name: 'seed', scopes: ['admin'] });
      const payload = json({ name: 'new-token', scopes: ['read-status'] });
      const res = await request('/api/v1/auth/token', 'POST', payload.headers, payload.body);
      expect(res.status).toBe(401);
    });

    it('returns 403 with a read-status bearer (scope check)', async () => {
      const { token } = await store.create({ name: 'reader', scopes: ['read-status'] });
      const payload = json({ name: 'new-token', scopes: ['read-status'] });
      const res = await request(
        '/api/v1/auth/token',
        'POST',
        { ...payload.headers, authorization: `Bearer ${token}` },
        payload.body
      );
      expect(res.status).toBe(403);
    });

    it('returns 200 + secret with an admin bearer', async () => {
      const { token } = await store.create({ name: 'root', scopes: ['admin'] });
      const payload = json({ name: 'minted', scopes: ['read-status'] });
      const res = await request(
        '/api/v1/auth/token',
        'POST',
        { ...payload.headers, authorization: `Bearer ${token}` },
        payload.body
      );
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body) as {
        token: string;
        id: string;
        name: string;
        scopes: string[];
        createdAt: string;
      };
      expect(body.token).toMatch(/^tok_[a-f0-9]{16}\..+/);
      expect(body.id).toMatch(/^tok_[a-f0-9]{16}$/);
      expect(body.name).toBe('minted');
      expect(body.scopes).toEqual(['read-status']);
      expect(body).not.toHaveProperty('hashedSecret');
    });

    it('returns 409 when name already exists', async () => {
      const { token } = await store.create({ name: 'root', scopes: ['admin'] });
      await store.create({ name: 'duplicate', scopes: ['read-status'] });
      const payload = json({ name: 'duplicate', scopes: ['read-status'] });
      const res = await request(
        '/api/v1/auth/token',
        'POST',
        { ...payload.headers, authorization: `Bearer ${token}` },
        payload.body
      );
      expect(res.status).toBe(409);
      const body = JSON.parse(res.body) as { error?: string };
      expect(body.error).toMatch(/already exists/i);
    });

    it('returns 422 when scopes are missing', async () => {
      const { token } = await store.create({ name: 'root', scopes: ['admin'] });
      const payload = json({ name: 'no-scopes' });
      const res = await request(
        '/api/v1/auth/token',
        'POST',
        { ...payload.headers, authorization: `Bearer ${token}` },
        payload.body
      );
      expect(res.status).toBe(422);
      const body = JSON.parse(res.body) as { error?: string };
      expect(body.error).toMatch(/invalid/i);
    });

    it('returns 400 on malformed JSON body', async () => {
      const { token } = await store.create({ name: 'root', scopes: ['admin'] });
      const res = await request(
        '/api/v1/auth/token',
        'POST',
        { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        '{ not json'
      );
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/auth/tokens', () => {
    it('returns 401 without bearer when tokens.json is populated', async () => {
      await store.create({ name: 'seed', scopes: ['admin'] });
      const res = await request('/api/v1/auth/tokens', 'GET');
      expect(res.status).toBe(401);
    });

    it('returns 200 + redacted array with admin bearer', async () => {
      const { token } = await store.create({ name: 'root', scopes: ['admin'] });
      await store.create({ name: 'other', scopes: ['read-status'] });
      const res = await request('/api/v1/auth/tokens', 'GET', {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body) as AuthTokenPublic[];
      expect(body).toHaveLength(2);
      for (const entry of body) {
        expect(entry).not.toHaveProperty('hashedSecret');
        expect(entry.id).toMatch(/^tok_[a-f0-9]{16}$/);
      }
    });
  });

  describe('DELETE /api/v1/auth/tokens/{id}', () => {
    it('returns 200 + deleted:true and the token is gone afterwards', async () => {
      const { token } = await store.create({ name: 'root', scopes: ['admin'] });
      const { id: victimId, token: victimToken } = await store.create({
        name: 'victim',
        scopes: ['read-status'],
      });
      const res = await request(`/api/v1/auth/tokens/${victimId}`, 'DELETE', {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body) as { deleted: boolean };
      expect(body.deleted).toBe(true);
      // Subsequent verify() should return null — token is gone.
      // Build a fresh TokenStore so we don't read a stale in-process cache.
      const fresh = new TokenStore(process.env['HARNESS_TOKENS_PATH'] as string);
      const result = await fresh.verify(victimToken);
      expect(result).toBeNull();
    });

    it('returns 404 when the id does not exist', async () => {
      const { token } = await store.create({ name: 'root', scopes: ['admin'] });
      const res = await request('/api/v1/auth/tokens/tok_0000000000000000', 'DELETE', {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(404);
    });
  });

  // Phase 1 review-cycle-2 regression: query-string scope bypass on admin routes.
  // scopes.ts uses exact path equality, but http.ts previously passed req.url
  // (which includes query string) and defaulted to permit when requiredScopeForRoute
  // returned null. A read-status bearer could mint admin tokens via
  // POST /api/v1/auth/token?x=1. Fixes:
  //   1. dispatchAuthedRequest strips the query string before lookup.
  //   2. The check is now `if (!required || !hasScope(...))` — default-deny.
  describe('query-string scope bypass regression (Phase 1 cycle-2)', () => {
    it.each([
      ['POST', '/api/v1/auth/token?x=1', JSON.stringify({ name: 'evil', scopes: ['admin'] })],
      [
        'POST',
        '/api/v1/auth/token?foo=bar&baz=qux',
        JSON.stringify({ name: 'evil', scopes: ['admin'] }),
      ],
      ['GET', '/api/v1/auth/tokens?_=1', undefined],
      ['DELETE', '/api/v1/auth/tokens/tok_0000000000000000?force=1', undefined],
    ])('rejects %s %s with read-status bearer (403, not 200)', async (method, path, body) => {
      const { token } = await store.create({ name: 'reader', scopes: ['read-status'] });
      const headers: Record<string, string> = { authorization: `Bearer ${token}` };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await request(path, method, headers, body);
      expect(res.status).toBe(403);
    });

    it('reproduces reviewer exploit: read-status bearer cannot mint admin token via ?x=1', async () => {
      // Seed a read-status token.
      const { token } = await store.create({ name: 'reader', scopes: ['read-status'] });
      // Attempt the exploit: POST /api/v1/auth/token?x=1 with admin scopes in body.
      const payload = json({ name: 'evil-bypass', scopes: ['admin'] });
      const res = await request(
        '/api/v1/auth/token?x=1',
        'POST',
        { ...payload.headers, authorization: `Bearer ${token}` },
        payload.body
      );
      expect(res.status).toBe(403);
      // Verify no admin token was minted: list (with the original admin-less reader) should fail.
      // A fresh store read should still show only the seeded reader token.
      const fresh = new TokenStore(process.env['HARNESS_TOKENS_PATH'] as string);
      const records = await fresh.list();
      expect(records).toHaveLength(1);
      expect(records[0]?.name).toBe('reader');
    });

    it('default-deny on unknown route: GET /api/v1/unknown returns 403 with read-status bearer', async () => {
      // Seed at least one token so the unauth-dev fallback does NOT fire.
      await store.create({ name: 'seed', scopes: ['admin'] });
      const { token } = await store.create({ name: 'reader', scopes: ['read-status'] });
      const res = await request('/api/v1/unknown', 'GET', {
        authorization: `Bearer ${token}`,
      });
      // requiredScopeForRoute returns null for unmapped paths; dispatch must
      // default-deny (403), not default-permit (which would let the route table
      // fall through to a 404 — leaking route existence to unauthorized callers).
      expect(res.status).toBe(403);
    });
  });
});
