---
number: 0012
title: Telemetry export via hand-rolled OTLP/HTTP JSON exporter
date: 2026-05-14
status: accepted
tier: medium
source: docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-5-telemetry-export-plan.md
---

## Context

Hermes Phase 5 ("Telemetry Export") had to deliver an in-tree OpenTelemetry
exporter that publishes three trace kinds (`maintenance_run`,
`skill_invocation`, `dispatch_decision`) to a configurable OTel collector
endpoint, with p99 added dispatch latency under 5 ms. The same trace data also
fans out as `telemetry.*` `GatewayEvent`s on the Phase 4 webhook queue so
operators with an SSE bridge or a webhook subscription can stream it without
needing a separate OTel stack.

Three transports were on the table at planning time:

- **A. Official OpenTelemetry SDK (`@opentelemetry/api` +
  `@opentelemetry/sdk-trace-node` + `@opentelemetry/exporter-trace-otlp-http`).**
  Industry standard. Handles context propagation, batching, retries, gRPC vs
  HTTP, etc.
- **B. Hand-rolled OTLP/HTTP JSON exporter** — direct `fetch()` POSTs to
  `/v1/traces` with the v1.0.0 JSON envelope, built in-tree.
- **C. OTLP/gRPC instead of HTTP.** Slightly lower wire overhead per span,
  but requires a gRPC client (`@grpc/grpc-js`) and protobuf descriptors.

## Decision

We chose **option B — hand-rolled OTLP/HTTP JSON exporter** (`packages/core/src/telemetry/exporter/otlp-http.ts`).

Concrete commitments:

1. The exporter is a single file (~230 LOC) that consumes our internal
   `TraceSpan` shape and emits OTLP/HTTP v1.0.0 JSON envelopes:
   `{ resourceSpans: [{ resource, scopeSpans: [{ scope, spans: [...] }] }] }`.
2. `push(span)` is synchronous and never awaits. It O(1)-buffers the span and
   optionally triggers a fire-and-forget flush when `batchSize` is hit.
3. The buffer flushes on a 2-second timer (default) or when full. On HTTP
   failure (network error or 5xx), the flush retries up to 3 times with
   1 s / 2 s / 4 s backoff, then drops the batch and logs a single
   `console.warn`. Failures do not block producers.
4. `enabled: false` turns `push()` into a constant-time no-op so callers can
   wire the recorder unconditionally without branching on config.
5. Zero new runtime dependencies. The only added devDependency is
   `testcontainers`, used solely by the `HARNESS_E2E`-gated smoke test that
   validates wire compatibility against a real
   `otel/opentelemetry-collector-contrib` container.

## Alternatives Considered

**Option A — official OpenTelemetry SDK.** Rejected because:

- The SDK's runtime footprint (~30+ peer dependencies including
  `@opentelemetry/api`, `@opentelemetry/sdk-trace-base`, several exporters,
  semantic conventions, OTLP transformers) is large compared to the surface
  we actually need. Hermes Phase 0 wants the orchestrator binary to stay
  small and the dependency surface auditable for SSRF/SBOM purposes.
- The OTLP wire format is stable since v1.0.0 (May 2023) and is one of the
  most carefully versioned protocols in the OpenTelemetry project. The risk
  of needing to track SDK changes for our three trace kinds is essentially
  nil.
- We get exactly the producer-side semantics we want — fire-and-forget,
  bounded retries, drop-with-warn — without fighting the SDK's defaults
  (which include disk spool, configurable propagators, etc. we explicitly
  don't want).

**Option C — OTLP/gRPC.** Rejected because:

- Adds `@grpc/grpc-js` (~5 MB) and a protobuf descriptor build step.
- HTTP/JSON is wire-compatible with every collector binary we care about
  (the `otel/opentelemetry-collector-contrib` image accepts both protocols
  on the same port range).
- Wire overhead difference is irrelevant at our span volumes (hundreds per
  hour, not thousands per second).

## Trace Kinds

The orchestrator emits three span types in this phase. Each is a single span
(no nested child spans within the kind); cross-kind correlation uses
`traceId` + `parentSpanId`.

| Span name           | Emitted by                                                                           | Parent?                                     |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- |
| `maintenance_run`   | `maintenance:started` (open) and `maintenance:completed`/`maintenance:error` (close) | Root                                        |
| `skill_invocation`  | `skill_invocation` bus event                                                         | `maintenance_run.spanId` if a run is active |
| `dispatch_decision` | `dispatch:decision` bus event                                                        | `maintenance_run.spanId` if a run is active |

Attribute keys are documented in
[`docs/knowledge/orchestrator/telemetry-export.md`](../orchestrator/telemetry-export.md).

## Backward Compatibility

- `telemetry.export.otlp` is **optional** in `harness.config.json`. Omitting
  it removes the exporter from the dispatch path entirely; existing
  deployments are unaffected.
- The `telemetry.*` `GatewayEvent` topics ride the existing webhook queue but
  are **excluded from `*.*` wildcard subscriptions by default** (ADR-adjacent
  decision, enforced in `signer.eventMatches`). Operators must opt in via
  `events: ['telemetry.*']` or `events: ['telemetry.skill_invocation']`.
  This protects legacy `*.*` consumers (debug-only bridges, test harnesses)
  from sudden span-volume floods after upgrading.
- The exporter is feature-flagged at the config level — `enabled: false`
  preserves the recorder wiring but stops all flushes, with no hot-path
  overhead.

## Consequences

**Positive:**

- Zero new runtime dependencies. Bundle size and SBOM surface unchanged.
- Single-file implementation, easy to audit and modify.
- Producer-side semantics match the spec exactly (fire-and-forget, bounded
  retries, drop-with-warn).
- E2E validated against a real collector via the `HARNESS_E2E`-gated
  testcontainers smoke test (Phase 5 Task 15), so future SDK behavior
  changes cannot drift us silently.

**Negative:**

- If the OTLP spec ever ships a major-version bump that breaks v1.0.0
  compatibility, we have to update `spansToOTLPJSON()` ourselves rather
  than getting it for free from the SDK. The spec has been stable since
  May 2023 and there is no announced v2 timeline, so this risk is
  considered low.
- We do not get OTel context propagation across HTTP requests automatically;
  the orchestrator does not (yet) need to propagate trace context to its
  agent subprocesses, so this is a non-issue today. If we ever do, we will
  thread `traceparent`/`tracestate` headers manually rather than pulling in
  the SDK.

**Followups:**

- Document the OTLP envelope and attribute keys in
  `docs/knowledge/orchestrator/telemetry-export.md` (Phase 5 Task 16).
- Add the gated E2E smoke to nightly CI when the new orchestrator image
  pipeline lands.
