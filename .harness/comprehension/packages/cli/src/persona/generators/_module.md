---
schemaVersion: 1
module: 'packages/cli/src/persona/generators'
sourceHash: '882e5170027d5272cfdc25c160774f1def1af12ecb2ec75526b5df45122e573f'
compiledAt: '2026-08-28T01:22:09.308Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['agents-md.ts', 'ci-workflow.ts', 'repo-workflows.ts', 'runtime.ts']
---

## Interface Contract

```ts
export DEFAULT_RENDER_OPTIONS
export PERSONA_WORKFLOW_PREFIX
export checkPersonaWorkflows
export generateAgentsMd
export generateCIWorkflow
export generateRuntime
export getPersonaWorkflowTargets
export renderPersonaWorkflowFile
export resolveWorkflowsDir
export writePersonaWorkflows
```

## Dependency Slice

```
import { toKebabCase } from '../../utils/string'
import { loadPersona } from '../loader'
import { CommandStep, Persona, PersonaTrigger, SkillStep } from '../schema'
import { CIWorkflowOptions, generateCIWorkflow } from './ci-workflow'
import { Err, Ok, Result } from '@harness-engineering/core'
import * as fs from 'fs'
import * as path from 'path'
import YAML from 'yaml'
```
