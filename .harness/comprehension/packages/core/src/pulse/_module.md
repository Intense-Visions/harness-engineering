---
schemaVersion: 1
module: 'packages/core/src/pulse'
sourceHash: '6f7e0d37e71378eb87ec2c96a4f7b0230956d22c74835e1ed7015add9ef97088'
compiledAt: '2026-08-28T01:22:10.464Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
