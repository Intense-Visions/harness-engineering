---
schemaVersion: 1
module: 'packages/cli/src/commands/persona'
sourceHash: '80dcde119e9d60613e37c8604f689ab30230f6e77dc1166c81d82d87729d70ee'
compiledAt: '2026-08-28T01:22:08.851Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['generate.ts', 'index.ts', 'list.ts', 'sync-workflows.ts']
---

## Interface Contract

```ts
export createPersonaCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { generateAgentsMd } from '../../persona/generators/agents-md'
import { generateCIWorkflow } from '../../persona/generators/ci-workflow'
import { PersonaWorkflowRenderOptions, checkPersonaWorkflows, resolveWorkflowsDir, writePersonaWorkflows } from '../../persona/generators/repo-workflows'
import { generateRuntime } from '../../persona/generators/runtime'
import { listPersonas, loadPersona } from '../../persona/loader'
import { Persona } from '../../persona/schema'
import { ExitCode } from '../../utils/errors'
import { resolvePersonasDir, resolveProjectPersonasDir } from '../../utils/paths'
import { toKebabCase } from '../../utils/string'
import { createGenerateCommand } from './generate'
import { createListCommand } from './list'
import { createSyncWorkflowsCommand } from './sync-workflows'
import { Command, Option } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
```
