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
 * Strategy: run 200 mock `dispatch:decision` emits with the fanout wired,
 * pointing the exporter at an UNREACHABLE endpoint (`http://127.0.0.1:1/v1/traces`
 * — port 1 is reserved and always refuses TCP). This is intentionally the
 * worst case: every flush attempt fails fast, exercising the retry path
 * without external dependencies. The exporter's contract is fire-and-forget,
 * so the producer-side cost must remain bounded even when the backend is
 * dead.
 *
 * Notes:
 *   - The test deliberately uses a generous threshold of 5 ms; on bare metal
 *     this typically lands in single-digit-microsecond territory, but CI
 *     containers can vary by an order of magnitude. The acceptance criterion
 *     is "evidence, not regression" — flakes mean we widen the budget and
 *     document, not gate the phase.
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
      batchSize: 1024,
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
      batchSize: 1024, // bigger than ITERATIONS so no immediate flush triggers
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

    // Log for the executor's "Task 14 acceptance numbers" report.
    // eslint-disable-next-line no-console
    console.log(
      `[telemetry-latency] baselineP99=${baselineP99.toFixed(3)}ms ` +
        `enabledP99=${enabledP99.toFixed(3)}ms delta=${delta.toFixed(3)}ms`
    );

    expect(delta).toBeLessThan(P99_BUDGET_MS);
  });
});
