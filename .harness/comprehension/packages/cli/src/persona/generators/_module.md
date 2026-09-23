---
schemaVersion: 1
module: 'packages/cli/src/persona/generators'
sourceHash: 'f4ee4c1ffe50a728e97ea4f633167e5b6b88a0e1eaab36f051056a5b51e886f8'
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
