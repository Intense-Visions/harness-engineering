---
schemaVersion: 1
module: 'packages/cli/src/spec-craft'
sourceHash: '85440e69f92fd7e633466d82882616ce5940e360a06d84f8a33c914b97a2bd4c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export DiscoveredSpec
export SpecCraftOutput
export SpecFinding
export SpecKind
export collectSpecCraftPrompts
export critiqueSpecFile
export finalizeSpecCraft
export runSpecCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { craftClumpView } from '../shared/craft/findings/clumpable.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_RUBRICS, SpecRubric, rubricApplies } from './catalog/rubrics/index.js'
import { DiscoveredSpec, SpecKind, discoverSpecs } from './extract/discover.js'
import { parseSections } from './extract/sections.js'
import { SpecCraftOutput, SpecFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
```
