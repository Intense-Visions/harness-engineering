---
schemaVersion: 1
module: 'packages/core/src/autonomy'
sourceHash: '146208c38d802471c607c939526c4a197ab0d1a8bea6716ef9db3774ef72479f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['override-store.ts', 'paths.ts', 'resolve.ts', 'schema.ts']
---

## Interface Contract

```ts
export AUTONOMY_AUDIT_ENV
export AUTONOMY_ENV
export AutonomyLevelSchema
export SessionOverrideFileSchema
export UserConfigSchema
export computeRepoKey
export harnessHomeDir
export parseSessionOverride
export parseUserConfig
export readSessionOverride
export resolveAutonomy
export sessionOverridePath
export userConfigPath
export validateOverrideSlug
export writeSessionOverride
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { AutonomyPathOptions, sessionOverridePath, userConfigPath } from './paths'
import { parseSessionOverride, parseUserConfig } from './schema'
import { AutonomyFlag, AutonomyLevel, AutonomyOverrideField, AutonomyOverrideOrigin, AutonomySessionOverride, AutonomySetting, AutonomySource, AutonomyUserConfig, DEFAULT_AUTONOMY_AUDIT, ResolvedAutonomy } from '@harness-engineering/types'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
```
