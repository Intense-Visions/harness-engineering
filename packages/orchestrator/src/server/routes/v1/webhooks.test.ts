import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleV1WebhooksRoute } from './webhooks';
import { WebhookStore } from '../../../gateway/webhooks/store';
import { WebhookQueue } from '../../../gateway/webhooks/queue';
import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

function makeReq(method: string, url: string, body?: unknown): IncomingMessage {
  const r = new IncomingMessage(new Socket());
  r.method = method;
  r.url = url;
  (r as unknown as { _authToken: { id: string } })._authToken = { id: 'tok_test' };
  if (body !== undefined) {
    process.nextTick(() => {
      r.emit('data', Buffer.from(JSON.stringify(body)));
      r.emit('end');
    });
  } else {
    process.nextTick(() => r.emit('end'));
  }
  return r;
}
function makeRes(): { res: ServerResponse; chunks: string[]; statusCode: () => number } {
  const sock = new Socket();
  const r = new ServerResponse(new IncomingMessage(sock));
  const chunks: string[] = [];
  r.write = ((c: string) => {
    chunks.push(String(c));
    return true;
  }) as ServerResponse['write'];
  r.end = ((c?: string) => {
    if (c) chunks.push(String(c));
    return r;
  }) as ServerResponse['end'];
  return { res: r, chunks, statusCode: () => r.statusCode };
}

describe('handleV1WebhooksRoute', () => {
  let dir: string;
  let store: WebhookStore;
  let bus: EventEmitter;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-wh-routes-'));
    store = new WebhookStore(join(dir, 'webhooks.json'));
    bus = new EventEmitter();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('POST creates a subscription and returns the secret once', async () => {
    const req = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://example.com/hook',
      events: ['maintenance.completed'],
    });
    const { res, chunks, statusCode } = makeRes();
    const handled = handleV1WebhooksRoute(req, res, { store, bus });
    expect(handled).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(200);
    const body = JSON.parse(chunks.join('')) as { id: string; secret: string; url: string };
    expect(body.id).toMatch(/^whk_[a-f0-9]{16}$/);
    expect(body.secret.length).toBeGreaterThanOrEqual(32);
    expect(body.url).toBe('https://example.com/hook');
  });

  it('POST rejects http:// URLs with 422', async () => {
    const req = makeReq('POST', '/api/v1/webhooks', {
      url: 'http://example.com/hook',
      events: ['*'],
    });
    const { res, chunks, statusCode } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(422);
    expect(chunks.join('')).toContain('https');
  });

  it('GET lists subscriptions with secret redacted', async () => {
    await store.create({ tokenId: 'tok_test', url: 'https://a.test/h', events: ['*.*'] });
    const req = makeReq('GET', '/api/v1/webhooks');
    const { res, chunks, statusCode } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(200);
    const body = JSON.parse(chunks.join('')) as Array<{ url: string; secret?: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.secret).toBeUndefined();
  });

  it('DELETE removes the subscription and returns 200', async () => {
    const sub = await store.create({
      tokenId: 'tok_test',
      url: 'https://a.test/h',
      events: ['*.*'],
    });
    const req = makeReq('DELETE', `/api/v1/webhooks/${sub.id}`);
    const { res, statusCode } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(200);
    expect(await store.list()).toEqual([]);
  });

  it('DELETE returns 404 for unknown id', async () => {
    const req = makeReq('DELETE', '/api/v1/webhooks/whk_doesnotexist000');
    const { res, statusCode } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(404);
  });

  it('POST emits webhook.subscription.created on the bus', async () => {
    const events: unknown[] = [];
    bus.on('webhook.subscription.created', (e) => events.push(e));
    const req = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://example.com/hook',
      events: ['*.*'],
    });
    const { res } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toHaveLength(1);
  });

  // SUG-5 + DELTA-SUG-2 carry-forwards
  it('POST under unauth-dev emits exactly one console.warn per process', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req1 = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://example.com/hook1',
      events: ['*.*'],
    });
    (req1 as unknown as { _authToken: { id: string } })._authToken = { id: 'tok_legacy_env' };
    // synthetic-admin sentinel ID matches tokens.ts:LEGACY_ENV_ID — but the
    // unauth-dev synthetic admin uses a distinct sentinel; webhooks.ts uses
    // both legacy-env and unauth-dev sentinel IDs as the "warn" trigger.
    // Implementation reads a process-wide flag set during resolveAuth.
    process.env['HARNESS_UNAUTH_DEV_ACTIVE'] = '1';
    const { res: r1 } = makeRes();
    handleV1WebhooksRoute(req1, r1, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    const req2 = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://example.com/hook2',
      events: ['*.*'],
    });
    (req2 as unknown as { _authToken: { id: string } })._authToken = { id: 'tok_legacy_env' };
    const { res: r2 } = makeRes();
    handleV1WebhooksRoute(req2, r2, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(warnSpy.mock.calls.filter((c) => String(c[0]).includes('unauth-dev')).length).toBe(1);
    warnSpy.mockRestore();
    delete process.env['HARNESS_UNAUTH_DEV_ACTIVE'];
  });

  // Phase 4: queue stats endpoint
  it('GET /api/v1/webhooks/queue/stats returns the four queue counters as JSON', async () => {
    const queue = new WebhookQueue(':memory:');
    try {
      const req = makeReq('GET', '/api/v1/webhooks/queue/stats');
      const { res, chunks, statusCode } = makeRes();
      const handled = handleV1WebhooksRoute(req, res, { store, bus, queue });
      expect(handled).toBe(true);
      await new Promise((r) => setTimeout(r, 20));
      expect(statusCode()).toBe(200);
      const body = JSON.parse(chunks.join('')) as {
        pending: number;
        failed: number;
        dead: number;
        delivered: number;
      };
      expect(body.pending).toBe(0);
      expect(body.failed).toBe(0);
      expect(body.dead).toBe(0);
      expect(body.delivered).toBe(0);
    } finally {
      queue.close();
    }
  });

  it('GET /api/v1/webhooks/queue/stats returns 503 when queue is undefined', async () => {
    const req = makeReq('GET', '/api/v1/webhooks/queue/stats');
    const { res, statusCode } = makeRes();
    const handled = handleV1WebhooksRoute(req, res, { store, bus });
    expect(handled).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(503);
  });

  // DELTA-SUG-2 carry-forward: positive shape assertion (not just block-list)
  it('GET response items have exactly the public-shape keys (allow-list pattern)', async () => {
    await store.create({ tokenId: 'tok_test', url: 'https://a.test/h', events: ['*.*'] });
    const req = makeReq('GET', '/api/v1/webhooks');
    const { res, chunks } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    const body = JSON.parse(chunks.join('')) as Array<Record<string, unknown>>;
    expect(Object.keys(body[0] ?? {}).sort()).toEqual(
      ['createdAt', 'events', 'id', 'tokenId', 'url'].sort()
    );
    // belt-and-braces block-list scan
    expect(JSON.stringify(body)).not.toMatch(/secret/i);
  });
});
