---
schemaVersion: 1
module: 'packages/cli/src/security-craft'
sourceHash: '24b84f7f4880deabc5db138f7d5671a0dfd28e008a2abbcc063a35aeca482c7c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export SecurityCraftAbstention
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
import { resolveScopedFiles } from '../shared/craft/extract/scoped-files.js'
import { craftClumpView } from '../shared/craft/findings/clumpable.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_RUBRICS, SecurityRubric, rubricApplies } from './catalog/rubrics/index.js'
import { discoverSourceFiles } from './extract/discover.js'
import { detectSignals } from './extract/signals.js'
import { SecurityCraftAbstention, SecurityCraftOutput, SecurityFinding, SecuritySignal } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
```
