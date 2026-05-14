import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isPrivateHost } from '../../utils/url-guard.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleV1WebhooksRoute } from './webhooks.js';
import { WebhookStore } from '../../../gateway/webhooks/store.js';
import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

// --- Unit tests for isPrivateHost ---

describe('isPrivateHost', () => {
  it('returns true for 127.0.0.1', () => {
    expect(isPrivateHost('127.0.0.1')).toBe(true);
  });

  it('returns true for localhost', () => {
    expect(isPrivateHost('localhost')).toBe(true);
  });

  it('returns true for 169.254.169.254 (link-local / AWS metadata)', () => {
    expect(isPrivateHost('169.254.169.254')).toBe(true);
  });

  it('returns true for 10.0.0.1 (RFC-1918)', () => {
    expect(isPrivateHost('10.0.0.1')).toBe(true);
  });

  it('returns true for 192.168.1.1 (RFC-1918)', () => {
    expect(isPrivateHost('192.168.1.1')).toBe(true);
  });

  it('returns true for 172.16.0.1 (RFC-1918)', () => {
    expect(isPrivateHost('172.16.0.1')).toBe(true);
  });

  it('returns true for 172.31.255.255 (RFC-1918 upper)', () => {
    expect(isPrivateHost('172.31.255.255')).toBe(true);
  });

  it('returns false for 172.15.0.1 (not RFC-1918)', () => {
    expect(isPrivateHost('172.15.0.1')).toBe(false);
  });

  it('returns false for example.com', () => {
    expect(isPrivateHost('example.com')).toBe(false);
  });

  it('returns false for hooks.example.com', () => {
    expect(isPrivateHost('hooks.example.com')).toBe(false);
  });
});

// --- Integration-style test: route handler rejects private URLs with 422 ---

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

describe('handleV1WebhooksRoute — SSRF guard', () => {
  let dir: string;
  let store: WebhookStore;
  let bus: EventEmitter;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-wh-urlguard-'));
    store = new WebhookStore(join(dir, 'webhooks.json'));
    bus = new EventEmitter();
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('POST rejects https://127.0.0.1/hook with 422', async () => {
    const req = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://127.0.0.1/hook',
      events: ['*'],
    });
    const { res, chunks, statusCode } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(422);
    expect(chunks.join('')).toContain('private or loopback');
  });

  it('POST rejects https://localhost/hook with 422', async () => {
    const req = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://localhost/hook',
      events: ['*'],
    });
    const { res, chunks, statusCode } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(422);
    expect(chunks.join('')).toContain('private or loopback');
  });

  it('POST accepts https://example.com/hook', async () => {
    const req = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://example.com/hook',
      events: ['*.*'],
    });
    const { res, statusCode } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(200);
  });
});
