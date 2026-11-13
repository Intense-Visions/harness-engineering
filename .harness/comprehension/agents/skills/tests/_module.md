---
schemaVersion: 1
module: 'agents/skills/tests'
sourceHash: '2ba0be11943e5aef51e938bfcb7888886be368f13bc2e77c7592da46ac80a439'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'fleet-clump-lane-unit.test.ts',
    'fleet-command-gated-lane-isolation.test.ts',
    'harness-compound.test.ts',
    'harness-strategy.test.ts',
    'harness-test-advisor.test.ts',
    'initialize-test-suite-project.test.ts',
    'interaction-channel.test.ts',
    'internal-refs.test.ts',
    'issue-fleet-routes.test.ts',
    'pause-protocol.test.ts',
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
