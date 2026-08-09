import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isPrivateHost,
  isPrivateAddress,
  guardOutboundHost,
  type HostLookup,
} from '../../utils/url-guard.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleV1WebhooksRoute } from './webhooks.js';
import { WebhookStore } from '../../../gateway/webhooks/store.js';
import { EventEmitter } from 'node:events';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

/**
 * The route-level guard now RESOLVES the hostname, so the route tests below
 * would otherwise depend on live DNS. Stub `node:dns/promises` with an
 * in-memory table so every route case (including the pre-existing
 * "accepts https://example.com/hook") is deterministic and offline.
 * The `isPrivateHost` / `isPrivateAddress` / `guardOutboundHost` unit tests
 * below never reach this stub — they are pure, or inject their own lookup.
 */
const dnsStub = vi.hoisted(() => ({ table: new Map<string, string[]>() }));
vi.mock('node:dns/promises', () => ({
  lookup: async (hostname: string) => {
    const addresses = dnsStub.table.get(hostname);
    if (!addresses) {
      throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    }
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  },
}));

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

// --- Unit tests for isPrivateAddress (resolved-address classification) ---

describe('isPrivateAddress', () => {
  const blocked = [
    ['127.0.0.1', 'IPv4 loopback'],
    ['127.255.255.254', 'IPv4 loopback, upper /8'],
    ['10.0.0.1', 'RFC-1918 10/8'],
    ['172.16.0.1', 'RFC-1918 172.16/12 lower'],
    ['172.31.255.255', 'RFC-1918 172.16/12 upper'],
    ['192.168.1.1', 'RFC-1918 192.168/16'],
    ['169.254.169.254', 'link-local / cloud instance metadata'],
    ['0.0.0.0', 'unspecified'],
    ['0.1.2.3', '0.0.0.0/8 "this network"'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fd00::1', 'IPv6 unique-local fd'],
    ['fc00::1', 'IPv6 unique-local fc'],
    ['fe80::1', 'IPv6 link-local'],
    ['febf::1', 'IPv6 link-local, upper /10'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped link-local'],
    ['100.64.0.1', 'RFC-6598 CGNAT lower'],
    ['100.100.100.200', 'RFC-6598 CGNAT — Alibaba Cloud metadata'],
    ['100.127.255.255', 'RFC-6598 CGNAT upper'],
    ['192.0.0.192', 'RFC-6890 protocol assignments — Oracle Cloud legacy metadata'],
    ['198.18.0.1', 'RFC-2544 benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['240.0.0.1', 'reserved 240/4'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback in hex spelling'],
    ['::ffff:a9fe:a9fe', 'IPv4-mapped link-local in hex spelling'],
    ['::ffff:0:127.0.0.1', 'RFC-2765 IPv4-translated loopback'],
    ['::7f00:1', 'deprecated IPv4-compatible loopback'],
    ['64:ff9b::a9fe:a9fe', 'NAT64-embedded link-local metadata address'],
    ['64:ff9b::7f00:1', 'NAT64-embedded loopback'],
    ['2002:7f00:1::', '6to4-embedded loopback'],
    ['ff02::1', 'IPv6 link-local all-nodes multicast'],
    ['[::1]', 'bracketed IPv6 loopback, as URL.hostname yields it'],
    ['FE80::1', 'uppercase IPv6 link-local'],
    ['fe80::1%en0', 'IPv6 link-local with a zone id'],
  ] as const;

  for (const [ip, why] of blocked) {
    it(`returns true for ${ip} (${why})`, () => {
      expect(isPrivateAddress(ip)).toBe(true);
    });
  }

  const allowed = [
    ['8.8.8.8', 'public IPv4'],
    ['172.15.0.1', 'below RFC-1918 172.16/12'],
    ['172.32.0.1', 'above RFC-1918 172.16/12'],
    ['169.253.0.1', 'adjacent to link-local but public'],
    ['192.167.1.1', 'adjacent to RFC-1918 but public'],
    ['2606:4700::1111', 'public IPv6'],
    ['fec0::1', 'above fe80::/10 (deprecated site-local, not link-local)'],
    ['fc0::1', 'leading hextet 0x0fc0 — outside fc00::/7 despite the prefix'],
    ['::ffff:8.8.8.8', 'IPv4-mapped public'],
    ['100.63.255.255', 'just below RFC-6598 CGNAT'],
    ['100.128.0.1', 'just above RFC-6598 CGNAT'],
    ['192.0.1.1', 'just above the RFC-6890 protocol-assignments /24'],
    ['198.20.0.1', 'just above the benchmarking block'],
    ['223.255.255.255', 'just below multicast'],
    ['[2606:4700:4700::1111]', 'bracketed public IPv6'],
    ['64:ff9b::8.8.8.8', 'NAT64-embedded public address'],
  ] as const;

  for (const [ip, why] of allowed) {
    it(`returns false for ${ip} (${why})`, () => {
      expect(isPrivateAddress(ip)).toBe(false);
    });
  }
});

// --- Unit tests for guardOutboundHost (resolve-then-check) ---

function stubLookup(map: Record<string, string[]>): HostLookup & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (hostname: string) => {
    calls.push(hostname);
    const addresses = map[hostname];
    if (!addresses) throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  }) as HostLookup & { calls: string[] };
  fn.calls = calls;
  return fn;
}

describe('guardOutboundHost', () => {
  it('blocks a public hostname that resolves to the cloud metadata address', async () => {
    const lookup = stubLookup({ 'hooks.attacker.example': ['169.254.169.254'] });
    const verdict = await guardOutboundHost('hooks.attacker.example', { lookup });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('private-address');
    expect(verdict.detail).toBe('169.254.169.254');
  });

  it('blocks a public hostname that resolves to loopback', async () => {
    const lookup = stubLookup({ 'localtest.example': ['127.0.0.1'] });
    const verdict = await guardOutboundHost('localtest.example', { lookup });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('private-address');
  });

  it('blocks when ANY resolved address is private, even if others are public', async () => {
    const lookup = stubLookup({ 'split.example': ['93.184.216.34', '10.1.2.3'] });
    const verdict = await guardOutboundHost('split.example', { lookup });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('private-address');
    expect(verdict.detail).toBe('10.1.2.3');
  });

  it('blocks a hostname resolving to an IPv6 unique-local address', async () => {
    const lookup = stubLookup({ 'ula.example': ['fd12:3456::1'] });
    const verdict = await guardOutboundHost('ula.example', { lookup });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('private-address');
  });

  it('blocks a literal private host WITHOUT performing a lookup', async () => {
    const lookup = stubLookup({});
    const verdict = await guardOutboundHost('127.0.0.1', { lookup });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('private-literal');
    expect(lookup.calls).toHaveLength(0);
  });

  it('blocks localhost via the literal pre-filter WITHOUT performing a lookup', async () => {
    const lookup = stubLookup({});
    const verdict = await guardOutboundHost('localhost', { lookup });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('private-literal');
    expect(lookup.calls).toHaveLength(0);
  });

  it('allows a hostname that resolves only to public addresses', async () => {
    const lookup = stubLookup({ 'hooks.example.com': ['93.184.216.34', '2606:4700::1111'] });
    const verdict = await guardOutboundHost('hooks.example.com', { lookup });
    expect(verdict.blocked).toBe(false);
    expect(verdict.reason).toBeUndefined();
    expect(lookup.calls).toEqual(['hooks.example.com']);
  });

  it('fails closed when resolution rejects', async () => {
    const lookup = stubLookup({});
    const verdict = await guardOutboundHost('nxdomain.example', { lookup });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('dns-failure');
  });

  it('fails closed when resolution returns an empty address list', async () => {
    const lookup = (async () => []) as HostLookup;
    const verdict = await guardOutboundHost('empty.example', { lookup });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('dns-failure');
  });

  it('blocks a bracketed IPv6 loopback literal WITHOUT a lookup', async () => {
    // `new URL('https://[::1]/').hostname` is '[::1]'. The bracketed form
    // slipped past the old string-only guard entirely.
    const lookup = stubLookup({});
    const verdict = await guardOutboundHost('[::1]', { lookup });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('private-literal');
    expect(lookup.calls).toHaveLength(0);
  });

  it('allows a bracketed public IPv6 literal WITHOUT a lookup', async () => {
    const lookup = stubLookup({});
    const verdict = await guardOutboundHost('[2606:4700:4700::1111]', { lookup });
    expect(verdict.blocked).toBe(false);
    expect(lookup.calls).toHaveLength(0);
  });

  it('allows a public IPv4 literal WITHOUT a lookup', async () => {
    const lookup = stubLookup({});
    const verdict = await guardOutboundHost('93.184.216.34', { lookup });
    expect(verdict.blocked).toBe(false);
    expect(lookup.calls).toHaveLength(0);
  });

  it('blocks a CGNAT IPv4 literal that the string pre-filter does not know', async () => {
    const lookup = stubLookup({});
    expect(isPrivateHost('100.100.100.200')).toBe(false); // pre-filter misses it
    const verdict = await guardOutboundHost('100.100.100.200', { lookup });
    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe('private-literal');
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
    dnsStub.table.clear();
    // A legitimate, publicly-resolving receiver.
    dnsStub.table.set('example.com', ['93.184.216.34']);
    // A public hostname whose A record points at the cloud metadata service.
    dnsStub.table.set('hooks.attacker.example', ['169.254.169.254']);
    // A public hostname whose A record points at loopback.
    dnsStub.table.set('localtest.example', ['127.0.0.1']);
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

  // --- Regression: the guard must resolve, not just pattern-match ---

  it('POST rejects a public hostname whose DNS points at the metadata address', async () => {
    const req = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://hooks.attacker.example/hook',
      events: ['*.*'],
    });
    const { res, chunks, statusCode } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(422);
    expect(chunks.join('')).toContain('private or loopback');
    expect(await store.list()).toHaveLength(0);
  });

  it('POST rejects a public hostname whose DNS points at loopback', async () => {
    const req = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://localtest.example/hook',
      events: ['*.*'],
    });
    const { res, statusCode } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(422);
    expect(await store.list()).toHaveLength(0);
  });

  it('POST rejects a hostname that does not resolve (fails closed)', async () => {
    const req = makeReq('POST', '/api/v1/webhooks', {
      url: 'https://nxdomain.example/hook',
      events: ['*.*'],
    });
    const { res, statusCode } = makeRes();
    handleV1WebhooksRoute(req, res, { store, bus });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCode()).toBe(422);
  });
});
