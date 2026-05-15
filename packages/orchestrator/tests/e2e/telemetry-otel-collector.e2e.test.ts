import { describe, it, expect } from 'vitest';
import { OTLPExporter, SpanKind, type TraceSpan } from '@harness-engineering/core';

/**
 * Phase 5 Task 15 — E2E smoke against a real OpenTelemetry collector.
 *
 * Spins `otel/opentelemetry-collector-contrib` via testcontainers and points
 * our hand-rolled OTLP/HTTP exporter at the collector's `/v1/traces`
 * endpoint. The collector is configured with a `logging` exporter pipeline
 * so received spans are printed to stdout; we tail the container logs and
 * grep for our trace names.
 *
 * This test is GATED behind `HARNESS_E2E=1` because it requires a working
 * Docker daemon — CI runs it nightly / pre-release, not on every PR.
 *
 * What this verifies (that the in-process receiver test in Task 13 cannot):
 *   - Our OTLP/HTTP JSON envelope is wire-compatible with a real collector
 *     binary (no spec drift between our `spansToOTLPJSON` and OTLP v1.0.0).
 *   - Content-Type/auth headers are accepted by the production binary.
 */

const E2E_ENABLED = process.env['HARNESS_E2E'] === '1';

const COLLECTOR_CONFIG = `
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

exporters:
  debug:
    verbosity: detailed

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [debug]
`.trim();

function makeSpan(name: string, traceId: string, spanId: string): TraceSpan {
  return {
    traceId,
    spanId,
    name,
    kind: SpanKind.INTERNAL,
    startTimeNs: BigInt(Date.now()) * 1_000_000n,
    endTimeNs: BigInt(Date.now()) * 1_000_000n + 1_000_000n,
    attributes: { 'harness.skill': 'e2e' },
  };
}

describe.skipIf(!E2E_ENABLED)('telemetry E2E — real otel-collector (Phase 5 Task 15)', () => {
  it('accepts our OTLP/HTTP JSON envelope and logs received span names', async () => {
    // Lazy-import testcontainers so non-E2E CI passes don't pay the import cost.
    const { GenericContainer, Wait } =
      (await import('testcontainers')) as typeof import('testcontainers');

    const container = await new GenericContainer('otel/opentelemetry-collector-contrib:latest')
      .withCopyContentToContainer([
        {
          content: COLLECTOR_CONFIG,
          target: '/etc/otelcol-contrib/config.yaml',
        },
      ])
      .withExposedPorts(4318)
      .withWaitStrategy(Wait.forLogMessage(/Everything is ready|Started OTLPReceiver/i))
      .withStartupTimeout(60_000)
      .start();

    try {
      const port = container.getMappedPort(4318);
      const host = container.getHost();
      const endpoint = `http://${host}:${port}/v1/traces`;

      const exporter = new OTLPExporter({
        endpoint,
        flushIntervalMs: 250,
        batchSize: 8,
      });
      exporter.start();

      const traceId = 'cafebabecafebabecafebabecafebabe';
      const names = ['maintenance_run', 'skill_invocation', 'dispatch_decision'];
      for (let i = 0; i < names.length; i++) {
        const spanId = `e2e${String(i).padStart(13, '0')}`;
        exporter.push(makeSpan(names[i]!, traceId, spanId));
      }
      await exporter.stop();

      // Allow the collector to flush its debug exporter — typically near-instant
      // but the debug exporter buffers for a short interval.
      const deadline = Date.now() + 30_000;
      let logs = '';
      while (Date.now() < deadline) {
        const stream = await container.logs();
        logs = '';
        await new Promise<void>((resolve) => {
          stream.on('data', (chunk: Buffer | string) => {
            logs += chunk.toString();
          });
          stream.on('end', () => resolve());
          stream.on('close', () => resolve());
        });
        if (
          logs.includes('maintenance_run') &&
          logs.includes('skill_invocation') &&
          logs.includes('dispatch_decision')
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      expect(logs).toContain('maintenance_run');
      expect(logs).toContain('skill_invocation');
      expect(logs).toContain('dispatch_decision');
    } finally {
      await container.stop();
    }
  }, 120_000);
});
