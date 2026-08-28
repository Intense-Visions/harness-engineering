---
schemaVersion: 1
module: 'packages/cli/tests/commands/persona'
sourceHash: '95ab7a34a7887919a7bcd16101fb8a0484e19d35ed284f63e3259741f40c93f2'
compiledAt: '2026-08-28T01:22:09.606Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['generate.test.ts', 'sync-workflows.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createGenerateCommand } from '../../../src/commands/persona/generate'
import { createSyncWorkflowsCommand } from '../../../src/commands/persona/sync-workflows'
import { logger } from '../../../src/output/logger'
import { generateAgentsMd } from '../../../src/persona/generators/agents-md'
import { generateCIWorkflow } from '../../../src/persona/generators/ci-workflow'
import { checkPersonaWorkflows, writePersonaWorkflows } from '../../../src/persona/generators/repo-workflows'
import { generateRuntime } from '../../../src/persona/generators/runtime'
import { loadPersona } from '../../../src/persona/loader'
import { resolveProjectPersonasDir } from '../../../src/utils/paths'
import { Command } from 'commander'
import from 'fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
