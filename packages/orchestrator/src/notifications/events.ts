import { randomBytes } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import type { GatewayEvent } from '@harness-engineering/types';
import { eventMatches } from '../gateway/webhooks/signer.js';
import { wrapAsEnvelope } from './envelope.js';
import type { SinkRegistry } from './registry.js';

/**
 * Topics fanned out to in-process notification sinks. Structurally
 * identical to WEBHOOK_TOPICS in gateway/webhooks/events.ts — same
 * colon→dot normalization, same fire-and-forget semantics — but the two
 * lists are intentionally separate so Phase 5 telemetry topics or future
 * proposal-review topics can be enabled per-fan-out destination.
 */
const NOTIFICATION_TOPICS = [
  'interaction.created',
  'interaction.resolved',
  'maintenance:started',
  'maintenance:completed',
  'maintenance:error',
  // Hermes Phase 4 — skill proposal lifecycle.
  'proposal.created',
  'proposal.approved',
  'proposal.rejected',
] as const;

function newEventId(): string {
  return `evt_${randomBytes(8).toString('hex')}`;
}

interface WireParams {
  bus: EventEmitter;
  registry: SinkRegistry;
}

/**
 * Subscribe each `NOTIFICATION_TOPICS` topic on the bus and dispatch
 * matching events to each sink. Returns an unsubscribe function the
 * orchestrator calls on teardown.
 *
 * Delivery is fire-and-forget. Failures are reported back onto the bus
 * as `notification.delivery.failed` so the operator can observe via the
 * dashboard or webhook fanout. Slow sinks do not block fast sinks (each
 * deliver is started in parallel, not awaited).
 */
function dispatchToEntry(
  bus: EventEmitter,
  entry: ReturnType<SinkRegistry['list']>[number],
  event: GatewayEvent
): void {
  const eventType = event.type;
  const matches = entry.config.events.some((p) => eventMatches(p, eventType));
  if (!matches) return;
  const payload = entry.config.wrap_response ? wrapAsEnvelope(event) : event;
  const summaryBase = {
    sinkId: entry.adapter.id,
    kind: entry.adapter.kind,
    eventType,
    eventId: event.id,
  };
  void entry.adapter
    .deliver({ payload, wrapped: entry.config.wrap_response })
    .then((result) => {
      bus.emit('notification.delivery.attempted', { ...summaryBase, ok: result.ok });
      if (!result.ok) {
        bus.emit('notification.delivery.failed', {
          ...summaryBase,
          ok: false,
          error: result.error,
        });
      }
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      bus.emit('notification.delivery.failed', { ...summaryBase, ok: false, error: msg });
    });
}

export function wireNotificationSinks({ bus, registry }: WireParams): () => void {
  const handlers: Array<{ topic: string; fn: (data: unknown) => void }> = [];

  for (const topic of NOTIFICATION_TOPICS) {
    const eventType = topic.replace(':', '.');
    const fn = (data: unknown): void => {
      const entries = registry.list();
      if (entries.length === 0) return;
      const event: GatewayEvent = {
        id: newEventId(),
        type: eventType,
        timestamp: new Date().toISOString(),
        data,
      };
      for (const entry of entries) {
        dispatchToEntry(bus, entry, event);
      }
    };
    bus.on(topic, fn);
    handlers.push({ topic, fn });
  }

  return (): void => {
    for (const { topic, fn } of handlers) bus.removeListener(topic, fn);
  };
}
