import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { GatewayEvent, WebhookSubscription } from '@harness-engineering/types';
import type { TraceSpan } from '@harness-engineering/core';
import { wireTelemetryFanout, ActiveRunRegistry, MAX_ACTIVE_RUNS } from './fanout';

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

/**
 * I2 fixes: the registry must be bounded (no unbounded leak when close events
 * are dropped) and must NOT fall back to "latest open" when correlation/task
 * lookups miss (that mis-correlates orphan events onto unrelated traces).
 */
describe('ActiveRunRegistry (I2)', () => {
  it('caps size at MAX_ACTIVE_RUNS and evicts the OLDEST entry on overflow', () => {
    const reg = new ActiveRunRegistry();
    for (let i = 0; i < MAX_ACTIVE_RUNS + 1; i++) {
      reg.open(`run-${i}`, { traceId: `t-${i}`, spanId: `s-${i}` });
    }
    expect(reg.size).toBe(MAX_ACTIVE_RUNS);
    // The oldest entry (`run-0`) was evicted to make room for entry 256.
    expect(reg.resolve({ taskId: 'run-0' })).toBeUndefined();
    // The most-recently-opened entry is still present.
    expect(reg.resolve({ taskId: `run-${MAX_ACTIVE_RUNS}` })).toEqual({
      traceId: `t-${MAX_ACTIVE_RUNS}`,
      spanId: `s-${MAX_ACTIVE_RUNS}`,
    });
    // run-1 (the new oldest) is still present — only ONE eviction happened.
    expect(reg.resolve({ taskId: 'run-1' })).toBeDefined();
  });

  it('close() removes the entry and decrements size', () => {
    const reg = new ActiveRunRegistry();
    reg.open('run-a', { traceId: 'tA', spanId: 'sA' });
    reg.open('run-b', { traceId: 'tB', spanId: 'sB' });
    expect(reg.size).toBe(2);

    reg.close('run-a');
    expect(reg.size).toBe(1);
    expect(reg.resolve({ taskId: 'run-a' })).toBeUndefined();
    expect(reg.resolve({ taskId: 'run-b' })).toEqual({ traceId: 'tB', spanId: 'sB' });
  });

  it('resolve() returns undefined when neither correlationId nor taskId matches (no latest-key fallback)', () => {
    const reg = new ActiveRunRegistry();
    // Open run A, never close. Open run B (also still in registry).
    reg.open('run-a', { traceId: 'tA', spanId: 'sA' });
    reg.open('run-b', { traceId: 'tB', spanId: 'sB' });

    // A child event whose keys match neither A nor B must return undefined
    // (becomes a root span). With the removed `latestKey` fallback, the
    // result is NOT the most-recently-opened entry.
    const resolved = reg.resolve({ taskId: 'run-c' });
    expect(resolved).toBeUndefined();
    // Specifically: it is not run-b (the latest).
    expect(resolved).not.toEqual({ traceId: 'tB', spanId: 'sB' });
  });
});

/**
 * Integration check: with the latestKey fallback removed, a skill_invocation
 * whose taskId/correlationId does not match any open run must produce a span
 * with no parentSpanId (a root). Previously it would inherit from the most
 * recently opened run — a zombie correlation.
 */
describe('wireTelemetryFanout — orphan child events become roots (I2)', () => {
  it('skill_invocation with unmatched taskId emits a root span (no parentSpanId)', async () => {
    const bus = new EventEmitter();
    const pushedSpans: TraceSpan[] = [];
    const exporter = { push: (s: TraceSpan) => pushedSpans.push(s) };
    const webhookDelivery = { enqueue: vi.fn() };
    const store = makeStore([]);

    const unsub = wireTelemetryFanout({ bus, exporter, webhookDelivery, store });

    // Open a maintenance run, never close it.
    bus.emit('maintenance:started', { taskId: 'parent-run' });
    // Emit a child event whose taskId does NOT match any open run.
    bus.emit('skill_invocation', { skill: 'review', taskId: 'unrelated-run' });
    await new Promise((r) => setImmediate(r));

    expect(pushedSpans).toHaveLength(2);
    const parent = pushedSpans[0]!;
    const orphan = pushedSpans[1]!;

    expect(parent.name).toBe('maintenance_run');
    expect(orphan.name).toBe('skill_invocation');

    // Orphan must be a root span — no parentSpanId, distinct traceId.
    expect(orphan.parentSpanId).toBeUndefined();
    expect(orphan.traceId).not.toBe(parent.traceId);

    unsub();
  });
});
