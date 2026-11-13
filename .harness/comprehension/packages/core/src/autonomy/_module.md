---
schemaVersion: 1
module: 'packages/core/src/autonomy'
sourceHash: '254c776ce93e625aeace644f235a119a95dd51adb771c21e5e0db882dd0f1049'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'index.ts',
    'lower-only.ts',
    'override-store.ts',
    'paths.ts',
    'resolve.ts',
    'schema.ts',
    'session.ts',
  ]
---

## Interface Contract

```ts
export AUTONOMY_AUDIT_ENV
export AUTONOMY_ENV
export AUTONOMY_INVALID_SETTING
export AUTONOMY_OVERRIDE_BUSY
export AUTONOMY_RAISE_REJECTED
export AutonomyInvalidSettingError
export AutonomyLevelSchema
export AutonomyOverrideBusyError
export AutonomyPathOptions
export AutonomyRaiseRejectedError
export AutonomySettingSchema
export OverrideStoreOptions
export ReadOverrideResult
export ResolveAutonomyInput
export ResolveForSessionInput
export SessionOverrideFileSchema
export UserConfigSchema
export computeRepoKey
export harnessHomeDir
export isRaisingChange
export parseSessionOverride
export parseUserConfig
export readSessionOverride
export resolveAutonomy
export resolveAutonomyForSession
export resolveProjectRoot
export sessionOverridePath
export userConfigPath
export validateAutonomySetting
export validateOverrideSlug
export writeLoweringOverride
export writeSessionOverride
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { sessionSlugError } from '../shared/session-slug'
import { OverrideStoreOptions, readSessionOverride, writeSessionOverride } from './override-store'
import { AutonomyPathOptions, sessionOverridePath, userConfigPath } from './paths'
import { ResolveAutonomyInput, resolveAutonomy } from './resolve'
import { parseSessionOverrideFields, parseUserConfig, validateAutonomySetting } from './schema'
import { AutonomyFlag, AutonomyLevel, AutonomyOverrideField, AutonomyOverrideOrigin, AutonomySessionOverride, AutonomySetting, AutonomySource, AutonomyUserConfig, DEFAULT_AUTONOMY_AUDIT, ResolvedAutonomy } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
```
