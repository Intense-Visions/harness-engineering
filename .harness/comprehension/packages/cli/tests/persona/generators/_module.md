---
schemaVersion: 1
module: 'packages/cli/tests/persona/generators'
sourceHash: '9503edc637d9e27c9ac21df4474cabfa8915b7739644fc8f52319f0269197a24'
compiledAt: '2026-08-28T01:22:09.867Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['agents-md.test.ts', 'ci-workflow.test.ts', 'repo-workflows.test.ts', 'runtime.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { generateAgentsMd } from '../../../src/persona/generators/agents-md'
import { generateCIWorkflow } from '../../../src/persona/generators/ci-workflow'
import { PERSONA_WORKFLOW_PREFIX, checkPersonaWorkflows, getPersonaWorkflowTargets, renderPersonaWorkflowFile, resolveWorkflowsDir, writePersonaWorkflows } from '../../../src/persona/generators/repo-workflows'
import { generateRuntime } from '../../../src/persona/generators/runtime'
import { Persona } from '../../../src/persona/schema'
import { resolvePersonasDir } from '../../../src/utils/paths'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
```
