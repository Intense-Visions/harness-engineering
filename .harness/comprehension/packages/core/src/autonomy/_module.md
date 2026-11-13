---
schemaVersion: 1
module: 'packages/core/src/autonomy'
sourceHash: 'e944bf202d5d6a0a9392779657de79ca5dd72c54a029aad75a2d8052ebcd5206'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'decision-log.ts',
    'decision-schema.ts',
    'index.ts',
    'lower-only.ts',
    'override-store.ts',
    'paths.ts',
    'resolve.ts',
    'schema.ts',
    'session.ts',
    'summary.ts',
  ]
---

## Interface Contract

```ts
export AUTONOMY_AUDIT_ENV
export AUTONOMY_ENV
export AUTONOMY_INVALID_SETTING
export AUTONOMY_OVERRIDE_BUSY
export AUTONOMY_RAISE_REJECTED
export AUTONOMY_SESSION_NOT_FOUND
export AutonomyInvalidSettingError
export AutonomyLevelSchema
export AutonomyOverrideBusyError
export AutonomyPathOptions
export AutonomyRaiseRejectedError
export AutonomySessionNotFoundError
export AutonomySettingSchema
export DEFAULT_RAISE_TTL_MS
export OverrideStoreOptions
export ReadOverrideResult
export ResolveAutonomyInput
export ResolveForSessionInput
export SessionOverrideFileSchema
export UserConfigSchema
export autonomyAuditLogPath
export computeRepoKey
export harnessHomeDir
export isRaisingChange
export parseSessionOverride
export parseUserConfig
export readSessionOverride
export resolveAutonomy
export resolveAutonomyForSession
export resolveProjectRoot
export sessionDirForRaise
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
import { AutoDecisionInvalidError, isUnsafeLogChar, parseAutoDecisionLine, validateAutoDecisionInput } from './decision-schema'
import { OverrideStoreOptions, readSessionOverride, writeSessionOverride } from './override-store'
import { AutonomyPathOptions, autonomyAuditLogPath, computeRepoKey, resolveProjectRoot, sessionDirForRaise, sessionOverridePath, userConfigPath, validateOverrideSlug } from './paths'
import { ResolveAutonomyInput, resolveAutonomy } from './resolve'
import { auditRaises, isRaisingChange, levelRaises, parseSessionOverrideFields, parseUserConfig, validateAutonomySetting } from './schema'
import { ResolveForSessionInput, resolveAutonomyForSession } from './session'
import { AUTONOMY_SOURCES, AUTO_DECISION_PAUSE_CLASSES, AutoDecision, AutoDecisionInput, AutoDecisionSummary, AutonomyFlag, AutonomyLevel, AutonomyOverrideField, AutonomyOverrideOrigin, AutonomySessionOverride, AutonomySetting, AutonomySource, AutonomyUserConfig, DEFAULT_AUTONOMY_AUDIT, ResolvedAutonomy } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
```
