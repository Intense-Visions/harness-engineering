---
schemaVersion: 1
module: 'packages/core/src/autonomy'
sourceHash: '0234f61bafef526089cbf54c6ed5e9c33dc6fdbac97243906dca7cca56c08ed4'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['paths.ts', 'resolve.ts', 'schema.ts']
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
export resolveAutonomy
export sessionOverridePath
export userConfigPath
export validateOverrideSlug
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { userConfigPath } from './paths'
import { parseUserConfig } from './schema'
import { AutonomyFlag, AutonomyLevel, AutonomyOverrideField, AutonomySessionOverride, AutonomySource, AutonomyUserConfig, DEFAULT_AUTONOMY_AUDIT, ResolvedAutonomy } from '@harness-engineering/types'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
```
