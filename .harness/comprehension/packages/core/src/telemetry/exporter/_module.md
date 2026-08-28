---
schemaVersion: 1
module: 'packages/core/src/telemetry/exporter'
sourceHash: 'ae9249ad310d9626785a3026caae65bc95228e60ab58ba940b104e2c7a68b0bf'
compiledAt: '2026-08-28T01:22:10.658Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'otlp-http.test.ts', 'otlp-http.ts', 'types.ts']
---

## Summary

OTLPExporter is a hand-rolled OTLP/HTTP JSON trace exporter that buffers TraceSpan instances in memory and flushes them to a configurable /v1/traces endpoint. It ships spans on a timer (default 2 s) or when a batch size is reached (default 64 spans). Push operations are synchronous and optimized for sub-5ms latency; flush is fire-and-forget with exponential backoff retry (1/2/4 s, up to 3 attempts), then drops failed batches with a single console warn. When disabled, push is a constant-time no-op. On graceful shutdown, stop() flushes the remaining buffer before resolving to prevent data loss. The exporter serializes to OTLP/HTTP v1.0.0 JSON per spec, wrapping spans in resourceSpans/scopeSpans envelope with service.name="harness". Attributes are encoded type-sensitively; nanosecond timestamps are stringified for JSON int64 safety.

## Invariants

- Synchronous push with <5ms p99 latency: push() must never await or block; it is called thousands of times per second in the orchestrator hot path
- Fire-and-forget flush with bounded retries: failed batches retry up to 3 times (1/2/4 s backoff), then drop with a single warn; no disk queue
- No-op when disabled: when enabled: false, push() must be constant-time no-op so callers wire the recorder unconditionally without branching
- Graceful shutdown completeness: stop() must flush remaining buffer before resolving; data in the buffer must not be lost on process exit
- OTLP spec compliance: wire format must match OTLP/HTTP v1.0.0 (resourceSpans/scopeSpans envelope, service.name='harness', nanosecond timestamps as strings, type-aware attribute encoding)
- No jitter or unbounded queue: retries use fixed backoff; a batch lost to the network is lost forever

## Interface Contract

```ts
export OTLPExporter
export OTLPExporterOptions
export SpanAttributes
export SpanKind
export TraceSpan
```

## Dependency Slice

```
import { OTLPExporter } from './otlp-http'
import { SpanKind, TraceSpan } from './types'
import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
