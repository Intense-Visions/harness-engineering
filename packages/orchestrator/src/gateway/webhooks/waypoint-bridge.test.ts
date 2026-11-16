import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitSdlc, resetWaypointEmitterForTests } from '@harness-engineering/core';
import { wireWaypointSdlcBridge } from './waypoint-bridge';
import { wireWebhookFanout } from './events';
import { WebhookStore } from './store';
import { WebhookDelivery } from './delivery';
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

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-waypoint-bridge-'));
  resetWaypointEmitterForTests();
});

afterEach(() => {
  resetWaypointEmitterForTests();
  rmSync(dir, { recursive: true, force: true });
});

function configureSink(): void {
  writeFileSync(
    join(dir, 'harness.config.json'),
    JSON.stringify({ waypoint: { sink: { transport: 'spool' } } }),
    'utf8'
  );
}

describe('wireWaypointSdlcBridge', () => {
  it('is a no-op without a configured sink (non-adopter invariance)', () => {
    const bus = new EventEmitter();
    const off = wireWaypointSdlcBridge({ bus, projectRoot: dir });
    expect(bus.eventNames()).toEqual([]);
    emitSdlc({ type: 'sdlc.claim.opened.v1', subject: 'item/x' });
    expect(existsSync(join(dir, '.harness'))).toBe(false);
    off(); // teardown of the no-op bridge is safe
  });

  it('republishes spooled sdlc.* events onto the bus under their own type', () => {
    configureSink();
    const bus = new EventEmitter();
    const seen: Array<{ topic: string; subject: string }> = [];
    bus.on('sdlc.claim.opened.v1', (event: { subject: string }) =>
      seen.push({ topic: 'sdlc.claim.opened.v1', subject: event.subject })
    );
    const off = wireWaypointSdlcBridge({ bus, projectRoot: dir });
    const id = emitSdlc({ type: 'sdlc.claim.opened.v1', subject: 'item/x' });
    expect(id).not.toBeNull();
    expect(seen).toEqual([{ topic: 'sdlc.claim.opened.v1', subject: 'item/x' }]);
    off();
    emitSdlc({ type: 'sdlc.claim.opened.v1', subject: 'item/y' });
    expect(seen).toHaveLength(1);
  });
});

describe('sdlc.* topics on the webhook fan-out', () => {
  let store: WebhookStore;
  let queue: WebhookQueue;

  beforeEach(() => {
    store = new WebhookStore(join(dir, 'webhooks.json'));
    queue = new WebhookQueue(':memory:');
  });

  afterEach(() => {
    queue.close();
  });

  it('delivers bridged sdlc events to matching subscriptions with the GatewayEvent envelope', async () => {
    configureSink();
    const bus = new EventEmitter();
    const delivery = new WebhookDelivery({ queue, store });
    const spy = vi.spyOn(delivery, 'enqueue').mockImplementation(() => {});
    const fanout = trackFanout(store);
    await store.create({ tokenId: 't', url: 'https://a.test/h', events: ['sdlc.*.*.*'] });
    wireWebhookFanout({ bus, store, delivery });
    wireWaypointSdlcBridge({ bus, projectRoot: dir });

    emitSdlc({ type: 'sdlc.build.finished.v1', subject: 'phase/execute' });
    await fanout.settled();
    expect(spy).toHaveBeenCalledTimes(1);
    const event = spy.mock.calls[0]?.[1];
    expect(event?.type).toBe('sdlc.build.finished.v1');
    expect(event?.id).toMatch(/^evt_[a-f0-9]+$/);
    expect((event?.data as { subject?: string }).subject).toBe('phase/execute');
  });

  it('exact-type sdlc subscriptions match; unrelated topics are untouched', async () => {
    configureSink();
    const bus = new EventEmitter();
    const delivery = new WebhookDelivery({ queue, store });
    const spy = vi.spyOn(delivery, 'enqueue').mockImplementation(() => {});
    const fanout = trackFanout(store);
    await store.create({ tokenId: 't', url: 'https://a.test/h', events: ['sdlc.claim.opened.v1'] });
    wireWebhookFanout({ bus, store, delivery });
    wireWaypointSdlcBridge({ bus, projectRoot: dir });

    emitSdlc({ type: 'sdlc.claim.opened.v1', subject: 'item/x' });
    emitSdlc({ type: 'sdlc.claim.released.v1', subject: 'item/x' });
    bus.emit('interaction.created', { id: 'int_1' });
    await fanout.settled();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1].type).toBe('sdlc.claim.opened.v1');
  });
});
