---
schemaVersion: 1
module: 'packages/cli/src/commands/telemetry'
sourceHash: 'c7fbf529ed0943ec155ef51a8ebfe76986479e71362b89deb49ffdca62416c92'
compiledAt: '2026-08-28T01:22:08.906Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['identify.ts', 'index.ts', 'status.ts', 'synthesize.ts', 'test.ts']
---

## Summary

The telemetry module provides CLI commands for consent/identity management and synthesis reporting. It gates identity access on user consent, delegates core logic to @harness-engineering/core, and composes multi-source reports (adoption, usage, effectiveness) with graceful degradation for missing sources. The synthesis cost totals must match `harness usage` exactly.

## Invariants

- Privacy gating: identity/installId only read when consent allows
- resolveConsent() is the single source of truth for opt-in/out state
- Identity fields are fixed: project, team, alias only
- Synthesis usage records must price exactly as `harness usage` for total fidelity
- Skippable synthesis sections are enumerated in TELEMETRY_SYNTHESIS_SECTIONS
- Each synthesis input (usage, insights, outcomes, effectiveness) can fail independently; failures degrade to null, not hard errors
- Graph store is optional; absent graphs return null without blocking synthesis
- Install ID created once via getOrCreateInstallId() and persisted; rereads reflect creation
- File writes include parent directory creation and trailing newline normalization
- Env opt-out signals: DO_NOT_TRACK=1 and HARNESS_TELEMETRY_OPTOUT=1

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
