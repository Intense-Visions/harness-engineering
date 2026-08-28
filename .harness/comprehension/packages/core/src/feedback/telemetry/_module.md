---
schemaVersion: 1
module: 'packages/core/src/feedback/telemetry'
sourceHash: 'bdf990572021f6189f7d941b71e5925efb332f703176acf50e1d587b81bb26e9'
compiledAt: '2026-08-28T01:22:10.378Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['noop.ts']
---

## Summary

NoOpTelemetryAdapter is a null-object implementation of the TelemetryAdapter interface that serves as a silent fallback when real telemetry is unavailable or disabled. All four methods—health(), getMetrics(), getTraces(), getLogs()—return immediately with empty/success responses, performing no telemetry collection, I/O, or side effects. Useful for testing, development, and dependency injection where telemetry is optional.

## Invariants

- Must implement all four TelemetryAdapter methods (health, getMetrics, getTraces, getLogs); callers assume any adapter has these members.
- All methods return Result wrapping success—never throw, never return error variants. Callers treat noop as 'telemetry present but inactive,' not broken.
- Data-query methods (getMetrics, getTraces, getLogs) return empty arrays [], never null; callers expect iterable results.
- health() reports available: true even when no-op; lets orchestrators trust this adapter won't cause cascading failures; they distinguish noop from broken via adapter type, not health flag.
- Zero async work, network calls, or side effects; safe to substitute into any injection point without altering control flow or observability.
- name property must equal 'noop' for adapter selection and routing logic downstream.

## Interface Contract

```ts
export NoOpTelemetryAdapter
```

## Dependency Slice

```
import { Ok, Result } from '../../shared/result'
import { FeedbackError, LogEntry, Metric, TelemetryAdapter, TelemetryHealth, Trace } from '../types'
```
