---
schemaVersion: 1
module: 'packages/core/tests/autonomy'
sourceHash: '1ce4bf908365459f3f6297ddcdb45bfb3625c949bda0ea58129ae51e9d0f02b4'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['paths.test.ts', 'resolve.test.ts', 'schema.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { computeRepoKey, harnessHomeDir, sessionOverridePath, userConfigPath, validateOverrideSlug } from '../../src/autonomy/paths'
import { ResolveAutonomyInput, resolveAutonomy } from '../../src/autonomy/resolve'
import { UserConfigSchema, parseSessionOverride, parseUserConfig } from '../../src/autonomy/schema'
import { AutonomyLevel, AutonomySessionOverride } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
```
