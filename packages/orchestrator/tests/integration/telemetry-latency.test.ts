import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { OTLPExporter } from '@harness-engineering/core';
import { wireTelemetryFanout } from '../../src/gateway/telemetry/fanout';

/**
 * Phase 5 Task 14 — Exporter overhead budget (p99 < 5 ms at dispatch).
 *
 * Spec acceptance criterion 2: with the exporter enabled, the added latency
 * at the `bus.emit('dispatch:decision', ...)` hot path must stay under 5 ms
 * at p99 compared to a no-exporter baseline.
 *
 * What is measured: 200 mock dispatches against an unreachable endpoint
 * (`http://127.0.0.1:1/v1/traces` — port 1 is reserved and always refuses
 * TCP) with batchSize=16. Flushes fire ~12 times during the measured window,
 * exercising the producer-side cost of the void-flush hand-off including
 * retry scheduling. p99 added latency budget is 5 ms; the current
 * implementation is well under that.
 *
 * Why batchSize=16 < ITERATIONS=200: an earlier draft used batchSize=1024
 * which meant no flush ever fired inside the measured window — that test
 * only measured the cost of appending to an in-memory buffer, not the
 * producer-side cost we care about (the void-flush hand-off + scheduling
 * the retry timer on a failed dispatch). With batchSize=16, every 16th
 * emit triggers a flush that hands off to fetch() and schedules a retry
 * when the connection refuses, so the budget covers the realistic hot path.
 *
 * Notes:
 *   - The test uses a generous threshold of 5 ms; on bare metal this
 *     typically lands in single-digit-microsecond territory, but CI
 *     containers can vary by an order of magnitude. The acceptance
 *     criterion is "evidence, not regression" — flakes mean we widen the
 *     budget and document, not gate the phase.
 *   - We do NOT call `exporter.stop()` between the baseline and enabled
 *     runs because we want the enabled-run's timer to be live; the baseline
 *     uses a separate fanout with `enabled: false`.
 */

const ITERATIONS = 200;
const P99_BUDGET_MS = 5;
const UNREACHABLE_ENDPOINT = 'http://127.0.0.1:1/v1/traces';

interface MockWebhookDelivery {
  enqueue: () => void;
}

interface MockStore {
  listForEvent: () => Promise<[]>;
}

function emptyDeps(): { webhookDelivery: MockWebhookDelivery; store: MockStore } {
  return {
    webhookDelivery: { enqueue: () => {} },
    // Empty store → fan-out skips webhook enqueue entirely, so we measure
    // pure exporter.push + GatewayEvent construction cost.
    store: { listForEvent: () => Promise.resolve([]) },
  };
}

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
}

function runDispatchLoop(bus: EventEmitter): number[] {
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    bus.emit('dispatch:decision', {
      decision: 'assign',
      taskId: `t-${i}`,
      reason: 'benchmark',
    });
    const t1 = performance.now();
    samples.push(t1 - t0);
  }
  return samples;
}

describe('telemetry latency budget (Phase 5 Task 14)', () => {
  it('p99 added overhead < 5 ms vs disabled-exporter baseline', async () => {
    // ── Baseline: exporter disabled — fanout is no-op-ish. ──
    const baselineBus = new EventEmitter();
    const baselineExporter = new OTLPExporter({
      endpoint: UNREACHABLE_ENDPOINT,
      enabled: false,
      flushIntervalMs: 60_000,
      // Match the enabled run's batchSize so the buffer-side cost is
      // identical across baseline + enabled; the only delta is the flush
      // hand-off, which is what we're measuring.
      batchSize: 16,
    });
    const baselineUnsub = wireTelemetryFanout({
      bus: baselineBus,
      exporter: baselineExporter,
      ...emptyDeps(),
    });
    // Warm-up pass so JIT / hidden-class shapes stabilize.
    for (let i = 0; i < 32; i++) baselineBus.emit('dispatch:decision', { decision: 'warm' });
    const baselineSamples = runDispatchLoop(baselineBus);
    baselineUnsub();

    // ── Enabled: exporter targets an unreachable endpoint (worst case). ──
    const enabledBus = new EventEmitter();
    const enabledExporter = new OTLPExporter({
      endpoint: UNREACHABLE_ENDPOINT,
      enabled: true,
      flushIntervalMs: 60_000, // suppress timer flushes during measurement
      // batchSize=16 means ~12 size-triggered flushes inside the 200-emit
      // loop. Each flush hands off to fetch() against the unreachable
      // endpoint, exercising the void-flush + retry-scheduling path that
      // is the actual producer-side cost we care about.
      batchSize: 16,
    });
    enabledExporter.start();
    const enabledUnsub = wireTelemetryFanout({
      bus: enabledBus,
      exporter: enabledExporter,
      ...emptyDeps(),
    });
    for (let i = 0; i < 32; i++) enabledBus.emit('dispatch:decision', { decision: 'warm' });
    const enabledSamples = runDispatchLoop(enabledBus);
    enabledUnsub();
    await enabledExporter.stop();

    const baselineP99 = percentile(baselineSamples, 0.99);
    const enabledP99 = percentile(enabledSamples, 0.99);
    const delta = enabledP99 - baselineP99;
    const report =
      `baselineP99=${baselineP99.toFixed(3)}ms ` +
      `enabledP99=${enabledP99.toFixed(3)}ms ` +
      `delta=${delta.toFixed(3)}ms (budget ${P99_BUDGET_MS}ms)`;

    // Log for the executor's "Task 14 acceptance numbers" report.
    // eslint-disable-next-line no-console
    console.log(`[telemetry-latency] ${report}`);

    // Surface both p99s in the assertion failure message so a flake is
    // immediately diagnosable from the test output alone — no need to grep
    // the surrounding console.log.
    expect(delta, `latency budget exceeded — ${report}`).toBeLessThan(P99_BUDGET_MS);
  });
});
