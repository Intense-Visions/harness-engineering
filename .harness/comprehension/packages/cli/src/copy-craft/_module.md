---
schemaVersion: 1
module: 'packages/cli/src/copy-craft'
sourceHash: 'bf5a62d9dd0c20c8152f36aaa81bf0cbe6b2d2459c75061748e38f45ca1c8d9f'
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
