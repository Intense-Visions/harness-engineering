---
schemaVersion: 1
module: 'packages/cli/src/api-craft'
sourceHash: '8539c73e5cd80267521f2051e6b803d64dfe159d2614896e512ccfeeb3a3ba72'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export API_ROOTS
export ApiCraftOutput
export ApiExemplar
export ApiFinding
export ApiRubric
export ApiSurfaceKind
export DiscoveredApiSurface
export OPENAPI_ROOTS
export SEED_EXEMPLARS
export collectApiCraftPrompts
export critiqueApiSurfaceFile
export finalizeApiCraft
export runApiCraft
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
import { ApiSurfaceKind, SEED_RUBRICS, rubricsForKind } from './catalog/rubrics/index.js'
import { DiscoveredApiSurface, classifyApiSurface, discoverApiSurfaces } from './extract/discover.js'
import { ApiCraftOutput, ApiFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
