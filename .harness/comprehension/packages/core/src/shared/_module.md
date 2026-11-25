---
schemaVersion: 1
module: 'packages/core/src/shared'
sourceHash: '7ba3e19d45ca90423d10f2b43746fab661a98d94bc59e0decbf077c2d31f2e47'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'errors.ts',
    'fs-utils.ts',
    'llm.ts',
    'port.ts',
    'result.ts',
    'review-paths.ts',
    'session-slug.ts',
    'unsafe-text.ts',
    'uuid.ts',
  ]
---

## Interface Contract

```ts
export DEFAULT_FIND_FILES_IGNORE
export Err
export MockLLMService
export Ok
export Result
export WHATWG_BAD_PORTS
export assertPortUsable
export createEntropyError
export createError
export escapeUnsafeText
export fileExists
export findFiles
export generateId
export isBadPort
export isErr
export isOk
export isUnsafeTextChar
export llmService
export normalizeReviewPath
export pathEscapes
export readFileContent
export relativePosix
export sessionSlugError
```

## Dependency Slice

```
import { Err, Ok, Result } from './result'
import { skipDirGlobs } from '@harness-engineering/graph'
import { access, constants, readFile } from 'fs'
import { glob } from 'glob'
import { relative } from 'node:path'
import { promisify } from 'util'
```
