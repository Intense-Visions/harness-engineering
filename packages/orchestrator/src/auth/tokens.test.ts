import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TokenStore } from './tokens';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-tokens-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('TokenStore', () => {
  it('create() returns id + one-time secret + persisted record', async () => {
    const store = new TokenStore(join(dir, 'tokens.json'));
    const { id, token, record } = await store.create({
      name: 'slack-bot',
      scopes: ['trigger-job'],
    });
    expect(id).toMatch(/^tok_[a-f0-9]{16}$/);
    expect(token).toMatch(/^tok_[a-f0-9]{16}\.[A-Za-z0-9_-]+$/);
    expect(record.hashedSecret).not.toContain(token.split('.')[1]);
    expect(existsSync(join(dir, 'tokens.json'))).toBe(true);
  });

  it('verify() resolves to the matching record for a valid token', async () => {
    const store = new TokenStore(join(dir, 'tokens.json'));
    const { token } = await store.create({ name: 'x', scopes: ['read-status'] });
    const result = await store.verify(token);
    expect(result?.name).toBe('x');
  });

  it('verify() returns null for an invalid secret', async () => {
    const store = new TokenStore(join(dir, 'tokens.json'));
    const { id } = await store.create({ name: 'x', scopes: ['read-status'] });
    const result = await store.verify(`${id}.bogus`);
    expect(result).toBeNull();
  });

  it('verify() returns null for an expired token', async () => {
    const store = new TokenStore(join(dir, 'tokens.json'));
    const { token } = await store.create({
      name: 'x',
      scopes: ['read-status'],
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(await store.verify(token)).toBeNull();
  });

  it('list() redacts hashedSecret', async () => {
    const store = new TokenStore(join(dir, 'tokens.json'));
    await store.create({ name: 'a', scopes: ['admin'] });
    const list = await store.list();
    expect(list[0]).toBeDefined();
    expect(list[0] as object).not.toHaveProperty('hashedSecret');
  });

  it('revoke(id) removes the token; verify() then returns null', async () => {
    const store = new TokenStore(join(dir, 'tokens.json'));
    const { id, token } = await store.create({ name: 'x', scopes: ['admin'] });
    expect(await store.revoke(id)).toBe(true);
    expect(await store.verify(token)).toBeNull();
    expect(await store.revoke(id)).toBe(false);
  });

  it('legacyEnvToken() returns admin record when HARNESS_API_TOKEN matches', async () => {
    const store = new TokenStore(join(dir, 'tokens.json'));
    const rec = store.legacyEnvToken('supersecret', 'supersecret');
    expect(rec?.scopes).toContain('admin');
    expect(rec?.id).toBe('tok_legacy_env');
    expect(store.legacyEnvToken('wrong', 'supersecret')).toBeNull();
    expect(store.legacyEnvToken('any', undefined)).toBeNull();
  });
});
