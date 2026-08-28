---
schemaVersion: 1
module: 'packages/cli/src/commands/hooks'
sourceHash: '8525df760e1c0200350fcf3142d420d13253b62f76fec79d8ed35bb01e227744'
compiledAt: '2026-08-28T01:22:08.832Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['add.ts', 'index.ts', 'init.ts', 'list.ts', 'remove.ts', 'run.ts']
---

## Interface Contract

```ts
export createHooksCommand
```

## Dependency Slice

```
import { AgentRetrospectResult, installAgentRetrospectHooks } from '../../hooks/agent-retrospect'
import { HOOK_SCRIPTS, HookProfile, PROFILES } from '../../hooks/profiles'
import { parseCodexNotifyPayload, retrospectLogLine, retrospectSession } from '../../hooks/session-retrospect-core.js'
import { supportFilesFor } from '../../hooks/support-files'
import { logger } from '../../output/logger'
import { createAddCommand } from './add'
import { buildHookCommand, createInitCommand, resolveHookSourceDir, writeHooksModuleMarker } from './init'
import { createListCommand } from './list'
import { createRemoveCommand } from './remove'
import { createRunCommand } from './run'
import { Command } from 'commander'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
```
