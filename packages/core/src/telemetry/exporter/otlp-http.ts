/**
 * OTLPExporter — hand-rolled OTLP/HTTP JSON exporter for trace spans.
 *
 * Buffers `TraceSpan` instances in-memory and flushes them as OTLP/HTTP
 * v1.0.0 JSON payloads to a configurable `/v1/traces` endpoint on a
 * timer (default 2 s) or when the batch size is hit (default 64).
 *
 * Design contracts:
 * - {@link push} is synchronous and never awaits. The orchestrator hot
 *   path may call `push()` thousands of times per second; we must add
 *   < 5 ms p99 to dispatch latency (Phase 5 acceptance criterion).
 * - {@link flush} is fire-and-forget. On HTTP failure we retry up to 3
 *   times with 1 s / 2 s / 4 s backoff, then drop the batch and log a
 *   single `console.warn`. The exporter never queues to disk.
 * - When `enabled: false`, {@link push} is a constant-time no-op so
 *   callers can wire the recorder unconditionally without branching.
 * - {@link stop} flushes the remaining buffer before resolving so we
 *   don't lose data on graceful shutdown.
 *
 * Wire format (per OTLP/HTTP v1.0.0 spec):
 * ```json
 * {
 *   "resourceSpans": [{
 *     "resource": { "attributes": [{ "key": "service.name", "value": { "stringValue": "harness" } }] },
 *     "scopeSpans": [{
 *       "scope": { "name": "harness" },
 *       "spans": [ ...OTLPSpan[] ]
 *     }]
 *   }]
 * }
 * ```
 *
 * `traceId` / `spanId` are lowercase hex strings (16 / 8 bytes); time
 * fields are stringly-typed nanoseconds (JSON cannot losslessly hold
 * int64).
 */

import type { TraceSpan } from './types';

export interface OTLPExporterOptions {
  /** Full OTLP/HTTP traces endpoint, e.g. `http://localhost:4318/v1/traces`. */
  endpoint: string;
  /** Default `true`. When `false`, push() is a no-op. */
  enabled?: boolean;
  /** Custom headers (auth tokens, etc.). */
  headers?: Record<string, string>;
  /** Flush interval in ms. Default 2000. */
  flushIntervalMs?: number;
  /** Buffer size that triggers an immediate flush. Default 64. */
  batchSize?: number;
  /** Injectable fetch for tests. Defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable warn for tests. Defaults to `console.warn`. */
  warn?: (...args: unknown[]) => void;
}

const RETRY_BACKOFFS_MS = [1000, 2000, 4000];

/** Convert a `bigint` nanosecond timestamp to its decimal string form. */
function toUnixNanoString(ns: bigint): string {
  return ns.toString(10);
}

/**
 * Map a {@link SpanAttributes} bag to an array of OTLP KeyValue entries.
 * String values → stringValue. Booleans → boolValue. Integers (safe
 * range) → intValue (stringified). Non-integer numbers → doubleValue.
 */
function attributesToOTLP(attrs: TraceSpan['attributes']): unknown[] {
  const out: unknown[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === 'string') {
      out.push({ key, value: { stringValue: value } });
    } else if (typeof value === 'boolean') {
      out.push({ key, value: { boolValue: value } });
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        out.push({ key, value: { intValue: String(value) } });
      } else {
        out.push({ key, value: { doubleValue: value } });
      }
    }
  }
  return out;
}

export class OTLPExporter {
  private readonly endpoint: string;
  private readonly enabled: boolean;
  private readonly headers: Record<string, string>;
  private readonly flushIntervalMs: number;
  private readonly batchSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly warn: (...args: unknown[]) => void;

  private buffer: TraceSpan[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing: Promise<void> | null = null;

  constructor(opts: OTLPExporterOptions) {
    this.endpoint = opts.endpoint;
    this.enabled = opts.enabled !== false;
    this.headers = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
    this.flushIntervalMs = opts.flushIntervalMs ?? 2000;
    this.batchSize = opts.batchSize ?? 64;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.warn = opts.warn ?? ((...a: unknown[]) => console.warn(...a));
  }

  /**
   * O(1) buffer push. When `enabled === false` this is a no-op. If the
   * buffer reaches `batchSize`, a flush is triggered without awaiting.
   */
  push(span: TraceSpan): void {
    if (!this.enabled) return;
    this.buffer.push(span);
    if (this.buffer.length >= this.batchSize) {
      // Fire-and-forget: never block the producer.
      void this.flush();
    }
  }

  /** Start the periodic flush timer. Idempotent. */
  start(): void {
    if (!this.enabled || this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    // Allow Node to exit naturally even if the exporter is still running.
    if (typeof (this.timer as { unref?: () => void }).unref === 'function') {
      (this.timer as { unref: () => void }).unref();
    }
  }

  /** Flush any pending spans and stop the timer. Awaits the in-flight flush. */
  async stop(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /**
   * Serialize and POST the current buffer to `/v1/traces`. Retries up
   * to 3 times on transport or 5xx failure, then drops with a single
   * warning. Concurrent calls are coalesced — a second `flush()` while
   * the first is still in-flight awaits the same promise.
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (this.flushing) return this.flushing;

    const batch = this.buffer;
    this.buffer = [];
    const payload = this.spansToOTLPJSON(batch);

    this.flushing = (async () => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < RETRY_BACKOFFS_MS.length; attempt++) {
        try {
          const response = await this.fetchImpl(this.endpoint, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(payload),
          });
          if (response.ok) return;
          // Drain the body so the connection can be reused.
          try {
            await response.text();
          } catch {
            // Ignore.
          }
          lastError = new Error(`OTLP endpoint returned ${response.status}`);
        } catch (err) {
          lastError = err;
        }
        const backoff = RETRY_BACKOFFS_MS[attempt] ?? 0;
        if (attempt < RETRY_BACKOFFS_MS.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
      this.warn(
        `[harness telemetry] dropping ${batch.length} span(s) after 3 failed OTLP attempts:`,
        lastError
      );
    })();

    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  /**
   * Build the OTLP/HTTP JSON envelope for a batch of spans. Public for
   * tests; not part of the supported API surface.
   */
  spansToOTLPJSON(spans: TraceSpan[]): unknown {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'harness' } }],
          },
          scopeSpans: [
            {
              scope: { name: 'harness' },
              spans: spans.map((s) => {
                const span: Record<string, unknown> = {
                  traceId: s.traceId,
                  spanId: s.spanId,
                  name: s.name,
                  kind: s.kind,
                  startTimeUnixNano: toUnixNanoString(s.startTimeNs),
                  endTimeUnixNano: toUnixNanoString(s.endTimeNs),
                  attributes: attributesToOTLP(s.attributes),
                };
                if (s.parentSpanId !== undefined) span['parentSpanId'] = s.parentSpanId;
                if (s.statusCode !== undefined) span['status'] = { code: s.statusCode };
                return span;
              }),
            },
          ],
        },
      ],
    };
  }
}
