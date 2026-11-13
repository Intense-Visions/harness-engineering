---
schemaVersion: 1
module: 'packages/core/tests/autonomy'
sourceHash: '7617fb03012241eeb08a794eb6cd5ff48e3e563915a65e3f75b7d4c70365f9be'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'decision-log-concurrency.test.ts',
    'decision-log-surface.test.ts',
    'decision-log.test.ts',
    'decision-schema.test.ts',
    'lower-only.test.ts',
    'override-store.test.ts',
    'paths.test.ts',
    'raise-audit-log.test.ts',
    'raise-expiry.test.ts',
    'record.test.ts',
    'resolve-isolation.test.ts',
    'resolve.test.ts',
    'schema.test.ts',
    'session.test.ts',
    'summary.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { MAX_AUTO_DECISION_LINE_BYTES, appendAutoDecision, autoDecisionLogPath, readAutoDecisions, recordAutoDecision } from '../../src/autonomy/decision-log'
import { AUTO_DECISION_LIMITS, parseAutoDecisionLine, validateAutoDecisionInput } from '../../src/autonomy/decision-schema'
import { AUTONOMY_SESSION_NOT_FOUND, DEFAULT_RAISE_TTL_MS, autonomyAuditLogPath, computeRepoKey, readSessionOverride, resolveAutonomy, resolveAutonomyForSession, sessionOverridePath, writeLoweringOverride, writeSessionOverride } from '../../src/autonomy/index'
import * as autonomy from '../../src/autonomy/index'
import { AUTONOMY_INVALID_SETTING, AUTONOMY_RAISE_REJECTED, isRaisingChange, writeLoweringOverride } from '../../src/autonomy/lower-only'
import { claimStaleLock, readSessionOverride, releaseOverrideLock, writeSessionOverride } from '../../src/autonomy/override-store'
import { computeRepoKey, harnessHomeDir, resolveProjectRoot, sessionOverridePath, userConfigPath, validateOverrideSlug } from '../../src/autonomy/paths'
import { ResolveAutonomyInput, resolveAutonomy } from '../../src/autonomy/resolve'
import { UserConfigSchema, parseSessionOverride, parseUserConfig, validateAutonomySetting } from '../../src/autonomy/schema'
import { renderAutoDecisionSummary, summarizeAutoDecisions } from '../../src/autonomy/summary'
import { resolveSessionDir } from '../../src/state/session-resolver'
import { AutoDecision, AutonomyLevel, AutonomySessionOverride } from '@harness-engineering/types'
import { execFileSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
