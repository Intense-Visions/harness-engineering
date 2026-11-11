---
schemaVersion: 1
module: 'packages/cli/src/security-craft'
sourceHash: 'e2dcfbd14c2113d9f4feb177c0aaa305f801604fa990ae60e7c2fcd9340377e0'
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
import { clumpCraftFindings } from '../shared/craft/findings/clumpable.js'
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
