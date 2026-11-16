---
schemaVersion: 1
module: 'packages/cli/src/knowledge-craft'
sourceHash: '76e1f568b914ae1080bc6efe9f4b07f65ddb77499e94f7e13fa93a8bc83605d4'
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
import { resolveScopedFiles } from '../shared/craft/extract/scoped-files.js'
import { craftClumpView } from '../shared/craft/findings/clumpable.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { CraftAbstention, withCraftAbstention } from '../shared/craft/scope.js'
import { KnowledgeRubric, SEED_RUBRICS } from './catalog/rubrics/index.js'
import { DiscoveredEntry, KNOWLEDGE_ROOT, discoverKnowledgeEntries } from './extract/discover.js'
import { KnowledgeCraftOutput, KnowledgeFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
