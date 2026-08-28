---
schemaVersion: 1
module: 'packages/core/src/shared'
sourceHash: '85584bf85ecb9455d97defc03bf2d91ec97629d092872d4c570b31ebcb847d9e'
compiledAt: '2026-08-28T01:22:10.582Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['errors.ts', 'fs-utils.ts', 'llm.ts', 'port.ts', 'result.ts', 'uuid.ts']
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
