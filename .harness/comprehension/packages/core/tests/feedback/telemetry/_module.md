---
schemaVersion: 1
module: 'packages/core/tests/feedback/telemetry'
sourceHash: '63f01129043223e6264762c2fb39f25a91e40c2c5a88135c8057d5d30e823f66'
compiledAt: '2026-08-28T01:22:10.849Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['noop.test.ts']
---

## Summary

This test module validates `NoOpTelemetryAdapter`, a null-object implementation of a telemetry backend that returns success responses with empty data. It's used for testing scenarios where no real observability backend is available or needed. The adapter implements a standard interface with `health()`, `getMetrics()`, `getTraces()`, and `getLogs()` methods, each designed to be a safe no-op for integration testing.

## Invariants

- All async methods return { ok: boolean, value?: T } — callers must check .ok before accessing .value
- adapter.name must always be exactly 'noop' — used for service discovery/routing
- health() returns ok: true with available: true — the adapter never reports unavailable
- All data-retrieval methods (getMetrics, getTraces, getLogs) return empty arrays [], never null or undefined
- Methods accept (serviceName: string, timeRange: {start, end}, filters?: T) — optional third param is backward-compatible
- getLogs() accepts but ignores filter params (level, limit, etc.) — filter validation doesn't block calls

## Interface Contract

```ts

```

## Dependency Slice

```
import { NoOpTelemetryAdapter } from '../../../src/feedback/telemetry/noop'
import { describe, expect, it } from 'vitest'
```
