import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { wireWebhookFanout } from './events';
import { WebhookStore } from './store';
import { WebhookDelivery } from './delivery';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('wireWebhookFanout', () => {
  let dir: string;
  let store: WebhookStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-wh-events-'));
    store = new WebhookStore(join(dir, 'webhooks.json'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('fans matching events to subscriptions; ignores non-matching', async () => {
    const bus = new EventEmitter();
    const delivery = new WebhookDelivery();
    const spy = vi.spyOn(delivery, 'deliver').mockResolvedValue();
    await store.create({ tokenId: 't', url: 'https://a.test/h', events: ['interaction.*'] });
    wireWebhookFanout({ bus, store, delivery });
    bus.emit('interaction.created', { id: 'int_1' });
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0];
    expect(call?.[1].type).toBe('interaction.created');
    bus.emit('maintenance.completed', { id: 'm_1' }); // no matching sub
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns an unsubscribe function that removes all listeners', () => {
    const bus = new EventEmitter();
    const delivery = new WebhookDelivery();
    const off = wireWebhookFanout({ bus, store, delivery });
    const before = bus.eventNames().length;
    off();
    expect(bus.eventNames().length).toBe(0);
    expect(before).toBeGreaterThan(0);
  });
});
