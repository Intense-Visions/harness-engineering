---
schemaVersion: 1
module: 'packages/core/tests/autonomy'
sourceHash: '698da72930379cf8effba68947e5f5d15525b79bbaac3848b3f582bd1bd734d1'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['paths.test.ts', 'schema.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { computeRepoKey, harnessHomeDir, sessionOverridePath, userConfigPath, validateOverrideSlug } from '../../src/autonomy/paths'
import { UserConfigSchema, parseSessionOverride, parseUserConfig } from '../../src/autonomy/schema'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
```
