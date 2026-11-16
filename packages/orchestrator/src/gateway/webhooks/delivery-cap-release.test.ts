import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebhookDelivery } from './delivery';
import { WebhookQueue } from './queue';
import { WebhookStore } from './store';

/**
 * Regression for #2553: tick() used to claim (mark in_flight) every due row
 * and then skip the ones whose subscription was already at
 * maxConcurrentPerSub WITHOUT releasing them. Those rows were owned by no
 * executeDelivery and stayed in_flight until the next process start's
 * recoverInFlight(), so deliveries over the cap never went out in-process.
 */

function makeEvent(n: number) {
  return {
    id: `evt_${String(n).padStart(16, '0')}`,
    type: 'maintenance.completed',
    timestamp: new Date().toISOString(),
    data: { n },
  };
}

/** A fetch whose responses are held until the test releases them. */
function gatedFetch() {
  const pending: Array<() => void> = [];
  const calls: string[] = [];
  let open = false;
  const impl = ((_url: string, init?: RequestInit) => {
    calls.push(String((init?.headers as Record<string, string>)['X-Harness-Delivery-Id']));
    const respond = () => new Response('{}', { status: 200 });
    if (open) return Promise.resolve(respond());
    return new Promise<Response>((resolve) => pending.push(() => resolve(respond())));
  }) as typeof fetch;
  return {
    impl,
    calls,
    /** Number of POSTs started whose response has not been released yet. */
    outstanding: () => pending.length,
    releaseAll: () => {
      open = true;
      for (const r of pending.splice(0)) r();
    },
  };
}

describe('WebhookDelivery concurrency cap never strands claimed rows (#2553)', () => {
  let dir: string;
  let store: WebhookStore;
  let queue: WebhookQueue;
  let worker: WebhookDelivery | null = null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-dlv-cap-'));
    store = new WebhookStore(join(dir, 'webhooks.json'));
    queue = new WebhookQueue(':memory:');
  });

  afterEach(async () => {
    if (worker) await worker.stop();
    worker = null;
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('cap=1, 3 rows for one sub: the over-cap rows are delivered in-process, no restart', async () => {
    const sub = await store.create({
      tokenId: 't',
      url: 'https://hooks.example.test/hook',
      events: ['*.*'],
    });
    const fetcher = gatedFetch();
    worker = new WebhookDelivery({
      queue,
      store,
      fetchImpl: fetcher.impl,
      tickIntervalMs: 10,
      maxConcurrentPerSub: 1,
      drainTimeoutMs: 500,
      allowPrivateHosts: true,
    });
    for (let i = 0; i < 3; i++) worker.enqueue(sub, makeEvent(i));
    worker.start();

    // The first delivery is executing and held open by the gated fetch.
    await vi.waitFor(() => expect(fetcher.calls).toHaveLength(1), { timeout: 2_000 });
    // Let several more ticks run while the sub is at its cap.
    await new Promise((r) => setTimeout(r, 80));

    // Invariant: every in_flight row is owned by an executing delivery.
    expect(queue.stats().inFlight).toBe(fetcher.outstanding());
    expect(queue.stats().inFlight).toBe(1);
    expect(fetcher.calls).toHaveLength(1);

    fetcher.releaseAll();

    await vi.waitFor(() => expect(queue.stats().delivered).toBe(3), { timeout: 2_000 });
    expect(queue.stats()).toMatchObject({ pending: 0, inFlight: 0, failed: 0, dead: 0 });
    // Each row POSTed exactly once — no double delivery.
    expect(new Set(fetcher.calls).size).toBe(3);
    expect(fetcher.calls).toHaveLength(3);
  });

  it('a saturated sub does not starve another sub of claim slots', async () => {
    const busy = await store.create({
      tokenId: 't',
      url: 'https://busy.example.test/hook',
      events: ['*.*'],
    });
    const quiet = await store.create({
      tokenId: 't',
      url: 'https://quiet.example.test/hook',
      events: ['*.*'],
    });
    const fetcher = gatedFetch();
    worker = new WebhookDelivery({
      queue,
      store,
      fetchImpl: fetcher.impl,
      tickIntervalMs: 10,
      maxConcurrentPerSub: 1,
      drainTimeoutMs: 500,
      allowPrivateHosts: true,
    });
    // More busy rows than one claim batch (20), all due before the quiet row.
    for (let i = 0; i < 30; i++) worker.enqueue(busy, makeEvent(i));
    worker.enqueue(quiet, makeEvent(99));
    worker.start();

    // One slot per sub: both subs get exactly one executing delivery.
    await vi.waitFor(() => expect(fetcher.calls).toHaveLength(2), { timeout: 2_000 });
    await new Promise((r) => setTimeout(r, 80));
    expect(queue.stats().inFlight).toBe(fetcher.outstanding());
    expect(queue.list({ subscriptionId: quiet.id, status: 'in_flight' })).toHaveLength(1);

    fetcher.releaseAll();
    await vi.waitFor(() => expect(queue.stats().delivered).toBe(31), { timeout: 5_000 });
    expect(new Set(fetcher.calls).size).toBe(31);
    expect(fetcher.calls).toHaveLength(31);
  });
});

describe('WebhookQueue.claim with a per-subscription capacity (#2553)', () => {
  it('leases at most the available slots per sub and leaves the rest claimable', () => {
    const q = new WebhookQueue(':memory:');
    try {
      for (let i = 0; i < 3; i++) {
        q.insert({ id: `a${i}`, subscriptionId: 'sa', eventType: 'e', payload: '{}' });
      }
      q.insert({ id: 'b0', subscriptionId: 'sb', eventType: 'e', payload: '{}' });
      const now = Date.now() + 1_000;

      const first = q.claim(now, 20, {
        maxPerSub: 2,
        available: (s) => (s === 'sa' ? 1 : 0),
      });
      expect(first.map((r) => r.id)).toEqual(['a0']);
      expect(q.stats()).toMatchObject({ inFlight: 1, pending: 3 });

      const second = q.claim(now, 20, { maxPerSub: 2, available: () => 2 });
      expect(second.map((r) => r.id).sort()).toEqual(['a1', 'a2', 'b0']);
      // Attempt counter is untouched by being passed over.
      expect(second.every((r) => r.attempt === 0)).toBe(true);
    } finally {
      q.close();
    }
  });
});
