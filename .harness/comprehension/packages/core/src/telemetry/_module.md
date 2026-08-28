---
schemaVersion: 1
module: 'packages/core/src/telemetry'
sourceHash: '41c02937ac6e4b640f60fd3461996f78e5bac6f8b118ad578a306fc430529edc'
compiledAt: '2026-08-28T01:22:10.664Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'cache-metrics.test.ts',
    'cache-metrics.ts',
    'collector.ts',
    'consent.ts',
    'index.ts',
    'install-id.ts',
    'trajectory.test.ts',
    'trajectory.ts',
    'transport.ts',
  ]
---

## Interface Contract

```ts
export CacheMetricsRecorder
export CacheMetricsRecorderOptions
export OTLPExporter
export OTLPExporterOptions
export SpanAttributes
export SpanKind
export TraceSpan
export collectEvents
export getOrCreateInstallId
export readIdentity
export resolveConsent
export send
```

## Dependency Slice

```
import { readAdoptionRecords } from '../adoption/reader'
import { VERSION } from '../version'
import { CacheMetricsRecorder } from './cache-metrics'
import { getOrCreateInstallId } from './install-id'
import { TrajectoryBuilder } from './trajectory'
import { AgentEvent, ConsentState, PromptCacheStats, SkillInvocationRecord, TelemetryConfig, TelemetryEvent, TelemetryIdentity, TokenUsage, TrajectoryMetadata } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
