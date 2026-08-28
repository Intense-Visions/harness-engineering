---
schemaVersion: 1
module: 'packages/cli/src/security-craft'
sourceHash: '95235fe18c27ebc89a9a378785b2c93f8f89fd6f883abe0e03cd7c7f0147cbd1'
compiledAt: '2026-08-28T01:22:09.323Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export SecurityCraftOutput
export SecurityFinding
export SecurityRubric
export SecuritySignal
export SignalKind
export collectSecurityCraftPrompts
export critiqueSecurityInFile
export finalizeSecurityCraft
export runSecurityCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_RUBRICS, SecurityRubric, rubricApplies } from './catalog/rubrics/index.js'
import { discoverSourceFiles } from './extract/discover.js'
import { detectSignals } from './extract/signals.js'
import { SecurityCraftOutput, SecurityFinding, SecuritySignal } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
```
