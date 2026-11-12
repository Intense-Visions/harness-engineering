---
schemaVersion: 1
module: 'packages/cli/src/docs-craft'
sourceHash: 'd657c9a86247fd6abb8bf32b29bc5e85e407695b2c835a399b6cf77cc408f9c3'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export DOCS_ROOT
export DiscoveredDoc
export DocKind
export DocsCraftOutput
export DocsExemplar
export DocsFinding
export DocsRubric
export SEED_EXEMPLARS
export collectDocsCraftPrompts
export critiqueDocFile
export finalizeDocsCraft
export runDocsCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { craftClumpView } from '../shared/craft/findings/clumpable.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js'
import { DocKind, SEED_RUBRICS, rubricsForKind } from './catalog/rubrics/index.js'
import { DiscoveredDoc, classifyDoc, discoverDocs } from './extract/discover.js'
import { DocsCraftOutput, DocsFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
