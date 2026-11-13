---
schemaVersion: 1
module: 'packages/core/src/autonomy'
sourceHash: '3c2cb2fe6bf31b7d1b9cffa062377b2a176a3112d7afc4875856de6a87ad8312'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['paths.ts', 'schema.ts']
---

## Interface Contract

```ts
export AutonomyLevelSchema
export SessionOverrideFileSchema
export UserConfigSchema
export computeRepoKey
export harnessHomeDir
export parseSessionOverride
export parseUserConfig
export sessionOverridePath
export userConfigPath
export validateOverrideSlug
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { AutonomySessionOverride, AutonomyUserConfig } from '@harness-engineering/types'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
```
