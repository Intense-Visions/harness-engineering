---
schemaVersion: 1
module: 'packages/cli/src/docs-craft'
sourceHash: '7fa11ba31df4bff38ba4081c249af26125455dfcd27cbcbdbc693362f32102e0'
compiledAt: '2026-08-28T01:22:09.132Z'
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
