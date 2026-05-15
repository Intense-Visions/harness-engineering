import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { GatewayEvent, WebhookSubscription } from '@harness-engineering/types';
import type { TraceSpan } from '@harness-engineering/core';
import { wireTelemetryFanout } from './fanout';

/** Build a minimally valid WebhookSubscription stub for the in-memory store. */
function makeSub(id: string, events: string[]): WebhookSubscription {
  return {
    id: `whk_${id.padEnd(16, '0').slice(0, 16)}`,
    tokenId: 'tok_test',
    url: 'https://example.test/hook',
    events,
    secret: 'a'.repeat(44),
    createdAt: new Date().toISOString(),
  };
}

/** Mock store backed by an in-memory array — emulates listForEvent's contract. */
function makeStore(subs: WebhookSubscription[]): {
  listForEvent: (eventType: string) => Promise<WebhookSubscription[]>;
} {
  return {
    listForEvent: async (eventType: string) => {
      // Mirror the production filter so tests honor the Task 9 telemetry guard.
      const { eventMatches } = await import('../webhooks/signer');
      return subs.filter((s) => s.events.some((p) => eventMatches(p, eventType)));
    },
  };
}

describe('wireTelemetryFanout (Phase 5 Task 10)', () => {
  it('emits one OTel span AND one webhook enqueue for a sub on telemetry.*', async () => {
    const bus = new EventEmitter();
    const pushedSpans: TraceSpan[] = [];
    const exporter = { push: (s: TraceSpan) => pushedSpans.push(s) };
    const enqueued: Array<{ sub: WebhookSubscription; event: GatewayEvent }> = [];
    const webhookDelivery = {
      enqueue: (sub: WebhookSubscription, event: GatewayEvent) => enqueued.push({ sub, event }),
    };
    const sub = makeSub('telemetry', ['telemetry.*']);
    const store = makeStore([sub]);

    const unsub = wireTelemetryFanout({ bus, exporter, webhookDelivery, store });

    bus.emit('maintenance:started', { taskId: 'task-1', startedAt: 'now' });
    // The fanout dispatches the webhook enqueue via void Promise — flush microtasks.
    await new Promise((r) => setImmediate(r));

    expect(pushedSpans).toHaveLength(1);
    expect(pushedSpans[0]?.name).toBe('maintenance_run');
    expect(pushedSpans[0]?.traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(pushedSpans[0]?.spanId).toMatch(/^[a-f0-9]{16}$/);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]?.event.type).toBe('telemetry.maintenance_run');
    expect(enqueued[0]?.sub.id).toBe(sub.id);

    unsub();
  });

  it('a sub on *.* does NOT receive telemetry.* events (uses Task 9 exclusion)', async () => {
    const bus = new EventEmitter();
    const exporter = { push: vi.fn() };
    const webhookDelivery = { enqueue: vi.fn() };
    const subWildcard = makeSub('wildcard', ['*.*']);
    const store = makeStore([subWildcard]);

    const unsub = wireTelemetryFanout({ bus, exporter, webhookDelivery, store });

    bus.emit('maintenance:started', { taskId: 'task-2', startedAt: 'now' });
    await new Promise((r) => setImmediate(r));

    // Exporter push still happens — telemetry is always emitted; only the
    // webhook fanout filter rejects the *.* sub.
    expect(exporter.push).toHaveBeenCalledTimes(1);
    expect(webhookDelivery.enqueue).not.toHaveBeenCalled();

    unsub();
  });

  it('skill_invocation after maintenance:started inherits traceId + sets parentSpanId', async () => {
    const bus = new EventEmitter();
    const pushedSpans: TraceSpan[] = [];
    const exporter = { push: (s: TraceSpan) => pushedSpans.push(s) };
    const webhookDelivery = { enqueue: vi.fn() };
    const store = makeStore([]);

    const unsub = wireTelemetryFanout({ bus, exporter, webhookDelivery, store });

    bus.emit('maintenance:started', { taskId: 'run-a' });
    bus.emit('skill_invocation', { skill: 'review', taskId: 'run-a', turns: 3 });
    await new Promise((r) => setImmediate(r));

    expect(pushedSpans).toHaveLength(2);
    const parent = pushedSpans[0]!;
    const child = pushedSpans[1]!;
    expect(parent.name).toBe('maintenance_run');
    expect(child.name).toBe('skill_invocation');
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
    // Sanity: child has its own distinct spanId.
    expect(child.spanId).not.toBe(parent.spanId);
    // Attributes carry through scalar payload fields.
    expect(child.attributes['skill']).toBe('review');
    expect(child.attributes['turns']).toBe(3);

    unsub();
  });

  it('unsubscribe removes bus listeners so subsequent events are no-ops', async () => {
    const bus = new EventEmitter();
    const exporter = { push: vi.fn() };
    const webhookDelivery = { enqueue: vi.fn() };
    const store = makeStore([makeSub('t', ['telemetry.*'])]);

    const unsub = wireTelemetryFanout({ bus, exporter, webhookDelivery, store });
    // Each topic adds one listener.
    expect(bus.listenerCount('maintenance:started')).toBe(1);
    expect(bus.listenerCount('skill_invocation')).toBe(1);
    expect(bus.listenerCount('dispatch:decision')).toBe(1);

    unsub();

    expect(bus.listenerCount('maintenance:started')).toBe(0);
    expect(bus.listenerCount('skill_invocation')).toBe(0);
    expect(bus.listenerCount('dispatch:decision')).toBe(0);

    // After unsubscribe, no fan-out happens.
    bus.emit('maintenance:started', { taskId: 'orphan' });
    await new Promise((r) => setImmediate(r));
    expect(exporter.push).not.toHaveBeenCalled();
    expect(webhookDelivery.enqueue).not.toHaveBeenCalled();
  });
});
