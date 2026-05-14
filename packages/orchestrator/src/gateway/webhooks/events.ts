import { randomBytes } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import type { GatewayEvent } from '@harness-engineering/types';
import type { WebhookStore } from './store';
import type { WebhookDelivery } from './delivery';

/**
 * Event-bus topics the webhook fan-out subscribes to. Each topic maps 1:1
 * to a GatewayEvent.type — subscriptions filter by glob pattern at the
 * store layer. Phase 3 wires: interaction.*, maintenance.*, auth.*,
 * webhook.subscription.*. Phase 5 adds telemetry.*, dispatch.*.
 */
const WEBHOOK_TOPICS = [
  'interaction.created',
  'interaction.resolved',
  'maintenance:started',
  'maintenance:completed',
  'maintenance:error',
  'auth.token.created',
  'auth.token.revoked',
  'webhook.subscription.created',
  'webhook.subscription.deleted',
] as const;

interface WireParams {
  bus: EventEmitter;
  store: WebhookStore;
  delivery: WebhookDelivery;
}

function newEventId(): string {
  return `evt_${randomBytes(8).toString('hex')}`;
}

/**
 * Subscribes to each WEBHOOK_TOPICS topic and fans the payload out to every
 * matching webhook subscription. Returns an unsubscribe function the
 * orchestrator calls on teardown.
 *
 * Topic-to-event-type normalization: orchestrator emits `maintenance:started`
 * (colon-separated, legacy), but webhook subscriptions expect dotted form
 * `maintenance.started`. The normalize step bridges both.
 */
export function wireWebhookFanout({ bus, store, delivery }: WireParams): () => void {
  const handlers: Array<{ topic: string; fn: (data: unknown) => void }> = [];
  for (const topic of WEBHOOK_TOPICS) {
    const eventType = topic.replace(':', '.');
    const fn = (data: unknown): void => {
      void (async () => {
        const subs = await store.listForEvent(eventType);
        if (subs.length === 0) return;
        const event: GatewayEvent = {
          id: newEventId(),
          type: eventType,
          timestamp: new Date().toISOString(),
          data,
        };
        // Fan out without awaiting — slow subscribers do not block others.
        for (const sub of subs) {
          void delivery.deliver(sub, event);
        }
      })();
    };
    bus.on(topic, fn);
    handlers.push({ topic, fn });
  }
  return (): void => {
    for (const { topic, fn } of handlers) bus.removeListener(topic, fn);
  };
}
