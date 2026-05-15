import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTokenCreate, runTokenList, runTokenRevoke } from './token';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-cli-token-'));
  process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env['HARNESS_TOKENS_PATH'];
});

describe('gateway token create', () => {
  it('prints the secret exactly once', async () => {
    const out = await runTokenCreate({ name: 'slack-bot', scopes: ['trigger-job'] });
    expect(out.token).toMatch(/^tok_[a-f0-9]{16}\..+/);
    expect(out.id).toMatch(/^tok_[a-f0-9]{16}$/);
    expect(existsSync(join(dir, 'tokens.json'))).toBe(true);
  });
});

describe('gateway token list', () => {
  it('redacts hashedSecret', async () => {
    await runTokenCreate({ name: 'a', scopes: ['admin'] });
    const list = await runTokenList();
    expect(list[0]).toBeDefined();
    expect(list[0] as object).not.toHaveProperty('hashedSecret');
  });
});

describe('gateway token revoke', () => {
  it('returns true for known id, false for unknown', async () => {
    const { id } = await runTokenCreate({ name: 'a', scopes: ['admin'] });
    expect(await runTokenRevoke(id)).toBe(true);
    expect(await runTokenRevoke('tok_doesnotexist00')).toBe(false);
  });
});
