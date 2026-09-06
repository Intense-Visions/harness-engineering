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

/**
 * The POST path resolves the target hostname through `guardOutboundHost`
 * (added in 0876aec04), so without this stub every POST case here performs a
 * live `dns.lookup('example.com')` -- real network latency inside a unit test,
 * and a hard 422 on any runner that cannot resolve. Stub the resolver with a
 * fixed table so the POST cases are offline and deterministic.
 *
 * This mirrors the identical stub in the sibling `webhooks-url-guard.test.ts`,
 * which was added with the guard for exactly this reason; this file was simply
 * missed at the time. The guard's own behaviour is covered exhaustively there
 * against an injected lookup, so nothing is lost by stubbing it here.
 *
 * Unknown hosts throw ENOTFOUND rather than resolving, so a case that adds a
 * new target gets a clear signal instead of silently reaching the network.
 */
vi.mock('node:dns/promises', () => ({
  lookup: async (hostname: string) => {
    const table: Record<string, string> = { 'example.com': '93.184.216.34' };
    const address = table[hostname];
    if (!address) {
      throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    }
    return [{ address, family: 4 }];
  },
}));

function makeReq(
  method: string,
  url: string,
  body?: unknown,
  auth?: { id: string; scopes?: string[] }
): IncomingMessage {
  const r = new IncomingMessage(new Socket());
  r.method = method;
  r.url = url;
  // Default: a non-admin bearer scoped to subscribe-webhook (matches the
  // production scope check upstream in dispatchAuthedRequest).
  const id = auth?.id ?? 'tok_test';
  const scopes = auth?.scopes ?? ['subscribe-webhook'];
  (r as unknown as { _authToken: { id: string; scopes: string[] } })._authToken = { id, scopes };
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
/**
 * How long `whenEnded()` waits before declaring the handler hung.
 *
 * This is NOT a settle delay -- nothing waits for it on the happy path. It is
 * only the bound that turns "the response never arrives" into a loud, specific
 * failure instead of a suite-timeout with no explanation. It is therefore set
 * generously: a slow runner must never hit it, only a genuine hang.
 */
const RESPONSE_END_TIMEOUT_MS = 10_000;

/**
 * `handleV1WebhooksRoute` returns `true` synchronously and finishes the
 * response later, on its own async chain. `whenEnded()` is that chain's
 * completion signal: it settles the instant the stubbed `res.end()` runs,
 * which is exactly the instant `chunks` is complete.
 *
 * Await it instead of sleeping. A fixed sleep is a guess about how long the
 * handler takes, and this file already lost that bet twice -- once at 100ms
 * (bumped to 500ms in b1747f6f2) and again on the bus-event assertion
 * (converted to a poll in aafaa2d9f) -- before a loaded Windows CI runner beat
 * the 500ms budget too and read a half-written body as `JSON.parse('')`.
 * Waiting for the signal has no budget to lose.
 */
function makeRes(): {
  res: ServerResponse;
  chunks: string[];
  statusCode: () => number;
  whenEnded: () => Promise<void>;
} {
  const sock = new Socket();
  const r = new ServerResponse(new IncomingMessage(sock));
  const chunks: string[] = [];
  let hasEnded = false;
  let markEnded: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    markEnded = () => {
      hasEnded = true;
      resolve();
    };
  });
  r.write = ((c: string) => {
    chunks.push(String(c));
    return true;
  }) as ServerResponse['write'];
  r.end = ((c?: string) => {
    if (c) chunks.push(String(c));
    markEnded();
    return r;
  }) as ServerResponse['end'];
  async function whenEnded(): Promise<void> {
    // Routes that answer synchronously (queue stats, the 503) have already
    // ended by the time the caller awaits; skip arming a timer for them.
    if (hasEnded) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ended,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`handler did not end the response within ${RESPONSE_END_TIMEOUT_MS}ms`)
              ),
            RESPONSE_END_TIMEOUT_MS
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { res: r, chunks, statusCode: () => r.statusCode, whenEnded };
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
    const { res, chunks, statusCode, whenEnded } = makeRes();
    const handled = handleV1WebhooksRoute(req, res, { store, bus });
    expect(handled).toBe(true);
    await whenEnded();
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
    const { res, chunks, statusCode, whenEnded } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await whenEnded();
    expect(statusCode()).toBe(422);
    expect(chunks.join('')).toContain('https');
  });

  it('GET lists subscriptions with secret redacted', async () => {
    await store.create({ tokenId: 'tok_test', url: 'https://a.test/h', events: ['*.*'] });
    const req = makeReq('GET', '/api/v1/webhooks');
    const { res, chunks, statusCode, whenEnded } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await whenEnded();
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
    const { res, statusCode, whenEnded } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await whenEnded();
    expect(statusCode()).toBe(200);
    expect(await store.list()).toEqual([]);
  });

  it('DELETE returns 404 for unknown id', async () => {
    const req = makeReq('DELETE', '/api/v1/webhooks/whk_doesnotexist000');
    const { res, statusCode, whenEnded } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await whenEnded();
    expect(statusCode()).toBe(404);
  });

  it('POST emits webhook.subscription.created on the bus', async () => {
    const events: unknown[] = [];
    bus.on('webhook.subscription.created', (e) => events.push(e));
    const req = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://example.com/hook',
      events: ['*.*'],
    });
    const { res, whenEnded } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    // The handler emits on the bus before it writes the response, so the
    // response's own end signal is a sufficient barrier -- no poll budget to
    // outgrow, unlike the ~2s loop this replaces.
    await whenEnded();
    expect(events).toHaveLength(1);
  });

  // SUG-5 + DELTA-SUG-2 carry-forwards
  it('POST under unauth-dev emits exactly one console.warn per process', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req1 = makeReq(
      'POST',
      '/api/v1/webhooks',
      { url: 'https://example.com/hook1', events: ['*.*'] },
      { id: 'tok_legacy_env', scopes: ['admin'] }
    );
    // synthetic-admin sentinel ID matches tokens.ts:LEGACY_ENV_ID — but the
    // unauth-dev synthetic admin uses a distinct sentinel; webhooks.ts uses
    // both legacy-env and unauth-dev sentinel IDs as the "warn" trigger.
    // Implementation reads a process-wide flag set during resolveAuth.
    process.env['HARNESS_UNAUTH_DEV_ACTIVE'] = '1';
    const { res: r1, whenEnded: r1Ended } = makeRes();
    handleV1WebhooksRoute(req1, r1, { store, bus });
    await r1Ended();
    const req2 = makeReq(
      'POST',
      '/api/v1/webhooks',
      { url: 'https://example.com/hook2', events: ['*.*'] },
      { id: 'tok_legacy_env', scopes: ['admin'] }
    );
    const { res: r2, whenEnded: r2Ended } = makeRes();
    handleV1WebhooksRoute(req2, r2, { store, bus });
    await r2Ended();
    expect(warnSpy.mock.calls.filter((c) => String(c[0]).includes('unauth-dev')).length).toBe(1);
    warnSpy.mockRestore();
    delete process.env['HARNESS_UNAUTH_DEV_ACTIVE'];
  });

  // Phase 4: queue stats endpoint
  it('GET /api/v1/webhooks/queue/stats returns the four queue counters as JSON', async () => {
    const queue = new WebhookQueue(':memory:');
    try {
      const req = makeReq('GET', '/api/v1/webhooks/queue/stats');
      const { res, chunks, statusCode, whenEnded } = makeRes();
      const handled = handleV1WebhooksRoute(req, res, { store, bus, queue });
      expect(handled).toBe(true);
      await whenEnded();
      expect(statusCode()).toBe(200);
      const body = JSON.parse(chunks.join('')) as {
        pending: number;
        inFlight: number;
        failed: number;
        dead: number;
        delivered: number;
      };
      expect(body.pending).toBe(0);
      expect(body.inFlight).toBe(0);
      expect(body.failed).toBe(0);
      expect(body.dead).toBe(0);
      expect(body.delivered).toBe(0);
    } finally {
      queue.close();
    }
  });

  it('GET /api/v1/webhooks/queue/stats returns 503 when queue is undefined', async () => {
    const req = makeReq('GET', '/api/v1/webhooks/queue/stats');
    const { res, statusCode, whenEnded } = makeRes();
    const handled = handleV1WebhooksRoute(req, res, { store, bus });
    expect(handled).toBe(true);
    await whenEnded();
    expect(statusCode()).toBe(503);
  });

  // DELTA-SUG-2 carry-forward: positive shape assertion (not just block-list)
  it('GET response items have exactly the public-shape keys (allow-list pattern)', async () => {
    await store.create({ tokenId: 'tok_test', url: 'https://a.test/h', events: ['*.*'] });
    const req = makeReq('GET', '/api/v1/webhooks');
    const { res, chunks, whenEnded } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await whenEnded();
    const body = JSON.parse(chunks.join('')) as Array<Record<string, unknown>>;
    expect(Object.keys(body[0] ?? {}).sort()).toEqual(
      ['createdAt', 'events', 'id', 'tokenId', 'url'].sort()
    );
    // belt-and-braces block-list scan
    expect(JSON.stringify(body)).not.toMatch(/secret/i);
  });

  // ── Phase 0 FINAL_REVIEW #4: GET filters by token ownership ──
  describe('GET ownership filtering (spec §D2 per-bridge audit)', () => {
    it('each token sees ONLY its own subscriptions', async () => {
      await store.create({ tokenId: 'tok_A', url: 'https://a.test/h', events: ['*.*'] });
      await store.create({ tokenId: 'tok_B', url: 'https://b.test/h', events: ['*.*'] });

      // Token A
      const reqA = makeReq('GET', '/api/v1/webhooks', undefined, {
        id: 'tok_A',
        scopes: ['subscribe-webhook'],
      });
      const { res: resA, chunks: chunksA, statusCode: scA, whenEnded: resAEnded } = makeRes();
      handleV1WebhooksRoute(reqA, resA, { store, bus });
      await resAEnded();
      expect(scA()).toBe(200);
      const bodyA = JSON.parse(chunksA.join('')) as Array<{ tokenId: string }>;
      expect(bodyA).toHaveLength(1);
      expect(bodyA[0]?.tokenId).toBe('tok_A');

      // Token B
      const reqB = makeReq('GET', '/api/v1/webhooks', undefined, {
        id: 'tok_B',
        scopes: ['subscribe-webhook'],
      });
      const { res: resB, chunks: chunksB, whenEnded: resBEnded } = makeRes();
      handleV1WebhooksRoute(reqB, resB, { store, bus });
      await resBEnded();
      const bodyB = JSON.parse(chunksB.join('')) as Array<{ tokenId: string }>;
      expect(bodyB).toHaveLength(1);
      expect(bodyB[0]?.tokenId).toBe('tok_B');
    });

    it('non-admin token does NOT see other tokens subscriptions', async () => {
      await store.create({ tokenId: 'tok_owner', url: 'https://o.test/h', events: ['*.*'] });
      const req = makeReq('GET', '/api/v1/webhooks', undefined, {
        id: 'tok_intruder',
        scopes: ['subscribe-webhook'],
      });
      const { res, chunks, whenEnded } = makeRes();
      handleV1WebhooksRoute(req, res, { store, bus });
      await whenEnded();
      const body = JSON.parse(chunks.join('')) as unknown[];
      expect(body).toEqual([]);
    });

    it('admin scope sees ALL subscriptions across tokens', async () => {
      await store.create({ tokenId: 'tok_A', url: 'https://a.test/h', events: ['*.*'] });
      await store.create({ tokenId: 'tok_B', url: 'https://b.test/h', events: ['*.*'] });
      const req = makeReq('GET', '/api/v1/webhooks', undefined, {
        id: 'tok_admin',
        scopes: ['admin'],
      });
      const { res, chunks, whenEnded } = makeRes();
      handleV1WebhooksRoute(req, res, { store, bus });
      await whenEnded();
      const body = JSON.parse(chunks.join('')) as unknown[];
      expect(body).toHaveLength(2);
    });

    it('legacy env synthetic-admin token (tok_legacy_env) sees ALL subs', async () => {
      await store.create({ tokenId: 'tok_A', url: 'https://a.test/h', events: ['*.*'] });
      await store.create({ tokenId: 'tok_B', url: 'https://b.test/h', events: ['*.*'] });
      const req = makeReq('GET', '/api/v1/webhooks', undefined, {
        id: 'tok_legacy_env',
        scopes: ['admin'],
      });
      const { res, chunks, whenEnded } = makeRes();
      handleV1WebhooksRoute(req, res, { store, bus });
      await whenEnded();
      const body = JSON.parse(chunks.join('')) as unknown[];
      expect(body).toHaveLength(2);
    });
  });

  // ── Phase 0 FINAL_REVIEW #5: DELETE enforces token ownership ──
  describe('DELETE ownership enforcement (spec §D2 per-bridge revocation)', () => {
    it('refuses cross-token DELETE with 403', async () => {
      const sub = await store.create({
        tokenId: 'tok_owner',
        url: 'https://o.test/h',
        events: ['*.*'],
      });
      const req = makeReq('DELETE', `/api/v1/webhooks/${sub.id}`, undefined, {
        id: 'tok_intruder',
        scopes: ['subscribe-webhook'],
      });
      const { res, chunks, statusCode, whenEnded } = makeRes();
      handleV1WebhooksRoute(req, res, { store, bus });
      await whenEnded();
      expect(statusCode()).toBe(403);
      expect(JSON.parse(chunks.join('')) as { error: string }).toEqual({ error: 'forbidden' });
      // Sub still present in the store.
      expect((await store.list()).map((s) => s.id)).toContain(sub.id);
    });

    it('owner DELETE succeeds with 200', async () => {
      const sub = await store.create({
        tokenId: 'tok_owner',
        url: 'https://o.test/h',
        events: ['*.*'],
      });
      const req = makeReq('DELETE', `/api/v1/webhooks/${sub.id}`, undefined, {
        id: 'tok_owner',
        scopes: ['subscribe-webhook'],
      });
      const { res, statusCode, whenEnded } = makeRes();
      handleV1WebhooksRoute(req, res, { store, bus });
      await whenEnded();
      expect(statusCode()).toBe(200);
      expect(await store.list()).toEqual([]);
    });

    it('admin DELETE of any sub succeeds with 200', async () => {
      const sub = await store.create({
        tokenId: 'tok_other',
        url: 'https://o.test/h',
        events: ['*.*'],
      });
      const req = makeReq('DELETE', `/api/v1/webhooks/${sub.id}`, undefined, {
        id: 'tok_admin',
        scopes: ['admin'],
      });
      const { res, statusCode, whenEnded } = makeRes();
      handleV1WebhooksRoute(req, res, { store, bus });
      await whenEnded();
      expect(statusCode()).toBe(200);
      expect(await store.list()).toEqual([]);
    });

    it('legacy env synthetic-admin DELETE of any sub succeeds', async () => {
      const sub = await store.create({
        tokenId: 'tok_other',
        url: 'https://o.test/h',
        events: ['*.*'],
      });
      const req = makeReq('DELETE', `/api/v1/webhooks/${sub.id}`, undefined, {
        id: 'tok_legacy_env',
        scopes: ['admin'],
      });
      const { res, statusCode, whenEnded } = makeRes();
      handleV1WebhooksRoute(req, res, { store, bus });
      await whenEnded();
      expect(statusCode()).toBe(200);
    });

    it('DELETE of nonexistent id still returns 404 regardless of auth', async () => {
      const req = makeReq('DELETE', '/api/v1/webhooks/whk_doesnotexist000', undefined, {
        id: 'tok_intruder',
        scopes: ['subscribe-webhook'],
      });
      const { res, statusCode, whenEnded } = makeRes();
      handleV1WebhooksRoute(req, res, { store, bus });
      await whenEnded();
      expect(statusCode()).toBe(404);
    });
  });
});
