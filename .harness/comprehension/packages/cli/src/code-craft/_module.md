---
schemaVersion: 1
module: 'packages/cli/src/code-craft'
sourceHash: '64681d9ff94300471f274b6247428069c21527ba0aa586951aac20f6b7ae7ae9'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export CodeCraftOutput
export CodeExemplar
export CodeFinding
export CodeRubric
export CodeUnit
export SEED_EXEMPLARS
export SEED_RUBRICS
export UnitKind
export collectCodeCraftPrompts
export critiqueCodeInFile
export critiqueNamesInFile
export finalizeCodeCraft
export runCodeCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunState, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js'
import { CodeRubric, SEED_RUBRICS, rubricApplies } from './catalog/rubrics/index.js'
import { discoverSourceFiles } from './extract/discover.js'
import { buildCodeCraftCloneIndex, resolveSiblingEvidence } from './extract/siblings.js'
import { extractUnits } from './extract/units.js'
import { CodeCraftOutput, CodeFinding, CodeUnit } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { CloneClass, CloneIndex, CloneMember } from '@harness-engineering/core'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
```
