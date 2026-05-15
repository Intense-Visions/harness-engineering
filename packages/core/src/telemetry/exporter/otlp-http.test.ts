import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { OTLPExporter } from './otlp-http';
import { SpanKind, type TraceSpan } from './types';

interface Receiver {
  url: string;
  received: unknown[];
  setStatus: (code: number, count?: number) => void;
  close: () => Promise<void>;
}

function spawnReceiver(): Promise<Receiver> {
  return new Promise((resolve, reject) => {
    const received: unknown[] = [];
    let pendingStatusCode = 200;
    let pendingStatusCount = 0;

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
          const parsed = JSON.parse(body);
          if (pendingStatusCount > 0) {
            pendingStatusCount--;
            res.statusCode = pendingStatusCode;
            res.end();
            return;
          }
          received.push(parsed);
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
        received,
        setStatus: (code: number, count = 1) => {
          pendingStatusCode = code;
          pendingStatusCount = count;
        },
        close: () =>
          new Promise((closeResolve) => {
            server.close(() => closeResolve());
          }),
      });
    });
    server.on('error', reject);
  });
}

function makeSpan(overrides: Partial<TraceSpan> = {}): TraceSpan {
  return {
    traceId: 'a'.repeat(32),
    spanId: '1'.repeat(16),
    name: 'test-span',
    kind: SpanKind.INTERNAL,
    startTimeNs: 1_700_000_000_000_000_000n,
    endTimeNs: 1_700_000_000_500_000_000n,
    attributes: { 'harness.skill': 'test' },
    ...overrides,
  };
}

describe('OTLPExporter', () => {
  let receiver: Receiver;
  let exporter: OTLPExporter | null = null;

  beforeEach(async () => {
    receiver = await spawnReceiver();
    exporter = null;
  });

  afterEach(async () => {
    if (exporter) await exporter.stop();
    await receiver.close();
  });

  it('pushes a single span and flushes it via the timer', async () => {
    exporter = new OTLPExporter({
      endpoint: receiver.url,
      flushIntervalMs: 20,
      batchSize: 100,
    });
    exporter.start();
    exporter.push(makeSpan());

    await vi.waitFor(() => expect(receiver.received).toHaveLength(1), { timeout: 1000 });
    const envelope = receiver.received[0] as {
      resourceSpans: [{ scopeSpans: [{ spans: unknown[] }] }];
    };
    expect(envelope.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);
  });

  it('flushes immediately when the buffer hits batchSize', async () => {
    exporter = new OTLPExporter({
      endpoint: receiver.url,
      flushIntervalMs: 60_000, // intentionally long so the timer never fires
      batchSize: 2,
    });
    exporter.start();
    exporter.push(makeSpan({ name: 'span-a' }));
    exporter.push(makeSpan({ name: 'span-b' }));
    exporter.push(makeSpan({ name: 'span-c' }));
    exporter.push(makeSpan({ name: 'span-d' }));

    await vi.waitFor(() => expect(receiver.received).toHaveLength(2), { timeout: 2000 });
  });

  it('drops the batch after 3 failed attempts and warns once', async () => {
    const warn = vi.fn();
    receiver.setStatus(503, 10); // serve 503 for every request in this test
    exporter = new OTLPExporter({
      endpoint: receiver.url,
      flushIntervalMs: 60_000,
      batchSize: 1,
      warn,
    });
    exporter.start();

    vi.useFakeTimers({ shouldAdvanceTime: true, shouldClearNativeTimers: false });
    const advanceAll = async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
    };

    exporter.push(makeSpan());
    await advanceAll();
    await advanceAll();
    vi.useRealTimers();

    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(receiver.received).toHaveLength(0);
  });

  it('stop() flushes the remaining buffer before resolving', async () => {
    exporter = new OTLPExporter({
      endpoint: receiver.url,
      flushIntervalMs: 60_000,
      batchSize: 100,
    });
    exporter.start();
    exporter.push(makeSpan({ name: 'stop-flush' }));
    expect(receiver.received).toHaveLength(0);

    await exporter.stop();
    exporter = null; // afterEach must not re-stop

    expect(receiver.received).toHaveLength(1);
  });

  it('push() is a no-op when enabled=false', async () => {
    exporter = new OTLPExporter({
      endpoint: receiver.url,
      enabled: false,
      flushIntervalMs: 20,
      batchSize: 1,
    });
    exporter.start();
    exporter.push(makeSpan());
    exporter.push(makeSpan());

    // Give the timer a few ticks to prove nothing arrives.
    await new Promise((r) => setTimeout(r, 100));
    expect(receiver.received).toHaveLength(0);
  });

  it('serializes the OTLP/HTTP JSON envelope per spec', async () => {
    exporter = new OTLPExporter({
      endpoint: receiver.url,
      flushIntervalMs: 20,
      batchSize: 100,
    });
    exporter.start();

    const span = makeSpan({
      parentSpanId: '2'.repeat(16),
      statusCode: 1,
      attributes: {
        'harness.skill': 'harness-execution',
        'harness.tool_call_count': 7,
        'harness.success': true,
      },
    });
    exporter.push(span);

    await vi.waitFor(() => expect(receiver.received).toHaveLength(1), { timeout: 1000 });
    const env = receiver.received[0] as {
      resourceSpans: [
        {
          resource: { attributes: Array<{ key: string; value: { stringValue?: string } }> };
          scopeSpans: [
            {
              scope: { name: string };
              spans: Array<{
                traceId: string;
                spanId: string;
                parentSpanId?: string;
                name: string;
                kind: number;
                startTimeUnixNano: string;
                endTimeUnixNano: string;
                attributes: Array<{
                  key: string;
                  value: { stringValue?: string; intValue?: string; boolValue?: boolean };
                }>;
                status?: { code: number };
              }>;
            },
          ];
        },
      ];
    };

    // Resource attributes carry service.name=harness.
    expect(env.resourceSpans[0].resource.attributes[0]).toEqual({
      key: 'service.name',
      value: { stringValue: 'harness' },
    });
    expect(env.resourceSpans[0].scopeSpans[0].scope).toEqual({ name: 'harness' });

    const wireSpan = env.resourceSpans[0].scopeSpans[0].spans[0]!;
    expect(wireSpan.traceId).toBe('a'.repeat(32));
    expect(wireSpan.spanId).toBe('1'.repeat(16));
    expect(wireSpan.parentSpanId).toBe('2'.repeat(16));
    expect(wireSpan.kind).toBe(SpanKind.INTERNAL);
    // Nanosecond timestamps must be strings (int64 unsafe in JSON).
    expect(typeof wireSpan.startTimeUnixNano).toBe('string');
    expect(wireSpan.startTimeUnixNano).toBe('1700000000000000000');
    expect(wireSpan.status?.code).toBe(1);

    // Attribute encoding: string → stringValue, int → intValue (stringified), bool → boolValue.
    const byKey = Object.fromEntries(wireSpan.attributes.map((a) => [a.key, a.value]));
    expect(byKey['harness.skill']).toEqual({ stringValue: 'harness-execution' });
    expect(byKey['harness.tool_call_count']).toEqual({ intValue: '7' });
    expect(byKey['harness.success']).toEqual({ boolValue: true });
  });
});
