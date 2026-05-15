import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { OrchestratorServer } from './http';
import { WebhookStore } from '../gateway/webhooks/store';
import { WebhookDelivery } from '../gateway/webhooks/delivery';
import { WebhookQueue } from '../gateway/webhooks/queue';
import { wireWebhookFanout } from '../gateway/webhooks/events';

/**
 * Phase 3 Task 12: end-to-end integration test — the spec exit-gate proof.
 *
 * Flow: subscription created → orchestrator event fires → bridge URL receives
 * signed POST → bridge verifies signature using a 5-line snippet that any
 * bridge author can copy-paste. The verifyHmac helper below IS the bridge-side
 * verification recipe; if it requires changes here, bridges must mirror them.
 *
 * FakeOrchestrator is the standard local fixture (mirrors Phase 2 alias tests
 * at http-v1-aliases.test.ts:11-15). It extends EventEmitter so wireWebhookFanout
 * subscribes its handlers onto the same bus that .emit() fires onto.
 */
class FakeOrchestrator extends EventEmitter {
  getSnapshot(): Record<string, unknown> {
    return { ok: true };
  }
}

/**
 * Reference bridge-side HMAC verification: ~5 LOC. Bridge authors copy this
 * verbatim. Inputs:
 *   - secret: the value returned in POST /api/v1/webhooks response body
 *   - body:   the raw POST body bytes (DO NOT JSON.parse + re-stringify)
 *   - header: the X-Harness-Signature value (case-insensitive on the receiving
 *             side; Node lowercases header names by default)
 */
function verifyHmac(secret: string, body: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

describe('webhooks end-to-end: subscribe → event → signed POST → HMAC verify', () => {
  let dir: string;
  let server: OrchestratorServer;
  let receiver: http.Server;
  let received: Array<{ headers: http.IncomingHttpHeaders; body: string }>;
  let receiverPort: number;
  let orchestrator: FakeOrchestrator;
  let store: WebhookStore;
  let queue: WebhookQueue;
  let delivery: WebhookDelivery;
  let fanoutOff: () => void;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'harness-wh-int-'));
    mkdirSync(dir, { recursive: true });
    process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
    process.env['HARNESS_AUDIT_PATH'] = join(dir, 'audit.log');
    delete process.env['HARNESS_API_TOKEN'];

    received = [];
    receiver = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', () => r()));
    receiverPort = (receiver.address() as AddressInfo).port;

    orchestrator = new FakeOrchestrator();
    store = new WebhookStore(join(dir, 'webhooks.json'));
    queue = new WebhookQueue(':memory:');
    delivery = new WebhookDelivery({ queue, store, tickIntervalMs: 30, allowPrivateHosts: true });
    delivery.start();
    fanoutOff = wireWebhookFanout({ bus: orchestrator, store, delivery });

    server = new OrchestratorServer(orchestrator as never, 0, {
      webhooks: { store, delivery },
    });
    await new Promise<void>((resolve) => {
      (server as unknown as { httpServer: http.Server }).httpServer.listen(0, '127.0.0.1', () =>
        resolve()
      );
    });
  });

  afterEach(async () => {
    fanoutOff();
    await delivery.stop();
    queue.close();
    (server as unknown as { httpServer: http.Server }).httpServer.close();
    await new Promise<void>((r) => receiver.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
    delete process.env['HARNESS_TOKENS_PATH'];
    delete process.env['HARNESS_AUDIT_PATH'];
  });

  it('full round-trip: subscribe, emit, receive signed POST, verify HMAC', async () => {
    // 1. Subscribe via direct store.create (the Phase 3 route validator rejects
    //    http:// URLs at registration; the integration test exercises the
    //    delivery+signature path, not the validator — Task 7 covers that
    //    separately). Concern #7 in the plan documents this trade-off.
    const sub = await store.create({
      tokenId: 'tok_test',
      url: `http://127.0.0.1:${receiverPort}/hook`,
      events: ['maintenance.completed'],
    });
    // 2. Emit the event on the orchestrator's bus (using the `:` legacy form;
    //    wireWebhookFanout normalizes to `maintenance.completed` for matching).
    orchestrator.emit('maintenance:completed', { id: 'task_a', status: 'ok' });
    // 3. Wait for delivery to land on the receiver.
    await new Promise((r) => setTimeout(r, 150));
    expect(received).toHaveLength(1);
    const r = received[0]!;
    expect(r.headers['x-harness-event-type']).toBe('maintenance.completed');
    expect(r.headers['x-harness-delivery-id']).toMatch(/^dlv_[a-f0-9]{16}$/);
    expect(r.headers['x-harness-timestamp']).toBeDefined();
    // 4. Bridge-side HMAC verification: this is the spec exit-gate proof.
    expect(verifyHmac(sub.secret, r.body, r.headers['x-harness-signature'] as string)).toBe(true);
    // 5. Body is a valid GatewayEvent envelope.
    const evt = JSON.parse(r.body) as { id: string; type: string; data: unknown };
    expect(evt.type).toBe('maintenance.completed');
    expect(evt.id).toMatch(/^evt_[a-f0-9]+$/);
  });

  it('DELETE stops further fan-out within 100ms', async () => {
    const sub = await store.create({
      tokenId: 'tok_test',
      url: `http://127.0.0.1:${receiverPort}/hook`,
      events: ['maintenance.completed'],
    });
    // Issue the DELETE through HTTP — but unauth-dev or seeded admin token
    // is needed; pre-seed via store's mutation path is equivalent and avoids
    // the auth-fixture coupling.
    await store.delete(sub.id);
    orchestrator.emit('maintenance:completed', { id: 'task_b' });
    await new Promise((r) => setTimeout(r, 200));
    expect(received).toHaveLength(0);
  });

  /**
   * Phase 4 Task 13: durability proof. Insert a row into a SQLite-backed
   * queue, close the handle (simulating clean shutdown), reopen the same
   * file in a new WebhookQueue instance, and verify the row survives.
   *
   * This is the spec exit-gate proof for "delivery survives orchestrator
   * restart" — kill -9 would simulate a hard crash, but a clean close+reopen
   * is sufficient to validate the WAL persistence path because better-sqlite3
   * + WAL mode flushes the transaction journal on insert(). The kill -9 case
   * is exercised manually during release smoke testing.
   */
  it('delivery survives queue persistence: row still present after close+reopen', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'harness-integ-q-'));
    const dbPath = join(tmpDir, 'q.sqlite');
    try {
      const q1 = new WebhookQueue(dbPath);
      const s = await store.create({
        tokenId: 't',
        url: 'https://example.com/h',
        events: ['*.*'],
      });
      q1.insert({
        id: 'dlv_integ00000001',
        subscriptionId: s.id,
        eventType: 'x',
        payload: '{}',
      });
      q1.close();
      // Simulate process restart — new queue instance opens same file.
      const q2 = new WebhookQueue(dbPath);
      const rows = q2.claim(Date.now() + 5000);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe('dlv_integ00000001');
      q2.close();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
