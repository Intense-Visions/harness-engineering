---
schemaVersion: 1
module: 'packages/core/tests/autonomy'
sourceHash: 'f3a12cee87c1c099370617b0f62e1e939794ba82c5be1ee7478d867eefc550ca'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'decision-log-concurrency.test.ts',
    'decision-log.test.ts',
    'decision-schema.test.ts',
    'lower-only.test.ts',
    'override-store.test.ts',
    'paths.test.ts',
    'raise-audit-log.test.ts',
    'raise-expiry.test.ts',
    'resolve-isolation.test.ts',
    'resolve.test.ts',
    'schema.test.ts',
    'session.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { MAX_AUTO_DECISION_LINE_BYTES, appendAutoDecision, autoDecisionLogPath, readAutoDecisions } from '../../src/autonomy/decision-log'
import { AUTO_DECISION_LIMITS, parseAutoDecisionLine, validateAutoDecisionInput } from '../../src/autonomy/decision-schema'
import { AUTONOMY_SESSION_NOT_FOUND, DEFAULT_RAISE_TTL_MS, autonomyAuditLogPath, computeRepoKey, readSessionOverride, resolveAutonomy, resolveAutonomyForSession, sessionOverridePath, writeLoweringOverride, writeSessionOverride } from '../../src/autonomy/index'
import { AUTONOMY_INVALID_SETTING, AUTONOMY_RAISE_REJECTED, isRaisingChange, writeLoweringOverride } from '../../src/autonomy/lower-only'
import { claimStaleLock, readSessionOverride, releaseOverrideLock, writeSessionOverride } from '../../src/autonomy/override-store'
import { computeRepoKey, harnessHomeDir, resolveProjectRoot, sessionOverridePath, userConfigPath, validateOverrideSlug } from '../../src/autonomy/paths'
import { ResolveAutonomyInput, resolveAutonomy } from '../../src/autonomy/resolve'
import { UserConfigSchema, parseSessionOverride, parseUserConfig, validateAutonomySetting } from '../../src/autonomy/schema'
import { resolveSessionDir } from '../../src/state/session-resolver'
import { AutoDecision, AutonomyLevel, AutonomySessionOverride } from '@harness-engineering/types'
import { execFileSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
