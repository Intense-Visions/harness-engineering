import { describe, it, expect } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';
import { OTLPExporter } from '@harness-engineering/core';
import type { GatewayEvent, WebhookSubscription } from '@harness-engineering/types';
import { wireTelemetryFanout } from '../../src/gateway/telemetry/fanout';

/**
 * Phase 5 Task 13 — End-to-end correlation test.
 *
 * Wires `OTLPExporter` against an in-process OTLP receiver and asserts:
 *
 *   1. A `maintenance:started → skill_invocation → dispatch:decision →
 *      maintenance:completed` sequence produces four spans on the receiver.
 *   2. All four spans share the same `traceId`.
 *   3. The two child spans (`skill_invocation`, `dispatch:decision`) carry
 *      `parentSpanId` pointing at the maintenance span.
 *   4. The webhook delivery received the corresponding `telemetry.*`
 *      events fanned out via `enqueue()`.
 *
 * The in-process receiver is the same shape used by `otlp-http.test.ts` —
 * a Node `http.createServer` listening on a randomly chosen port, parsing
 * `/v1/traces` POST bodies as OTLP/HTTP JSON envelopes.
 */

interface Receiver {
  url: string;
  spans: Array<Record<string, unknown>>;
  close: () => Promise<void>;
}

function spawnReceiver(): Promise<Receiver> {
  return new Promise((resolve, reject) => {
    const spans: Array<Record<string, unknown>> = [];
    const server = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/traces') {
        res.statusCode = 404;
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          const parsed = JSON.parse(body) as {
            resourceSpans: Array<{
              scopeSpans: Array<{ spans: Array<Record<string, unknown>> }>;
            }>;
          };
          for (const rs of parsed.resourceSpans) {
            for (const ss of rs.scopeSpans) {
              for (const s of ss.spans) spans.push(s);
            }
          }
          res.statusCode = 200;
          res.end('{}');
        } catch {
          res.statusCode = 400;
          res.end();
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}/v1/traces`,
        spans,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
    server.on('error', reject);
  });
}

function makeSub(events: string[]): WebhookSubscription {
  return {
    id: `whk_${'a'.repeat(16)}`,
    tokenId: 'tok_test',
    url: 'https://example.test/hook',
    events,
    secret: 'a'.repeat(44),
    createdAt: new Date().toISOString(),
  };
}

describe('telemetry end-to-end correlation (Phase 5 Task 13)', () => {
  it('exports 3 trace kinds with correlated traceId/parentSpanId and fans out telemetry.* events', async () => {
    const receiver = await spawnReceiver();
    try {
      const exporter = new OTLPExporter({
        endpoint: receiver.url,
        // Tighter flush so the test doesn't wait the default 2 s.
        flushIntervalMs: 50,
        batchSize: 1, // immediate flush on each push for deterministic timing
      });
      exporter.start();

      const bus = new EventEmitter();
      const enqueued: Array<{ sub: WebhookSubscription; event: GatewayEvent }> = [];
      const webhookDelivery = {
        enqueue: (sub: WebhookSubscription, event: GatewayEvent) => enqueued.push({ sub, event }),
      };
      const subTelemetry = makeSub(['telemetry.*']);
      const store = {
        listForEvent: async (eventType: string) => {
          const { eventMatches } = await import('../../src/gateway/webhooks/signer');
          return [subTelemetry].filter((s) => s.events.some((p) => eventMatches(p, eventType)));
        },
      };

      const unsub = wireTelemetryFanout({ bus, exporter, webhookDelivery, store });

      // Drive a representative trace: parent + 2 children + close.
      bus.emit('maintenance:started', { taskId: 'task-e2e' });
      bus.emit('skill_invocation', { skill: 'review', taskId: 'task-e2e', turns: 4 });
      bus.emit('dispatch:decision', {
        decision: 'assign',
        taskId: 'task-e2e',
        reason: 'queue-empty',
      });
      bus.emit('maintenance:completed', { taskId: 'task-e2e', status: 'success' });

      // Drain microtasks for the async webhook fan-out path.
      await new Promise((r) => setImmediate(r));
      // Wait for the exporter to flush — batchSize=1 means each push triggers
      // an immediate POST. Allow up to 1 s for all 4 to land.
      const deadline = Date.now() + 1000;
      while (receiver.spans.length < 4 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
      }
      await exporter.stop();

      // 4 spans on the wire — one per emit().
      expect(receiver.spans.length).toBeGreaterThanOrEqual(4);
      const byName = new Map<string, Array<Record<string, unknown>>>();
      for (const s of receiver.spans) {
        const name = s['name'] as string;
        const arr = byName.get(name) ?? [];
        arr.push(s);
        byName.set(name, arr);
      }
      // maintenance_run appears for both started + completed (close re-emits the parent).
      expect(byName.get('maintenance_run')?.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(byName.get('skill_invocation')?.length ?? 0).toBe(1);
      expect(byName.get('dispatch_decision')?.length ?? 0).toBe(1);

      const parentSpan = byName.get('maintenance_run')![0]!;
      const parentTraceId = parentSpan['traceId'] as string;
      const parentSpanId = parentSpan['spanId'] as string;

      // All spans share the same traceId.
      for (const s of receiver.spans) {
        expect(s['traceId']).toBe(parentTraceId);
      }
      // Children link back to the parent's spanId.
      const childSkill = byName.get('skill_invocation')![0]!;
      const childDispatch = byName.get('dispatch_decision')![0]!;
      expect(childSkill['parentSpanId']).toBe(parentSpanId);
      expect(childDispatch['parentSpanId']).toBe(parentSpanId);

      // Webhook fan-out: 4 events on `telemetry.*` sub.
      expect(enqueued.length).toBe(4);
      const types = enqueued.map((e) => e.event.type);
      expect(types).toContain('telemetry.maintenance_run');
      expect(types).toContain('telemetry.skill_invocation');
      expect(types).toContain('telemetry.dispatch_decision');

      unsub();
    } finally {
      await receiver.close();
    }
  });
});
