import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebhookDelivery } from './delivery';
import { WebhookQueue, MAX_ATTEMPTS } from './queue';
import { WebhookStore } from './store';

function makeSetup() {
  const dir = mkdtempSync(join(tmpdir(), 'harness-dlv-'));
  const store = new WebhookStore(join(dir, 'webhooks.json'));
  const queue = new WebhookQueue(':memory:');
  return { dir, store, queue };
}

function makeGatewayEvent(n = 0) {
  return {
    id: `evt_${String(n).padStart(16, '0')}`,
    type: 'maintenance.completed',
    timestamp: new Date().toISOString(),
    data: {},
  };
}

describe('WebhookDelivery (queue-backed)', () => {
  let dir: string;
  let store: WebhookStore;
  let queue: WebhookQueue;
  let receiver: http.Server;
  let received: Array<{ headers: http.IncomingHttpHeaders; body: string }>;
  let receiverUrl: string;

  beforeEach(async () => {
    ({ dir, store, queue } = makeSetup());
    received = [];
    receiver = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(200);
        res.end('{}');
      });
    });
    await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', () => r()));
    const port = (receiver.address() as AddressInfo).port;
    receiverUrl = `http://127.0.0.1:${port}/hook`;
  });

  afterEach(async () => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
    await new Promise<void>((r) => receiver.close(() => r()));
  });

  it('enqueue inserts a pending row', async () => {
    const sub = await store.create({ tokenId: 't', url: receiverUrl, events: ['*.*'] });
    const worker = new WebhookDelivery({ queue, store });
    worker.enqueue(sub, makeGatewayEvent());
    expect(queue.stats().pending).toBe(1);
  });

  it('tick delivers a pending row, marks it delivered, POSTs correct headers', async () => {
    const sub = await store.create({ tokenId: 't', url: receiverUrl, events: ['*.*'] });
    const worker = new WebhookDelivery({ queue, store, tickIntervalMs: 30 });
    worker.enqueue(sub, makeGatewayEvent());
    worker.start();
    await new Promise((r) => setTimeout(r, 300));
    await worker.stop();
    expect(received).toHaveLength(1);
    expect(received[0]?.headers['x-harness-signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(received[0]?.headers['x-harness-delivery-id']).toMatch(/^dlv_[a-f0-9]{16}$/);
    expect(queue.stats().delivered).toBe(1);
    expect(queue.stats().pending).toBe(0);
  });

  it('markFailed escalates to dead after MAX_ATTEMPTS', () => {
    queue.insert({
      id: 'dlv_failtest0000001',
      subscriptionId: 'whk_a',
      eventType: 'x',
      payload: '{}',
    });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      queue.markFailed('dlv_failtest0000001', i + 1, Date.now(), 'HTTP 500');
    }
    expect(queue.stats().dead).toBe(1);
    expect(queue.stats().failed).toBe(0);
  });

  it('semaphore: maxConcurrentPerSub=1 limits concurrent deliveries', async () => {
    const slowReceiver = http.createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200);
        res.end('{}');
      }, 200);
    });
    await new Promise<void>((r) => slowReceiver.listen(0, '127.0.0.1', () => r()));
    const slowUrl = `http://127.0.0.1:${(slowReceiver.address() as AddressInfo).port}/`;
    const sub = await store.create({ tokenId: 't', url: slowUrl, events: ['*.*'] });
    const worker = new WebhookDelivery({
      queue,
      store,
      tickIntervalMs: 20,
      maxConcurrentPerSub: 1,
    });
    for (let i = 0; i < 3; i++) {
      worker.enqueue(sub, makeGatewayEvent(i));
    }
    worker.start();
    await new Promise((r) => setTimeout(r, 100));
    // With cap=1 and 200ms response: at most 1 delivered in first 100ms
    expect(queue.stats().delivered).toBeLessThanOrEqual(1);
    await worker.stop();
    await new Promise<void>((r) => slowReceiver.close(() => r()));
  });

  it('stop() waits for in-flight delivery before resolving', async () => {
    const sub = await store.create({ tokenId: 't', url: receiverUrl, events: ['*.*'] });
    const worker = new WebhookDelivery({ queue, store, tickIntervalMs: 30, drainTimeoutMs: 5000 });
    worker.enqueue(sub, makeGatewayEvent());
    worker.start();
    await new Promise((r) => setTimeout(r, 50));
    await worker.stop();
    expect(queue.stats().delivered).toBe(1);
  });

  it('deleted subscription dead-letters the queued delivery', async () => {
    const sub = await store.create({ tokenId: 't', url: receiverUrl, events: ['*.*'] });
    const worker = new WebhookDelivery({ queue, store, tickIntervalMs: 30 });
    queue.insert({
      id: 'dlv_orphan00000001',
      subscriptionId: sub.id,
      eventType: 'x',
      payload: '{}',
    });
    await store.delete(sub.id);
    worker.start();
    await new Promise((r) => setTimeout(r, 150));
    await worker.stop();
    expect(queue.list({ status: 'dead' })).toHaveLength(1);
    expect(queue.list({ status: 'dead' })[0]?.lastError).toContain('subscription deleted');
  });
});
