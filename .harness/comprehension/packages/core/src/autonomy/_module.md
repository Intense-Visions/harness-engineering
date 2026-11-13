---
schemaVersion: 1
module: 'packages/core/src/autonomy'
sourceHash: '92034a332fedc0f625b9cd5d9d8eaf2f4d8b40e642c75acb625c8a766778063f'
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
export AUTO_DECISIONS_FILE
export AUTO_DECISION_INVALID
export AUTO_DECISION_LIMITS
export AUTO_DECISION_NOT_AUTHORIZED
export AUTO_DECISION_SESSION_NOT_FOUND
export AUTO_DECISION_WRITE_FAILED
export AutoDecisionAuditSchema
export AutoDecisionInputSchema
export AutoDecisionInvalidError
export AutoDecisionLogRead
export AutoDecisionNotAuthorizedError
export AutoDecisionSchema
export AutoDecisionSessionNotFoundError
export AutoDecisionWriteFailedError
export AutonomyInvalidSettingError
export AutonomyLevelSchema
export AutonomyOverrideBusyError
export AutonomyPathOptions
export AutonomyRaiseRejectedError
export AutonomySessionNotFoundError
export AutonomySettingSchema
export DEFAULT_RAISE_TTL_MS
export MAX_AUTO_DECISION_LINE_BYTES
export OverrideStoreOptions
export ReadAutoDecisionsOptions
export ReadOverrideResult
export RecordAutoDecisionOptions
export RenderAutoDecisionOptions
export ResolveAutonomyInput
export ResolveForSessionInput
export SessionOverrideFileSchema
export UserConfigSchema
export autoDecisionLogPath
export autonomyAuditLogPath
export computeRepoKey
export harnessHomeDir
export isRaisingChange
export parseAutoDecisionLine
export parseSessionOverride
export parseUserConfig
export readAutoDecisions
export readSessionOverride
export recordAutoDecision
export renderAutoDecisionSummary
export resolveAutonomy
export resolveAutonomyForSession
export resolveProjectRoot
export sessionDirForRaise
export sessionOverridePath
export summarizeAutoDecisions
export userConfigPath
export validateAutoDecisionInput
export validateAutonomySetting
export validateOverrideSlug
export writeLoweringOverride
export writeSessionOverride
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { sessionSlugError } from '../shared/session-slug'
import { AutoDecisionInvalidError, escapeUnsafeLogText, isUnsafeLogChar, parseAutoDecisionLine, validateAutoDecisionInput } from './decision-schema'
import { OverrideStoreOptions, readSessionOverride, writeSessionOverride } from './override-store'
import { AutonomyPathOptions, autonomyAuditLogPath, computeRepoKey, isDirectory, sessionDirForRaise, sessionDirPath, sessionOverridePath, userConfigPath, validateOverrideSlug } from './paths'
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
