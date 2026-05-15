---
domain: orchestrator
title: Telemetry export (OTLP/HTTP trace exporter)
audience: orchestrator-developers, operators
related:
  - docs/knowledge/decisions/0012-telemetry-export-otlp-http.md
  - docs/knowledge/orchestrator/webhook-fanout.md
  - docs/knowledge/orchestrator/gateway-api.md
phase: 5
---

# Telemetry export

Hermes Phase 5 ships an in-tree OpenTelemetry exporter that publishes three
trace kinds to a configurable OTel collector endpoint and surfaces the same
data as `telemetry.*` events on the Phase 4 webhook fanout. The exporter is
hand-rolled OTLP/HTTP JSON (see [ADR
0012](../decisions/0012-telemetry-export-otlp-http.md) for the rationale)
and adds zero runtime dependencies.

## Trace kinds

The orchestrator emits three span names. Each is a single span — there is no
nested span structure within a kind. Cross-kind correlation uses
`traceId` + `parentSpanId`.

| Span name           | Emitted from                                                                             | Parent linkage                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `maintenance_run`   | `maintenance:started` (opens) and `maintenance:completed` / `maintenance:error` (closes) | Root span — generates a fresh `traceId`                                                    |
| `skill_invocation`  | `skill_invocation` bus events                                                            | Inherits `traceId`; `parentSpanId = maintenance_run.spanId` if an active run is registered |
| `dispatch_decision` | `dispatch:decision` bus events                                                           | Inherits `traceId`; `parentSpanId = maintenance_run.spanId` if an active run is registered |

The fanout (`packages/orchestrator/src/gateway/telemetry/fanout.ts`)
maintains an in-memory `ActiveRunRegistry` keyed by `correlationId` (preferred)
or `taskId` (fallback). When a child event arrives during an active run, the
registry resolves the parent's IDs and the fanout sets `parentSpanId`
accordingly. Orphaned child events (no active run) still emit, but with no
parent linkage — collectors see them as roots of their own trace.

## Attribute keys

Per spec, every span carries scalar attributes pulled from the bus event
payload. Conventional keys:

| Key                     | Type   | Source                                                                |
| ----------------------- | ------ | --------------------------------------------------------------------- |
| `harness.skill`         | string | `skill` field on `skill_invocation` payloads                          |
| `harness.outcome`       | string | `outcome` field (e.g. `success`, `failure`, `escalated`)              |
| `harness.turns`         | int    | `turns` count from the agent loop                                     |
| `harness.tool_calls`    | int    | `toolCalls` count from the agent loop                                 |
| `harness.tokens.input`  | int    | `tokensInput`                                                         |
| `harness.tokens.output` | int    | `tokensOutput`                                                        |
| `harness.cache.hit`     | bool   | `cacheHit` from the Anthropic response                                |
| `harness.cache.miss`    | bool   | `cacheMiss` from the Anthropic response                               |
| `harness.topic`         | string | The internal bus topic (`maintenance:started`, `skill_invocation`, …) |

The fanout copies every scalar field on the payload verbatim into the span's
attribute bag — nested objects and arrays are dropped, since OTLP's
`KeyValue` only supports `stringValue`/`intValue`/`doubleValue`/`boolValue`.

## OTLP envelope shape

Spans are serialized as the OTLP/HTTP v1.0.0 JSON envelope and POSTed to
`<endpoint>` (typically `http://localhost:4318/v1/traces`):

```json
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [{ "key": "service.name", "value": { "stringValue": "harness" } }]
      },
      "scopeSpans": [
        {
          "scope": { "name": "harness" },
          "spans": [
            {
              "traceId": "<32-hex>",
              "spanId": "<16-hex>",
              "parentSpanId": "<16-hex>?",
              "name": "maintenance_run",
              "kind": 1,
              "startTimeUnixNano": "<int64-as-string>",
              "endTimeUnixNano": "<int64-as-string>",
              "attributes": [{ "key": "harness.skill", "value": { "stringValue": "review" } }],
              "status": { "code": 1 }
            }
          ]
        }
      ]
    }
  ]
}
```

`traceId` is a 32-char lowercase-hex string (16 bytes); `spanId` and
`parentSpanId` are 16-char lowercase-hex strings (8 bytes). Times are stringly
typed because JSON cannot losslessly represent int64.

## Configuration

```jsonc
// harness.config.json
{
  "telemetry": {
    "export": {
      "otlp": {
        "endpoint": "http://localhost:4318/v1/traces",
        "enabled": true,
        "headers": { "X-Api-Key": "redacted" },
        "flushIntervalMs": 2000,
        "batchSize": 64,
      },
    },
  },
}
```

Field semantics:

- `endpoint` (**required**) — full URL of the collector's `/v1/traces`
  ingestion endpoint.
- `enabled` (default `true`) — when `false`, `push()` is a constant-time
  no-op. The exporter and its timer remain constructed so flipping the
  flag at runtime via a future config-reload path is mechanically free.
- `headers` (optional) — additional headers forwarded on each POST. Common
  uses are collector auth tokens (`Authorization`, `X-Api-Key`) and
  tenant IDs.
- `flushIntervalMs` (default `2000`) — flush timer cadence.
- `batchSize` (default `64`) — buffer fills past this size trigger an
  immediate flush instead of waiting for the timer.

Omitting the `telemetry.export.otlp` block entirely removes the exporter
from the dispatch path. The orchestrator still constructs a
`CacheMetricsRecorder` so `/api/v1/telemetry/cache/stats` returns a real
hit-rate; only the OTel emission is suppressed.

## Producer-side guarantees

- `push()` is synchronous and never awaits. The orchestrator's hot path
  may call it on every dispatch with no latency cost (measured p99 added
  overhead is well below 1 ms — see
  `packages/orchestrator/tests/integration/telemetry-latency.test.ts`).
- Flushes are fire-and-forget. The exporter retries up to 3 times with
  1 s / 2 s / 4 s backoff. On retry exhaustion, the entire batch is
  dropped and a single `console.warn` is logged. The exporter never
  queues to disk — observability data is best-effort.
- `stop()` flushes the remaining buffer before resolving. The
  orchestrator awaits `exporter.stop()` in its own `stop()` so graceful
  shutdown does not lose recently-emitted spans.

## Webhook fanout

In addition to OTLP export, every span generates a corresponding
`telemetry.<topic>` `GatewayEvent` on the webhook fanout. Topic mapping:

| Span name           | GatewayEvent type             |
| ------------------- | ----------------------------- |
| `maintenance_run`   | `telemetry.maintenance_run`   |
| `skill_invocation`  | `telemetry.skill_invocation`  |
| `dispatch_decision` | `telemetry.dispatch_decision` |

`telemetry.*` events are **excluded from `*.*` wildcard subscriptions by
default**. See [webhook-fanout.md](./webhook-fanout.md) for the opt-in
mechanism.

## Cache-stats endpoint

The dashboard surface `/insights/cache` (preferred URL) polls
`GET /api/v1/telemetry/cache/stats` at 5 s. The response shape is
`PromptCacheStats`:

```typescript
{
  totalRequests: number;
  hits: number;
  misses: number;
  hitRate: number; // 0..1
  byBackend: Record<string, { hits: number; misses: number }>;
  windowStartedAt: number; // unix-ms; 0 if no records yet
}
```

The recorder is an in-memory ring buffer (capacity 1000, FIFO eviction).
Restarts reset the window — prompt-cache hit-rate is an observability
signal, not an audit record.
