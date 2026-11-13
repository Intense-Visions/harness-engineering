---
schemaVersion: 1
module: 'packages/core/tests/autonomy'
sourceHash: '8d844baad4787ee80c515b145627f45fbc1b1f746d28fe552739f60d774a1edc'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
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
import { AUTONOMY_SESSION_NOT_FOUND, DEFAULT_RAISE_TTL_MS, autonomyAuditLogPath, computeRepoKey, readSessionOverride, resolveAutonomy, resolveAutonomyForSession, sessionOverridePath, writeLoweringOverride, writeSessionOverride } from '../../src/autonomy/index'
import { AUTONOMY_INVALID_SETTING, AUTONOMY_RAISE_REJECTED, isRaisingChange, writeLoweringOverride } from '../../src/autonomy/lower-only'
import { readSessionOverride, writeSessionOverride } from '../../src/autonomy/override-store'
import { computeRepoKey, harnessHomeDir, resolveProjectRoot, sessionOverridePath, userConfigPath, validateOverrideSlug } from '../../src/autonomy/paths'
import { ResolveAutonomyInput, resolveAutonomy } from '../../src/autonomy/resolve'
import { UserConfigSchema, parseSessionOverride, parseUserConfig, validateAutonomySetting } from '../../src/autonomy/schema'
import { AutonomyLevel, AutonomySessionOverride } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
