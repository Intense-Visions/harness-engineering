---
schemaVersion: 1
module: 'agents/skills/tests'
sourceHash: '7642e030183591dc97eda5084a4baab4989b3c41f819aabc2815987db74b68dd'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'harness-compound.test.ts',
    'harness-strategy.test.ts',
    'harness-test-advisor.test.ts',
    'initialize-test-suite-project.test.ts',
    'interaction-channel.test.ts',
    'internal-refs.test.ts',
    'issue-fleet-routes.test.ts',
    'platform-parity.test.ts',
    'references.test.ts',
    'schema.test.ts',
    'schema.ts',
    'structure.test.ts',
  ]
---

## Interface Contract

```ts
export ALLOWED_PLATFORMS
export ALLOWED_TRIGGERS
export SkillMetadataSchema
```

## Dependency Slice

```
import { ALLOWED_PLATFORMS, SkillMetadataSchema } from './schema'
import { BEHAVIORAL_REQUIRED_SECTIONS, CompoundLockHeldError, KNOWLEDGE_REQUIRED_SECTIONS, RIGID_SECTIONS, acquireCompoundLock } from '@harness-engineering/core'
import { existsSync, readFileSync } from 'fs'
import { glob } from 'glob'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { dirname, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { z } from 'zod'
```
