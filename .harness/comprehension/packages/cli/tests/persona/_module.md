---
schemaVersion: 1
module: 'packages/cli/tests/persona'
sourceHash: '297fa22cdc51bb86809b8caf4a30430f11b2d48999dee1d435acf21bb8050d01'
compiledAt: '2026-08-28T01:22:09.870Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'builtins.test.ts',
    'loader.test.ts',
    'runner.test.ts',
    'schema.test.ts',
    'skill-executor.test.ts',
    'trigger-detector.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { listPersonas, loadPersona } from '../../src/persona/loader'
import { CommandExecutor, SkillExecutor, runPersona } from '../../src/persona/runner'
import { Persona, PersonaSchema } from '../../src/persona/schema'
import { SkillExecutionContext, executeSkill } from '../../src/persona/skill-executor'
import { detectTrigger } from '../../src/persona/trigger-detector'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
