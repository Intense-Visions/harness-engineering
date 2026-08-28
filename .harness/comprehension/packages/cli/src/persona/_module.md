---
schemaVersion: 1
module: 'packages/cli/src/persona'
sourceHash: '046a299af5952bd28f182581de517abec99bd4a1690b6f02c2d87fb834320ad1'
compiledAt: '2026-08-28T01:22:09.312Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'constants.ts',
    'loader.ts',
    'runner.ts',
    'schema.ts',
    'skill-executor.ts',
    'trigger-detector.ts',
  ]
---

## Interface Contract

```ts
export ALLOWED_PERSONA_COMMANDS
export CommandStepSchema
export PersonaConfigSchema
export PersonaOutputsSchema
export PersonaSchema
export PersonaTriggerSchema
export SkillStepSchema
export StepSchema
export TriggerContextSchema
export detectTrigger
export executeSkill
export listPersonas
export loadPersona
export runPersona
```

## Dependency Slice

```
import { SkillMetadataSchema } from '../skill/schema'
import { resolveSkillsDir } from '../utils/paths'
import { Persona, PersonaSchema, Step, TriggerContext } from './schema'
import { SkillExecutionContext, SkillExecutionResult } from './skill-executor'
import { HandoffContext, detectTrigger } from './trigger-detector'
import { Err, Ok, Result } from '@harness-engineering/core'
import * as fs from 'fs'
import { setTimeout } from 'node:timers'
import * as path from 'path'
import YAML, { parse } from 'yaml'
import { z } from 'zod'
```
