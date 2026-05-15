/**
 * In-tree trace span shapes for the OTLP/HTTP JSON exporter.
 *
 * These are the internal representations the orchestrator buffers and
 * hands to `OTLPExporter.push()`. The exporter converts them to the OTLP
 * wire format (string-encoded int64 timestamps, hex-encoded ids) before
 * serializing as JSON for `/v1/traces` requests.
 *
 * See `packages/types/src/telemetry.ts` for the OTLP wire-format shapes
 * and the rationale for stringly-typed nanosecond timestamps.
 */

/**
 * SpanKind enum mirroring the OTel spec values 1..5. Spans emitted by
 * the orchestrator are predominantly `INTERNAL`; we leave the other
 * variants exposed for future producer/consumer fanout instrumentation.
 */
export enum SpanKind {
  INTERNAL = 1,
  SERVER = 2,
  CLIENT = 3,
  PRODUCER = 4,
  CONSUMER = 5,
}

/**
 * Free-form attribute bag attached to a span. Values must be scalar:
 * strings, numbers, or booleans (the OTLP/HTTP JSON converter only
 * supports `stringValue` / `intValue` / `doubleValue` / `boolValue`).
 */
export interface SpanAttributes {
  [key: string]: string | number | boolean;
}

/**
 * A completed trace span ready for export. `startTimeNs` and `endTimeNs`
 * are unix epoch nanoseconds as `bigint` (JS `number` cannot losslessly
 * hold int64); the exporter stringifies them for the OTLP JSON payload.
 *
 * `traceId` is a 32-char lowercase hex string (16 bytes); `spanId` and
 * `parentSpanId` are 16-char lowercase hex strings (8 bytes) per the
 * OTel trace context spec.
 *
 * `statusCode` follows OTel convention: 0 = UNSET, 1 = OK, 2 = ERROR.
 */
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTimeNs: bigint;
  endTimeNs: bigint;
  attributes: SpanAttributes;
  statusCode?: 0 | 1 | 2;
}
