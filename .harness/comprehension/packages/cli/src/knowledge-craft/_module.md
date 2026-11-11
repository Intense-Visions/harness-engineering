---
schemaVersion: 1
module: 'packages/cli/src/knowledge-craft'
sourceHash: 'ec8d6bab2f5c0afcc6dbca05ab168f114597d02279d9cdcda060342949cc5c12'
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
import { clumpCraftFindings } from '../shared/craft/findings/clumpable.js'
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
