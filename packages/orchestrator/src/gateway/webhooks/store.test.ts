import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebhookStore } from './store';

describe('WebhookStore', () => {
  let dir: string;
  let store: WebhookStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-webhook-store-'));
    store = new WebhookStore(join(dir, 'webhooks.json'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns empty list when file missing', async () => {
    expect(await store.list()).toEqual([]);
  });

  it('persists a subscription and round-trips', async () => {
    const sub = await store.create({
      tokenId: 'tok_a',
      url: 'https://example.com/hook',
      events: ['maintenance.completed'],
    });
    expect(sub.id).toMatch(/^whk_[a-f0-9]{16}$/);
    expect(sub.secret).toMatch(/^[A-Za-z0-9_-]{40,}$/); // base64url-ish
    const fresh = new WebhookStore(join(dir, 'webhooks.json'));
    const records = await fresh.list();
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(sub.id);
    expect(records[0]?.secret).toBe(sub.secret); // plaintext at rest per decision (A)
  });

  it('write sets mode 0600 on the file (secret-protection invariant)', async () => {
    await store.create({ tokenId: 'tok_a', url: 'https://example.com/hook', events: ['*'] });
    const mode = statSync(join(dir, 'webhooks.json')).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('deletes a subscription by id', async () => {
    const sub = await store.create({
      tokenId: 'tok_a',
      url: 'https://example.com/hook',
      events: ['maintenance.completed'],
    });
    const ok = await store.delete(sub.id);
    expect(ok).toBe(true);
    expect(await store.list()).toEqual([]);
  });

  it('delete returns false for unknown id', async () => {
    expect(await store.delete('whk_0000000000000000')).toBe(false);
  });

  it('listForEvent returns subs whose events list matches', async () => {
    const a = await store.create({
      tokenId: 't',
      url: 'https://a.test',
      events: ['interaction.*'],
    });
    await store.create({
      tokenId: 't',
      url: 'https://b.test',
      events: ['maintenance.completed'],
    });
    const matches = await store.listForEvent('interaction.created');
    expect(matches.map((s) => s.id).sort()).toEqual([a.id].sort());
  });
});
