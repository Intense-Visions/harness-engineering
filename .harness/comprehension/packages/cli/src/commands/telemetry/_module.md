---
schemaVersion: 1
module: 'packages/cli/src/commands/telemetry'
sourceHash: 'c7fbf529ed0943ec155ef51a8ebfe76986479e71362b89deb49ffdca62416c92'
compiledAt: '2026-08-28T01:22:08.906Z'
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
import from '../../mcp/utils/graph-loader.js'
import { logger } from '../../output/logger'
import { createIdentifyCommand } from './identify'
import { createStatusCommand } from './status'
import { createSynthesizeCommand } from './synthesize'
import { createTestCommand } from './test'
import { getOrCreateInstallId, readIdentity, resolveConsent } from '@harness-engineering/core'
import from '@harness-engineering/intelligence'
import { EffectivenessSection, InsightsReport, SkillInvocationRecord, TELEMETRY_SYNTHESIS_SECTIONS, TelemetrySynthesisSection, UsageRecord } from '@harness-engineering/types'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
