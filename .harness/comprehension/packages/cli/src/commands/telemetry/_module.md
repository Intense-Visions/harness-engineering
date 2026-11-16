---
schemaVersion: 1
module: 'packages/cli/src/commands/telemetry'
sourceHash: '2645fab50fede98383cd1abc1317a125c76a5ed8b7e0816b672f6b525b36ef7f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['identify.ts', 'index.ts', 'status.ts', 'synthesize.ts', 'test.ts']
---

## Interface Contract

```ts
export createTelemetryCommand
```

## Dependency Slice

```
import { POSTHOG_API_KEY } from '../../bin/command-telemetry'
import '../../mcp/utils/graph-loader.js'
import { logger } from '../../output/logger'
import { resolveInsightsEntropyGatherer } from '../../shared/insights-entropy'
import { createIdentifyCommand } from './identify'
import { createStatusCommand } from './status'
import { createSynthesizeCommand } from './synthesize'
import { createTestCommand } from './test'
import { getOrCreateInstallId, readIdentity, resolveConsent } from '@harness-engineering/core'
import '@harness-engineering/intelligence'
import { EffectivenessSection, InsightsReport, SkillInvocationRecord, TELEMETRY_SYNTHESIS_SECTIONS, TelemetrySynthesisSection, UsageRecord } from '@harness-engineering/types'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
