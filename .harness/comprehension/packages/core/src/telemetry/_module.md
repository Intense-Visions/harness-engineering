---
schemaVersion: 1
module: 'packages/core/src/telemetry'
sourceHash: '41c02937ac6e4b640f60fd3461996f78e5bac6f8b118ad578a306fc430529edc'
compiledAt: '2026-08-28T01:22:10.664Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

Telemetry module provides in-process observability and opt-in event collection for harness skill invocations and prompt-cache performance. Core pieces: CacheMetricsRecorder (hot-path ring buffer tracking cache hits/misses per backend with O(1) record ops), consent resolution (env-var-first hierarchy: DO_NOT_TRACK > HARNESS_TELEMETRY_OPTOUT > config.enabled), persistent install ID (UUIDv4 at .harness/.install-id for anonymous session correlation), identity resolution (fallback: telemetry.json > harness.config.json > git config), event collection (SkillInvocationRecord → TelemetryEvent with OS/Node/harness version enrichment), and pluggable transport (OTLPExporter for structured tracing). All telemetry is opt-in and requires explicit allowed consent before shipping events.

## Invariants

- Consent is discriminated union—pattern-match on allowed:true before accessing installId/identity to prevent opt-out violations
- Install ID is durable and unique per machine at .harness/.install-id, persists across sessions, regenerated only on UUIDv4 parse failure
- Ring buffer eviction is FIFO (oldest first) on capacity overflow; reset() atomically clears buffer and windowStartedAt marker
- CacheMetricsRecorder hot path is O(1) amortized with single allocation per record() call; getStats() scan/aggregate is acceptable off-path
- Consent hierarchy is binding—env vars always override config; no fallback to enabled if DO_NOT_TRACK or HARNESS_TELEMETRY_OPTOUT set
- Identity fields optional but stable—all fallbacks deterministic (telemetry.json > harness.config.json > git), no user prompts; alias sourced from git config, not distinct_id
- collectEvents type signature enforces allowed:true—passing disallowed consent is compile error
- OTLPExporter transport is pluggable abstraction—enables local (Ollama/Codex) or cloud backends without collector rewrites

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
