---
schemaVersion: 1
module: 'packages/cli/src/knowledge-craft'
sourceHash: '75d7b22bc78e8901347f5810f163e404c672e90cf3ddf856520773f998500af3'
compiledAt: '2026-08-28T01:22:09.228Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export DiscoveredEntry
export KnowledgeCraftOutput
export KnowledgeFinding
export KnowledgeRubric
export collectKnowledgeCraftPrompts
export critiqueKnowledgeFile
export finalizeKnowledgeCraft
export runKnowledgeCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { KnowledgeRubric, SEED_RUBRICS } from './catalog/rubrics/index.js'
import { DiscoveredEntry, KNOWLEDGE_ROOT, discoverKnowledgeEntries } from './extract/discover.js'
import { KnowledgeCraftOutput, KnowledgeFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
