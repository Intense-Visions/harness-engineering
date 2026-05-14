import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebhookDelivery } from './delivery';
import type { WebhookSubscription } from '@harness-engineering/types';

function makeSub(url: string, events = ['*.*']): WebhookSubscription {
  return {
    id: 'whk_0000000000000001',
    tokenId: 'tok_a',
    url,
    events,
    secret: 'super-secret-key',
    createdAt: new Date().toISOString(),
  };
}

describe('WebhookDelivery', () => {
  let receiver: http.Server;
  let received: Array<{ headers: http.IncomingHttpHeaders; body: string }>;
  let url: string;
  beforeEach(async () => {
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
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', () => resolve()));
    const port = (receiver.address() as AddressInfo).port;
    url = `http://127.0.0.1:${port}/hook`; // http OK for the receiver — https-only is at registration
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  });

  it('POSTs with X-Harness-* headers and a valid HMAC signature', async () => {
    const delivery = new WebhookDelivery();
    await delivery.deliver(makeSub(url), {
      id: 'evt_test_001',
      type: 'maintenance.completed',
      timestamp: '2026-05-14T12:00:00.000Z',
      data: { foo: 'bar' },
    });
    // wait one tick for the in-flight POST to land on the receiver
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(1);
    expect(received[0]?.headers['x-harness-delivery-id']).toBeDefined();
    expect(received[0]?.headers['x-harness-event-type']).toBe('maintenance.completed');
    expect(received[0]?.headers['x-harness-timestamp']).toBeDefined();
    expect(received[0]?.headers['x-harness-signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('drops the delivery silently after 3s timeout (no throw)', async () => {
    const slowReceiver = http.createServer((_req, _res) => {
      // never respond
    });
    await new Promise<void>((r) => slowReceiver.listen(0, '127.0.0.1', () => r()));
    const slowUrl = `http://127.0.0.1:${(slowReceiver.address() as AddressInfo).port}/`;
    const delivery = new WebhookDelivery({ timeoutMs: 200 }); // tight timeout for the test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await delivery.deliver(makeSub(slowUrl), {
      id: 'evt_test_002',
      type: 'maintenance.completed',
      timestamp: '2026-05-14T12:00:00.000Z',
      data: {},
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    await new Promise<void>((r) => slowReceiver.close(() => r()));
  });

  it('drops the delivery on 5xx (no requeue)', async () => {
    const errorReceiver = http.createServer((_req, res) => {
      res.writeHead(500);
      res.end();
    });
    await new Promise<void>((r) => errorReceiver.listen(0, '127.0.0.1', () => r()));
    const errUrl = `http://127.0.0.1:${(errorReceiver.address() as AddressInfo).port}/`;
    const delivery = new WebhookDelivery();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await delivery.deliver(makeSub(errUrl), {
      id: 'evt_test_003',
      type: 'maintenance.completed',
      timestamp: '2026-05-14T12:00:00.000Z',
      data: {},
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    await new Promise<void>((r) => errorReceiver.close(() => r()));
  });
});
