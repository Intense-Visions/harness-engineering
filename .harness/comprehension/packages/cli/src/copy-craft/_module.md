---
schemaVersion: 1
module: 'packages/cli/src/copy-craft'
sourceHash: '07640a1f8ef949653ce55a6f7023a2ba2c6ec60e4f25266defe9dca9744d8824'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export CopyCraftOutput
export CopyFinding
export CopySurface
export collectCopyCraftPrompts
export critiqueCopyInFile
export finalizeCopyCraft
export runCopyCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { clumpCraftFindings } from '../shared/craft/findings/clumpable.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunStateOrThrow, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { CopyRubric, SEED_RUBRICS, rubricApplies } from './catalog/rubrics/index.js'
import { extractCommits } from './extract/commits.js'
import { extractPRDescriptions } from './extract/pr-descriptions.js'
import { extractFromSource } from './extract/source.js'
import { CopyCraftOutput, CopyFinding, CopySurface, ExtractedCopyItem } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
