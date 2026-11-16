---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft'
sourceHash: 'd199442efbcb90e19578c7d794b850e535d3b3e610c6b3943ef3ed60014a4441'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export COMMAND_ROOTS
export CliErgonomicsCraftOutput
export CliErgonomicsFinding
export CliExemplar
export CliRubric
export CommandKind
export DiscoveredCommand
export SEED_EXEMPLARS
export collectCliErgonomicsCraftPrompts
export critiqueCommandFile
export finalizeCliErgonomicsCraft
export runCliErgonomicsCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { resolveScopedFiles } from '../shared/craft/extract/scoped-files.js'
import { craftClumpView } from '../shared/craft/findings/clumpable.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunState, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { CraftAbstention, withCraftAbstention } from '../shared/craft/scope.js'
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js'
import { CommandKind, SEED_RUBRICS, rubricsForKind } from './catalog/rubrics/index.js'
import { DiscoveredCommand, classifyCommand, discoverCommands } from './extract/discover.js'
import { CliErgonomicsCraftOutput, CliErgonomicsFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
