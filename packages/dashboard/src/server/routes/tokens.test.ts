import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { buildTokensRouter } from './tokens';
import { TokenStore } from '@harness-engineering/orchestrator';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-dash-tokens-'));
  process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env['HARNESS_TOKENS_PATH'];
});

describe('GET /api/tokens', () => {
  it('returns the list with hashedSecret redacted', async () => {
    const store = new TokenStore(process.env['HARNESS_TOKENS_PATH'] as string);
    await store.create({ name: 'a', scopes: ['admin'] });
    const app = new Hono().route('/api', buildTokensRouter());
    const res = await app.request('/api/tokens');
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(1);
    expect(body[0] as object).not.toHaveProperty('hashedSecret');
  });
});

describe('POST /api/tokens', () => {
  it('creates a token and returns the secret once', async () => {
    const app = new Hono().route('/api', buildTokensRouter());
    const res = await app.request('/api/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'a', scopes: ['admin'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; id: string };
    expect(body.token).toMatch(/^tok_/);
  });
});

describe('DELETE /api/tokens/:id', () => {
  it('revokes the token', async () => {
    const store = new TokenStore(process.env['HARNESS_TOKENS_PATH'] as string);
    const { id } = await store.create({ name: 'a', scopes: ['admin'] });
    const app = new Hono().route('/api', buildTokensRouter());
    const res = await app.request(`/api/tokens/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
