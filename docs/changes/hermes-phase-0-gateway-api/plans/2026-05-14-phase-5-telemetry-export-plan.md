# Plan: Phase 5 — Telemetry Export

**Date:** 2026-05-14 | **Spec:** docs/changes/hermes-phase-0-gateway-api/proposal.md | **Tasks:** 16 | **Time:** ~75 min | **Integration Tier:** large

## Goal

Ship an in-tree `OTLP/HTTP` exporter that publishes three trace kinds (`skill_invocation`, `dispatch_decision`, `maintenance_run`) to a configurable OTel collector endpoint with p99 added dispatch latency < 5 ms; emit the same trace data as `telemetry.*` `GatewayEvent`s onto the Phase 4 webhook queue (default-excluded from wildcard `*.*` subscriptions); record prompt-cache hits/misses on every Anthropic call and surface a sparkline + breakdown widget at `/insights/cache`.

## Observable Truths (Acceptance Criteria)

1. An in-process Node OTLP receiver started during integration tests receives all three trace kinds and verifies `traceId` / `parentSpanId` correlation (`maintenance_run` is parent, `skill_invocation` + `dispatch_decision` are children sharing its traceId).
2. With the exporter enabled, running 100 dispatches through the orchestrator hot path adds < 5 ms p99 latency compared to baseline.
3. After a 10-prompt dogfood run, `GET /api/v1/telemetry/cache/stats` returns a non-zero `hitRate` and the dashboard `/insights/cache` widget shows a non-empty sparkline.
4. A webhook subscription with `events: ['*.*']` does NOT receive `telemetry.*` events; a subscription with `events: ['telemetry.*']` or `events: ['telemetry.skill_invocation']` DOES.
5. The exporter flush path is fire-and-forget: a slow / unreachable collector does NOT block `dispatch()` or `WebhookDelivery.enqueue()`.
6. The exporter buffers up to 64 spans or 2 s; on flush failure, retries up to 3 times with backoff, then drops with a single `console.warn`.
7. `harness.config.json` accepts a `telemetry.export.otlp = { endpoint, enabled, headers?, flushIntervalMs?, batchSize? }` section; disabling it removes the exporter from the hot path entirely.
8. An optional E2E test gated behind `HARNESS_E2E=1` spins `otel/opentelemetry-collector-contrib` via testcontainers-node and verifies the collector accepts our JSON payload without error.
9. `pnpm --filter orchestrator test --run` and `pnpm --filter core test --run` pass with 0 failures.
10. Typecheck passes across orchestrator/core/cli/dashboard/types.

## Decisions Locked In

- **OTLP transport:** hand-rolled `fetch()` POST to `/v1/traces` using OTLP/HTTP **JSON encoding** (Q1 option B). Zero deps. One file, ~150 LOC, full schema mapping owned in-tree.
- **Wildcard telemetry exclusion:** `telemetry.*` events do NOT match `*.*` subscriptions (Q2 option C). Operators must explicitly subscribe to `telemetry.*` or a specific telemetry topic. Update `eventMatches()` in `signer.ts` accordingly.
- **Integration test strategy:** in-process Node OTLP receiver for fast/reliable tests + a docker-based smoke test gated behind `HARNESS_E2E=1` env var for nightly CI / pre-release validation (Q3 option C).
- **Cache-stats persistence:** in-memory rolling window of last 1000 records (sliding ring buffer). No disk persistence — dashboard polling fetches live in-memory state. Restarts reset stats; this is acceptable since cache hit-rate is a debugging/observability signal, not an audit record.
- **Exporter dependency surface:** zero new runtime deps. `testcontainers` lands as devDependency for the gated E2E smoke only.

## File Map

```
packages/types/src/telemetry.ts                                          CREATE — TrajectoryMetadata, PromptCacheStats, OTLP wire shapes
packages/types/src/index.ts                                              MODIFY — re-export

packages/core/src/telemetry/exporter/types.ts                            CREATE — TraceSpan, SpanKind, SpanAttributes (in-tree shapes)
packages/core/src/telemetry/exporter/otlp-http.ts                        CREATE — OTLPExporter: buffer + flush + retry + drop
packages/core/src/telemetry/exporter/otlp-http.test.ts                   CREATE — TDD with in-process receiver
packages/core/src/telemetry/exporter/index.ts                            CREATE — re-export
packages/core/src/telemetry/trajectory.ts                                CREATE — TrajectoryBuilder: joins adoption.jsonl + AgentEvent stream
packages/core/src/telemetry/trajectory.test.ts                           CREATE — TDD
packages/core/src/telemetry/cache-metrics.ts                             CREATE — CacheMetricsRecorder: rolling window + hitRate
packages/core/src/telemetry/cache-metrics.test.ts                        CREATE — TDD

packages/orchestrator/src/agent/backends/claude.ts                       MODIFY — call CacheMetricsRecorder.record() on every response
packages/orchestrator/src/gateway/webhooks/signer.ts                     MODIFY — eventMatches() excludes telemetry.* from *.* by default
packages/orchestrator/src/gateway/webhooks/signer.test.ts                MODIFY — assert exclusion rule
packages/orchestrator/src/gateway/telemetry/fanout.ts                    CREATE — bus → telemetry.* GatewayEvent emitter (uses webhook delivery)
packages/orchestrator/src/gateway/telemetry/fanout.test.ts               CREATE — TDD
packages/orchestrator/src/orchestrator.ts                                MODIFY — wire CacheMetricsRecorder + OTLPExporter + telemetry fanout into start()/stop()
packages/orchestrator/src/server/routes/v1/telemetry.ts                  CREATE — GET /api/v1/telemetry/cache/stats handler
packages/orchestrator/src/server/routes/v1/telemetry.test.ts             CREATE — route test
packages/orchestrator/src/server/http.ts                                 MODIFY — thread cacheMetrics + dispatch to telemetry route
packages/orchestrator/src/server/v1-bridge-routes.ts                     MODIFY — register telemetry/cache/stats route

packages/dashboard/src/client/pages/insights/Cache.tsx                   CREATE — sparkline + breakdown widget
packages/dashboard/src/client/pages/insights/Cache.test.tsx              CREATE — render + polling test
packages/dashboard/src/client/router.tsx                                 MODIFY — register /insights/cache route

packages/orchestrator/tests/integration/telemetry-end-to-end.test.ts     CREATE — in-process OTLP receiver verifies 3 trace kinds + correlation
packages/orchestrator/tests/integration/telemetry-latency.test.ts        CREATE — p99 < 5 ms with exporter enabled
packages/orchestrator/tests/e2e/telemetry-otel-collector.e2e.test.ts     CREATE — testcontainers + real collector; gated HARNESS_E2E=1
packages/orchestrator/package.json                                       MODIFY — add testcontainers as devDependency

docs/knowledge/orchestrator/telemetry-export.md                          CREATE — Phase 5 knowledge doc (OTLP shape, config, trace kinds)
docs/knowledge/orchestrator/webhook-fanout.md                            MODIFY — add "telemetry.* exclusion from wildcard" subsection
docs/knowledge/orchestrator/gateway-api.md                               MODIFY — telemetry section
docs/knowledge/decisions/0012-telemetry-export-otlp-http.md              CREATE — ADR for telemetry export decision
CHANGELOG.md                                                             MODIFY — Phase 5 entry
```

---

## Tasks

### Task 1: Types — Trajectory + cache + OTLP wire shapes

**Depends on:** none | **Files:** `packages/types/src/telemetry.ts`, `packages/types/src/index.ts`

Create `packages/types/src/telemetry.ts`:

```typescript
import { z } from 'zod';

export const TrajectoryMetadataSchema = z.object({
  turnsCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  modelTokenSpend: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    cacheRead: z.number().int().nonnegative(),
    cacheCreation: z.number().int().nonnegative(),
  }),
  promptCacheHit: z.number().int().nonnegative(),
  promptCacheMiss: z.number().int().nonnegative(),
  totalDurationMs: z.number().int().nonnegative(),
  phasesReached: z.array(z.string()),
});
export type TrajectoryMetadata = z.infer<typeof TrajectoryMetadataSchema>;

export const PromptCacheStatsSchema = z.object({
  totalRequests: z.number().int().nonnegative(),
  hits: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  hitRate: z.number().min(0).max(1),
  byBackend: z.record(
    z.string(),
    z.object({
      hits: z.number().int().nonnegative(),
      misses: z.number().int().nonnegative(),
    })
  ),
  windowStartedAt: z.number().int(),
});
export type PromptCacheStats = z.infer<typeof PromptCacheStatsSchema>;

// OTLP/HTTP JSON wire types — subset used by exporter
export const OTLPKeyValueSchema = z.object({
  key: z.string(),
  value: z.object({
    stringValue: z.string().optional(),
    intValue: z.string().optional(),
    doubleValue: z.number().optional(),
    boolValue: z.boolean().optional(),
  }),
});

export const OTLPSpanSchema = z.object({
  traceId: z.string().length(32), // 16-byte hex
  spanId: z.string().length(16), // 8-byte hex
  parentSpanId: z.string().length(16).optional(),
  name: z.string(),
  kind: z.number().int(), // SpanKind enum
  startTimeUnixNano: z.string(),
  endTimeUnixNano: z.string(),
  attributes: z.array(OTLPKeyValueSchema),
  status: z.object({ code: z.number().int() }).optional(),
});
export type OTLPSpan = z.infer<typeof OTLPSpanSchema>;
```

Add re-exports in `packages/types/src/index.ts`.

Run: `pnpm --filter types typecheck`
Commit: `feat(types): trajectory + prompt-cache + OTLP wire shapes (Phase 5 Task 1)`

---

### Task 2: Core exporter types

**Depends on:** Task 1 | **Files:** `packages/core/src/telemetry/exporter/types.ts`, `packages/core/src/telemetry/exporter/index.ts`

```typescript
// packages/core/src/telemetry/exporter/types.ts
export enum SpanKind {
  INTERNAL = 1,
  SERVER = 2,
  CLIENT = 3,
  PRODUCER = 4,
  CONSUMER = 5,
}

export interface SpanAttributes {
  [key: string]: string | number | boolean;
}

export interface TraceSpan {
  traceId: string; // 16-byte hex
  spanId: string; // 8-byte hex
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTimeNs: bigint;
  endTimeNs: bigint;
  attributes: SpanAttributes;
  statusCode?: 0 | 1 | 2; // OK / ERROR / UNSET
}
```

Run: `pnpm --filter core typecheck`
Commit: `feat(telemetry): TraceSpan + SpanKind in-tree shapes (Phase 5 Task 2)`

---

### Task 3: trajectory.ts + tests

**Depends on:** Task 1 | **Files:** `packages/core/src/telemetry/trajectory.ts`, `packages/core/src/telemetry/trajectory.test.ts`

`TrajectoryBuilder.fromSession(sessionId, projectRoot)` joins:

- `adoption.jsonl` records (read via existing `packages/core/src/adoption/reader.ts`) — by `sessionId`
- `AgentEvent` stream snapshot (provided as constructor arg or read from session dir)

Output: `TrajectoryMetadata` object.

Tests (TDD):

- empty session → zero metadata
- single skill_invocation + 2 tool calls → turnsCount=1, toolCallCount=2
- two skills across phases → phasesReached length 2
- model_token_spend aggregation from multiple events

Run: `pnpm --filter core test --run src/telemetry/trajectory.test.ts`
Commit: `feat(telemetry): TrajectoryBuilder joins adoption + agent stream (Phase 5 Task 3)`

---

### Task 4: cache-metrics.ts + tests

**Depends on:** Task 1 | **Files:** `packages/core/src/telemetry/cache-metrics.ts`, `packages/core/src/telemetry/cache-metrics.test.ts`

`CacheMetricsRecorder`:

- `record(backendId, hit: boolean, tokensCreated: number, tokensRead: number)` pushes to a ring buffer (capacity 1000, FIFO eviction)
- `getStats(): PromptCacheStats` aggregates the window — `hitRate = hits / (hits + misses)`, breakdown by backend
- `reset()` clears the buffer
- `windowStartedAt` set on first record, reset on `reset()`

Tests:

- empty recorder → hitRate=0, totalRequests=0
- 10 records (7 hits, 3 misses) → hitRate=0.7
- ring buffer overflow at >1000 records evicts oldest
- byBackend breakdown sums correctly across mixed backends

Commit: `feat(telemetry): CacheMetricsRecorder ring-buffer + hitRate (Phase 5 Task 4)`

---

### Task 5: otlp-http.ts exporter

**Depends on:** Task 2 | **Files:** `packages/core/src/telemetry/exporter/otlp-http.ts`

```typescript
interface OTLPExporterOptions {
  endpoint: string; // e.g. http://localhost:4318/v1/traces
  enabled?: boolean; // default true
  headers?: Record<string, string>;
  flushIntervalMs?: number; // default 2000
  batchSize?: number; // default 64
  fetchImpl?: typeof fetch;
}

class OTLPExporter {
  private buffer: TraceSpan[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  push(span: TraceSpan): void; // O(1), no I/O — buffer + maybe trigger flush if batchSize reached
  start(): void; // begin 2 s flush timer
  async stop(): Promise<void>; // flush remaining, clear timer
  private async flush(): Promise<void>; // POST JSON to endpoint, 3-attempt backoff (1s/2s/4s), then drop with console.warn
  private spansToOTLPJSON(spans: TraceSpan[]): unknown; // map TraceSpan[] → OTLP/HTTP JSON envelope
}
```

Key points:

- `push()` is synchronous and never awaits — exporters that block dispatch are out of spec.
- `flush()` runs from the timer; failures retry, then drop. The exporter never queues to disk.
- When `enabled === false`, `push()` is a no-op (constant overhead < 1 µs).
- `spansToOTLPJSON` constructs `{ resourceSpans: [{ resource: {...}, scopeSpans: [{ scope: {name: 'harness'}, spans }] }] }` per OTLP/HTTP v1.0.0 spec.

Run: `pnpm --filter core typecheck`
Commit: `feat(telemetry): OTLPExporter buffer + flush + retry (Phase 5 Task 5)`

---

### Task 6: otlp-http.test.ts with in-process receiver

**Depends on:** Task 5 | **Files:** `packages/core/src/telemetry/exporter/otlp-http.test.ts`

```typescript
function spawnReceiver(): Promise<{ url: string; received: any[]; close: () => Promise<void> }> {
  // node:http server that accepts POST /v1/traces, parses JSON, pushes to received[]
}
```

Tests:

- single span push → flushed within flushIntervalMs → received in receiver
- batchSize=2 push 4 spans → received in batches of 2
- receiver returns 503 thrice → exporter drops + console.warn called once
- exporter.stop() flushes pending buffer before resolving
- enabled=false → push is no-op, nothing arrives
- OTLP JSON envelope shape matches spec (`resourceSpans[0].scopeSpans[0].spans` is the span array)

Run: `pnpm --filter core test --run src/telemetry/exporter/otlp-http.test.ts`
Commit: `test(telemetry): OTLPExporter — 6 TDD tests with in-process receiver (Phase 5 Task 6)`

---

### Task 7: Wire CacheMetricsRecorder into claude.ts

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/agent/backends/claude.ts`

Inject `CacheMetricsRecorder` via the existing backend factory (orchestrator owns the recorder, passes it to claude.ts). After every Anthropic response, call:

```typescript
this.cacheMetrics?.record(
  'anthropic',
  (usage.cache_read_input_tokens ?? 0) > 0,
  usage.cache_creation_input_tokens ?? 0,
  usage.cache_read_input_tokens ?? 0
);
```

Update the backend constructor type and factory to accept an optional `cacheMetrics: CacheMetricsRecorder` (so non-Anthropic backends ignore it).

Run: `pnpm --filter orchestrator typecheck` + claude.ts tests
Commit: `feat(telemetry): record prompt-cache hits in Anthropic backend (Phase 5 Task 7)`

---

### Task 8: harness.config.json schema

**Depends on:** Task 5 | **Files:** `packages/types/src/config.ts` (or wherever the config schema lives), test for the schema.

Add:

```typescript
const TelemetryExportOTLPSchema = z
  .object({
    endpoint: z.string().url(),
    enabled: z.boolean().default(true),
    headers: z.record(z.string(), z.string()).optional(),
    flushIntervalMs: z.number().int().positive().default(2000),
    batchSize: z.number().int().positive().default(64),
  })
  .optional();
```

Slot under `telemetry.export.otlp` in the existing config schema. Test: a config with `telemetry.export.otlp.endpoint = "http://localhost:4318/v1/traces"` parses; missing endpoint when section present → error.

Commit: `feat(types): telemetry.export.otlp config schema (Phase 5 Task 8)`

---

**[checkpoint:human-verify]** Review the exporter behavior before wiring into the orchestrator. Confirm: (1) `push()` is non-blocking, (2) buffer flush is fire-and-forget with 3-attempt retry then drop, (3) OTLP JSON envelope shape matches what a collector expects, (4) `CacheMetricsRecorder` ring buffer correctly evicts oldest at capacity, (5) trajectory builder joins records by sessionId without dropping events. Signal `yes` to continue.

---

### Task 9: signer.ts — exclude telemetry._ from _.\* matches

**Depends on:** none (independent of exporter) | **Files:** `packages/orchestrator/src/gateway/webhooks/signer.ts`, `packages/orchestrator/src/gateway/webhooks/signer.test.ts`

In `eventMatches(subEvents: string[], eventType: string)`:

```typescript
// telemetry.* events are excluded from wildcard *.* by default — operators must opt in explicitly
if (eventType.startsWith('telemetry.')) {
  return subEvents.some((p) => p === 'telemetry.*' || p === eventType);
}
// existing segment-glob logic for non-telemetry events
```

Tests:

- `eventMatches(['*.*'], 'maintenance.completed')` → true (unchanged)
- `eventMatches(['*.*'], 'telemetry.skill_invocation')` → false (new behavior)
- `eventMatches(['telemetry.*'], 'telemetry.skill_invocation')` → true
- `eventMatches(['telemetry.skill_invocation'], 'telemetry.skill_invocation')` → true
- `eventMatches(['telemetry.skill_invocation'], 'telemetry.dispatch_decision')` → false

Run: signer test
Commit: `feat(webhooks): exclude telemetry.* from wildcard subscriptions by default (Phase 5 Task 9)`

---

### Task 10: telemetry fanout module (bus → telemetry.\* GatewayEvents)

**Depends on:** Tasks 5 + 9 | **Files:** `packages/orchestrator/src/gateway/telemetry/fanout.ts`, `packages/orchestrator/src/gateway/telemetry/fanout.test.ts`

`wireTelemetryFanout({ bus, exporter, webhookDelivery, store, cacheMetrics })`:

- Subscribes bus to `maintenance:started`, `maintenance:completed`, `maintenance:error`, `dispatch:decision` (need to confirm event name), `skill_invocation` (or read from adoption file on dispatch boundary)
- For each event: converts to `TraceSpan` and calls `exporter.push(span)`
- ALSO emits a corresponding `GatewayEvent` (e.g. `telemetry.maintenance_run`) onto the webhook delivery for any sub matching `telemetry.*` or the specific topic
- Returns an unsubscribe function

Tests (vi.spyOn exporter.push, webhookDelivery.enqueue):

- Emitting `maintenance:started` triggers one `exporter.push` AND one `webhookDelivery.enqueue` for a sub subscribed to `telemetry.*`
- A sub subscribed only to `*.*` does NOT receive the telemetry event
- traceId/parentSpanId correlation: a `maintenance:started → skill_invocation` sequence produces spans where the second's `parentSpanId === first.spanId` and `traceId` matches

Commit: `feat(telemetry): bus fanout to OTLP exporter + telemetry.* webhook events (Phase 5 Task 10)`

---

### Task 11: GET /api/v1/telemetry/cache/stats route

**Depends on:** Task 4 + Task 7 | **Files:** `packages/orchestrator/src/server/routes/v1/telemetry.ts`, `packages/orchestrator/src/server/routes/v1/telemetry.test.ts`, `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/src/server/v1-bridge-routes.ts`

Handler returns `cacheMetrics.getStats()`. Scope: `read-telemetry`.

Add to `v1-bridge-routes.ts`:

```typescript
{ method: 'GET', pattern: '/api/v1/telemetry/cache/stats', scope: 'read-telemetry' },
```

Thread `cacheMetrics` through `http.ts` deps and into the telemetry route handler.

Run: orchestrator route tests
Commit: `feat(telemetry): GET /api/v1/telemetry/cache/stats endpoint (Phase 5 Task 11)`

---

### Task 12: Dashboard cache widget

**Depends on:** Task 11 | **Files:** `packages/dashboard/src/client/pages/insights/Cache.tsx`, `packages/dashboard/src/client/pages/insights/Cache.test.tsx`, `packages/dashboard/src/client/router.tsx`

`/insights/cache` page:

- Polls `GET /api/v1/telemetry/cache/stats` at 5 s (cache stats move slowly; 1 s feels excessive)
- Renders `hitRate` as a big number, plus a sparkline of last-N samples (client-side state) and a `byBackend` table
- Empty state: "No prompt-cache activity recorded yet"

Wire `/insights/cache` into the dashboard router.

Test: render with mocked stats; verify sparkline + table appear; verify polling cleared on unmount.

Run: dashboard tests
Commit: `feat(dashboard): /insights/cache prompt-cache widget (Phase 5 Task 12)`

---

### Task 13: Integration test — 3 trace kinds + correlation

**Depends on:** Task 10 | **Files:** `packages/orchestrator/tests/integration/telemetry-end-to-end.test.ts`

Spin a temp orchestrator with:

- `CacheMetricsRecorder` injected
- `OTLPExporter` pointing at an in-process receiver
- `WebhookDelivery` with a test subscription on `telemetry.*`

Trigger a fake `maintenance:started` event, then a `skill_invocation` event, then `maintenance:completed`. Assert:

- Receiver got 3 spans
- All three share the same `traceId`
- `skill_invocation` and `dispatch_decision` (if emitted) have `parentSpanId === maintenance_run.spanId`
- The webhook delivery received 3 `telemetry.*` events (verified via the in-memory mock subscriber)

Commit: `test(telemetry): integration — 3 trace kinds + correlation (Phase 5 Task 13)`

---

### Task 14: Latency test — p99 < 5 ms at dispatch

**Depends on:** Task 10 | **Files:** `packages/orchestrator/tests/integration/telemetry-latency.test.ts`

Run 200 mock dispatch operations (a tight loop calling `bus.emit('dispatch:decision', ...)`) with the exporter enabled but pointing at an unreachable endpoint (forces retries — worst case). Measure `performance.now()` per emit. Assert p99 added latency vs baseline (same loop with exporter disabled) is < 5 ms.

Note: this test is deliberately noisy (timing-sensitive) but the budget is 5 ms which is huge for `push() + buffer.push()`. If flaky, mark `.skip` and document; the latency test is exit-gate evidence, not a regression test.

Commit: `test(telemetry): p99 < 5 ms exporter overhead at dispatch (Phase 5 Task 14)`

---

### Task 15: E2E docker smoke (HARNESS_E2E gated)

**Depends on:** Task 10 | **Files:** `packages/orchestrator/tests/e2e/telemetry-otel-collector.e2e.test.ts`, `packages/orchestrator/package.json`

Add `testcontainers` as devDependency: `pnpm add -D testcontainers --filter @harness-engineering/orchestrator`.

Test (wrapped in `describe.skipIf(process.env['HARNESS_E2E'] !== '1', ...)`):

- Spin `otel/opentelemetry-collector-contrib` via testcontainers with a logging exporter pipeline (collector logs received spans to stdout)
- Point our exporter at `localhost:<mapped-port>/v1/traces`
- Push 3 spans
- Assert the collector's container logs contain the trace names

Commit: `test(telemetry): E2E smoke against real otel-collector (HARNESS_E2E gated, Phase 5 Task 15)`

---

### Task 16: Exit gate — orchestrator wiring + docs + ADR + CHANGELOG

**Depends on:** Tasks 1–15 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `docs/knowledge/orchestrator/telemetry-export.md`, `docs/knowledge/orchestrator/webhook-fanout.md`, `docs/knowledge/orchestrator/gateway-api.md`, `docs/knowledge/decisions/0012-telemetry-export-otlp-http.md`, `CHANGELOG.md`

1. In `orchestrator.ts` `start()`: instantiate `CacheMetricsRecorder`, `OTLPExporter` (reading config), call `wireTelemetryFanout(...)`, call `exporter.start()`. In `stop()`: `await exporter.stop()`, clear fanout unsubscribe.

2. New ADR `0012-telemetry-export-otlp-http.md`: decision = OTLP/HTTP JSON hand-rolled exporter; alternatives considered (official SDK, gRPC) + rejection rationale; trace shape commitments; backward-compat strategy.

3. New knowledge doc `telemetry-export.md`: trace kinds, attribute keys (`harness.skill`, `harness.outcome`, etc.), correlation model, OTLP envelope shape, config example.

4. `webhook-fanout.md`: add subsection "Telemetry events on the fanout" — wildcard `*.*` does NOT match `telemetry.*`; operators must opt in.

5. `gateway-api.md`: telemetry section pointing at the knowledge doc + the `/api/v1/telemetry/cache/stats` endpoint.

6. `CHANGELOG.md`: Phase 5 entry covering exporter + trajectory builder + cache widget + telemetry fanout exclusion + ADR 0012.

7. Run full suites:
   - `pnpm --filter orchestrator test --run`
   - `pnpm --filter core test --run`
   - `pnpm --filter dashboard test --run`
   - `pnpm --filter types typecheck` + orchestrator/core/dashboard/cli typecheck
   - `harness validate` + `harness check-deps`

8. Confirm spec exit-gate criteria:
   - OTel collector receives all three trace kinds (Task 13 in-process + Task 15 gated E2E)
   - Spans correlate via traceId/parentSpanId (Task 13)
   - `telemetry.*` events visible on test webhook subscription (Task 10 test)
   - p99 < 5 ms at dispatch (Task 14)
   - Cache widget shows non-zero hit-rate after dogfood run (manual smoke; document in PR description)
   - `*.*` subs don't receive telemetry events (Task 9 + Task 10 tests)

Commit: `feat(telemetry): orchestrator wiring + ADR 0012 + Phase 5 docs (Phase 5 Task 16)`

---

## Checkpoints

| After Task | Type           | Purpose                                                                                                         |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| Task 8     | `human-verify` | Review exporter behavior, cache recorder, trajectory builder before wiring into orchestrator and webhook fanout |

## Skeleton (produced)

```
1.  Types (trajectory + cache + OTLP wire)        (~5 min)
2.  Core exporter types                            (~3 min)
3.  trajectory.ts + tests                          (~6 min)
4.  cache-metrics.ts + tests                       (~5 min)
5.  otlp-http.ts exporter                          (~7 min)
6.  otlp-http.test.ts in-process receiver          (~6 min)
7.  Wire CacheMetricsRecorder into claude.ts       (~4 min)
8.  harness.config.json schema                     (~3 min)
--- checkpoint ---
9.  signer.ts telemetry.* exclusion                (~3 min)
10. Telemetry fanout module                        (~7 min)
11. GET /api/v1/telemetry/cache/stats              (~4 min)
12. Dashboard /insights/cache widget               (~5 min)
13. Integration test (3 trace kinds)               (~5 min)
14. Latency test                                   (~4 min)
15. E2E docker smoke (HARNESS_E2E gated)           (~5 min)
16. Exit gate + docs + ADR 0012                    (~6 min)
```

_Skeleton ready for approval._
