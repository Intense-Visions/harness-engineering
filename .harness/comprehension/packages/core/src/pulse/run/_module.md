---
schemaVersion: 1
module: 'packages/core/src/pulse/run'
sourceHash: '26b08ec7e2688b31807263a42db346ae5e49007c10c737e3646148cfff9535e8'
compiledAt: '2026-08-28T01:22:10.460Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'index.ts',
    'orchestrator.test.ts',
    'orchestrator.ts',
    'report.test.ts',
    'report.ts',
    'window.test.ts',
    'window.ts',
  ]
---

## Summary

The `packages/core/src/pulse/run` module orchestrates parallel and serial queries across heterogeneous data sources (analytics, tracing, payments, database) for observability and quality signals. It dispatches each source to a registered adapter (query + sanitize pair), runs analytics/tracing/payments concurrently and database serially to avoid contention, and wraps every adapter call with mandatory PII sanitization validation. All failures (missing adapter, PII violation, query error) are captured as discriminated SkipRecords without throwing, enabling partial results. When enabled, it aggregates a configured quality dimension's distribution across successful sources into a QualitySummary. The module also exports time-window computation and result formatting utilities.

## Invariants

- Mandatory re-validation at PII boundary: adapter.sanitize() output must pass assertSanitized() even after type declaration. Sanitization failure → pii-violation skip, not transport error. Only SkipKind warranting alerts.
- Execution parallelism shape: analytics ∥ tracing ∥ payments, then serial DB. Preserving this ordering is required for performance (avoid DB contention) and cost control.
- No-throw contract: adapter failures are always captured and returned as SkipRecord entries. Function never rejects; callers always receive valid OrchestratorResult with sourcesSkipped array.
- Quality aggregation is silent when empty: if no source reports the configured qualityDimension, result carries { total: 0, sources: 0 } rather than undefined. Callers must check total to detect no-data.
- Adapter registry is sole resolution path: sources are looked up via getPulseAdapter(name) from global registry. Missing adapters recorded as no-adapter skips. Hardcoding adapters breaks composability.
- Sanitization contract: all adapters must return { fields, distributions } where distributions is Record<string, Record<string, number>>. Orchestrator enforces shape via assertSanitized().

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { clearPulseAdapters, getPulseAdapter, registerPulseAdapter } from '../adapters/registry'
import { PII_LINE_RE, assertSanitized } from '../sanitize'
import { OrchestratorResult, runPulse } from './orchestrator'
import { INLINE_TEMPLATE, assembleReport, extractHeadlines } from './report'
import { computeWindow, parseLookback } from './window'
import { PulseConfig, PulseWindow, SanitizedResult } from '@harness-engineering/types'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
```
