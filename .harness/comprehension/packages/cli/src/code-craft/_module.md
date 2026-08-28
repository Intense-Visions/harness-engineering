---
schemaVersion: 1
module: 'packages/cli/src/code-craft'
sourceHash: 'e633b351d55b1f2b20d5bc3be281863a11690165b23762fadf082013f734e90c'
compiledAt: '2026-08-28T01:22:08.755Z'
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
import { extractUnits } from './extract/units.js'
import { CodeCraftOutput, CodeFinding, CodeUnit } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
```
