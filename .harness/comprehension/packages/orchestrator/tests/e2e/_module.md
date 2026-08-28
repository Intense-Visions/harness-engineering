---
schemaVersion: 1
module: 'packages/orchestrator/tests/e2e'
sourceHash: '0b2a5d1c6b3df0c37219b9b79dfec82fe1b5ddc46ea601f2a2cae5e07b1ec201'
compiledAt: '2026-08-28T01:22:12.564Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['telemetry-otel-collector.e2e.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { OTLPExporter, SpanKind, TraceSpan } from '@harness-engineering/core'
import from 'testcontainers'
import { describe, expect, it } from 'vitest'
```
