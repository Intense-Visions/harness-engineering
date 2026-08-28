---
schemaVersion: 1
module: "packages/orchestrator/tests/e2e"
sourceHash: "0b2a5d1c6b3df0c37219b9b79dfec82fe1b5ddc46ea601f2a2cae5e07b1ec201"
compiledAt: "2026-08-28T01:22:12.564Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["telemetry-otel-collector.e2e.test.ts"]
---

## Summary

`packages/orchestrator/tests/e2e` contains end-to-end telemetry tests that verify wire-compatibility between the orchestrator's OTLP/HTTP exporter and production OpenTelemetry infrastructure. The primary test (`telemetry-otel-collector.e2e.test.ts`) spins up a real `otel/opentelemetry-collector-contrib` container via testcontainers, points our exporter at its `/v1/traces` endpoint, pushes test spans, and validates receipt by grepping container logs. These tests run under Docker and are gated behind `HARNESS_E2E=1` for CI (nightly/pre-release only, not per-PR).

## Invariants

- OTLP/HTTP JSON serialization — spansToOTLPJSON output must match v1.0.0 spec; this is the only layer verifying wire-format against a real collector binary (in-process receiver tests in Task 13 cannot catch spec drift).
- Docker availability required — Tests depend on testcontainers; CI gating prevents failure on headless/sandboxed runners.
- Startup and flush timing — Collector must start within 60s; spans must appear in logs within 30s. Timing accounts for collector's debug exporter buffering and our exporter's flush interval (flushIntervalMs: 250, batchSize: 8).
- Span identity proof — Test validates three specific span names (maintenance_run, skill_invocation, dispatch_decision) appear in logs, not just any trace data. This guards against silent truncation or envelope malformation.
- Cleanup in finally block — Container must stop even if assertions fail, preventing resource leaks and port exhaustion in CI.

## Interface Contract

```ts

```

## Dependency Slice

```
import { OTLPExporter, SpanKind, TraceSpan } from '@harness-engineering/core'
import from 'testcontainers'
import { describe, expect, it } from 'vitest'
```
