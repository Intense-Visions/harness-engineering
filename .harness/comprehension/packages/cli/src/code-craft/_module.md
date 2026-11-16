---
schemaVersion: 1
module: 'packages/cli/src/code-craft'
sourceHash: '69a08452aeabe21d75856c25c6326b725c13a67f7c20f76e93ca9d8de88ffb22'
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
export SiblingIndexOutcome
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
import { resolveScopedFiles } from '../shared/craft/extract/scoped-files.js'
import { craftClumpView } from '../shared/craft/findings/clumpable.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunState, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { CraftAbstention, withCraftAbstention } from '../shared/craft/scope.js'
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js'
import { CodeRubric, SEED_RUBRICS, rubricApplies } from './catalog/rubrics/index.js'
import { discoverSourceFiles } from './extract/discover.js'
import { CloneIndexBuildOutcome, buildCodeCraftCloneIndexOutcome, resolveSiblingEvidence } from './extract/siblings.js'
import { extractCodeUnits } from './extract/units.js'
import { CodeCraftOutput, CodeFinding, CodeUnit, SiblingIndexOutcome } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { CloneClass, CloneIndex, CloneMember } from '@harness-engineering/core'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
```
