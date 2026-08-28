---
schemaVersion: 1
module: 'packages/core/src/pulse/run'
sourceHash: '26b08ec7e2688b31807263a42db346ae5e49007c10c737e3646148cfff9535e8'
compiledAt: '2026-08-28T01:22:10.460Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
