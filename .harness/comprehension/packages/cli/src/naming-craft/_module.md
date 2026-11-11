---
schemaVersion: 1
module: 'packages/cli/src/naming-craft'
sourceHash: 'aebfd04274755648bae8b08e9cf6532b0b72137162b5d19a03fbc6ee80d3799a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export IdentifierKind
export NamingCraftOutput
export NamingFinding
export ProjectConvention
export collectNamingCraftPrompts
export critiqueNamesInFile
export finalizeNamingCraft
export runNamingCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { craftClumpView } from '../shared/craft/findings/clumpable.js'
import { deleteRunState, loadRunState, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { NamingRubric, SEED_RUBRICS } from './catalog/rubrics/index.js'
import { sampleConventions } from './extract/convention.js'
import { ExtractedIdentifier, extractIdentifiers } from './extract/identifiers.js'
import { IdentifierKind, NamingCraftOutput, NamingFinding, ProjectConvention } from './findings/schema.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from './llm/provider.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
