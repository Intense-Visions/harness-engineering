---
schemaVersion: 1
module: 'packages/core/src/pulse'
sourceHash: '6f7e0d37e71378eb87ec2c96a4f7b0230956d22c74835e1ed7015add9ef97088'
compiledAt: '2026-08-28T01:22:10.464Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'config-writer.test.ts',
    'config-writer.ts',
    'index.ts',
    'sanitize.test.ts',
    'sanitize.ts',
    'schema.test.ts',
    'schema.ts',
    'strategy-seeder.test.ts',
    'strategy-seeder.ts',
  ]
---

## Summary

The `pulse` module instruments observability data collection for harness projects. It provides a configuration and runtime system for aggregating metrics across multiple data sources (analytics, tracing, payments, databases) and surfacing quality summaries while enforcing strict PII boundaries.

The module is structured around three main concerns:

- **Configuration**: Defines and persists pulse settings (lookback windows, event definitions, source mappings) to `harness.config.json` with atomic writes and idempotent backups.
- **PII enforcement**: Maintains a single-source-of-truth allowlist of field keys and denylist of PII tokens, enforcing them at both schema and prose boundaries.
- **Adapter registry**: Provides a pluggable interface for registering data source adapters (analytics, tracing, etc.) and orchestrating runs across them.

The core entry points are `runPulse()` (execute a collection run), `writePulseConfig()` (persist settings), and `registerPulseAdapter()` (wire up a new data source).

## Invariants

- PII_TOKENS is the single source of truth: both PII_FIELD_DENYLIST (anchored regex for field names) and PII_LINE_RE (word-boundary regex for prose) are derived from this list. Adding a token here automatically propagates to all sanitization boundaries.
- Config atomicity via temp + rename: writePulseConfig() writes to a sibling .tmp-${pid} file before renaming. If the process crashes between write and rename, harness.config.json remains either pre-mutation or post-mutation, never truncated.
- Idempotent .bak preservation: the .bak file is created only if it doesn't already exist. Re-running the config interview doesn't clobber the original pre-pulse config (the useful rollback target).
- Pulse blocks are replaced, not merged: existing pulse: keys are overwritten entirely by writePulseConfig(). Old config keys don't leak through on updates.
- Schema validation before I/O: PulseConfigSchema.parse() is called before any disk writes in writePulseConfig(), preventing corrupt or partially-written files from invalid configs.
- SanitizedResult enforces field-key allowlist: only ALLOWED_FIELD_KEYS are permitted in SanitizedResult.fields. The isSanitizedResult() type guard and assertSanitized() assertion enforce this at runtime.

## Interface Contract

```ts
export ALLOWED_FIELD_KEYS
export MOCK_ADAPTER_NAME
export OrchestratorResult
export PII_FIELD_DENYLIST
export PII_LINE_RE
export PII_TOKENS
export PulseAdapter
export PulseAdapterAlreadyRegisteredError
export PulseConfig
export PulseConfigSchema
export PulseDbSource
export PulseDbSourceSchema
export PulseRunStatus
export PulseRunStatusType
export PulseSources
export PulseSourcesSchema
export PulseWindow
export QualitySummary
export SanitizeFn
export SanitizedResult
export SeedOptions
export StrategySeed
export WritePulseConfigOptions
export assembleReport
export assertSanitized
export clearPulseAdapters
export computeQuality
export computeWindow
export extractHeadlines
export getPulseAdapter
export isSanitizedResult
export listPulseAdapters
export parseLookback
export registerMockAdapter
export registerPulseAdapter
export runPulse
export seedFromStrategy
export writePulseConfig
```

## Dependency Slice

```
import { writePulseConfig } from './config-writer'
import { ALLOWED_FIELD_KEYS, PII_FIELD_DENYLIST, PII_LINE_RE, PII_TOKENS, assertSanitized, isSanitizedResult } from './sanitize'
import { PulseConfigSchema } from './schema'
import { seedFromStrategy } from './strategy-seeder'
import { PulseConfig, SanitizedResult } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
