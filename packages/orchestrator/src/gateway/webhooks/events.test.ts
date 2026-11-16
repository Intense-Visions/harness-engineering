import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { wireWebhookFanout } from './events';
import { WebhookStore } from './store';
import { WebhookDelivery } from './delivery';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebhookQueue } from './queue';

/**
 * `wireWebhookFanout` handles each bus emit on a detached async chain: it
 * awaits `store.listForEvent()` (a file read) and only then calls
 * `delivery.enqueue`. `trackFanout()` records every lookup the fan-out starts,
 * and `settled()` resolves once all of them -- and the enqueue loop that
 * follows each -- have run.
 *
 * These cases used to sleep a fixed 10ms instead, which is a guess about how
 * long a file read takes. On a loaded runner the read outlived the sleep and
 * the spy had not been called yet (#2227). Awaiting the lookups themselves has
 * no budget to lose, and it also makes the "not called" assertions meaningful:
 * they now run after the non-matching emit's lookup has demonstrably finished,
 * rather than after an arbitrary pause.
 */
function trackFanout(store: WebhookStore): { settled: () => Promise<void> } {
  const pending: Promise<unknown>[] = [];
  const original = store.listForEvent.bind(store);
  vi.spyOn(store, 'listForEvent').mockImplementation((eventType: string) => {
    const lookup = original(eventType);
    pending.push(lookup);
    return lookup;
  });
  return {
    settled: async () => {
      await Promise.allSettled(pending);
      // The enqueue loop runs in the continuation after each lookup resolves;
      // one macrotask turn guarantees every continuation has run.
      await new Promise((r) => setImmediate(r));
    },
  };
}

describe('wireWebhookFanout', () => {
  let dir: string;
  let store: WebhookStore;
  let queue: WebhookQueue;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-wh-events-'));
    store = new WebhookStore(join(dir, 'webhooks.json'));
    queue = new WebhookQueue(':memory:');
  });
  afterEach(() => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('fans matching events to subscriptions; ignores non-matching', async () => {
    const bus = new EventEmitter();
    const delivery = new WebhookDelivery({ queue, store });
    const spy = vi.spyOn(delivery, 'enqueue').mockImplementation(() => {});
    const fanout = trackFanout(store);
    await store.create({ tokenId: 't', url: 'https://a.test/h', events: ['interaction.*'] });
    wireWebhookFanout({ bus, store, delivery });
    bus.emit('interaction.created', { id: 'int_1' });
    await fanout.settled();
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0];
    expect(call?.[1].type).toBe('interaction.created');
    bus.emit('maintenance.completed', { id: 'm_1' });
    await fanout.settled();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns an unsubscribe function that removes all listeners', () => {
    const bus = new EventEmitter();
    const delivery = new WebhookDelivery({ queue, store });
    const off = wireWebhookFanout({ bus, store, delivery });
    const before = bus.eventNames().length;
    off();
    expect(bus.eventNames().length).toBe(0);
    expect(before).toBeGreaterThan(0);
  });
});
