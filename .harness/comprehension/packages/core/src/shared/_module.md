---
schemaVersion: 1
module: 'packages/core/src/shared'
sourceHash: '1c99fc38b995f9f45294dbe086fd038fab88fa44b6e23b7a9c72b09893adc9a8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['errors.ts', 'fs-utils.ts', 'llm.ts', 'port.ts', 'result.ts', 'session-slug.ts', 'uuid.ts']
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
export fileExists
export findFiles
export generateId
export isBadPort
export isErr
export isOk
export llmService
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
