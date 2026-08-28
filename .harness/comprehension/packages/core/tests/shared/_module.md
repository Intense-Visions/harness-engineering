---
schemaVersion: 1
module: 'packages/core/tests/shared'
sourceHash: '5febfc07cfa2865ca86cddc0745a5572f9f60b9af9921256839ab21bf3038793'
compiledAt: '2026-08-28T01:22:11.020Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'errors.test.ts',
    'fs-utils-barrel.test.ts',
    'fs-utils.test.ts',
    'port.test.ts',
    'result.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DEFAULT_FIND_FILES_IGNORE } from '../../src/index'
import { BaseError, FeedbackError, ValidationError, createError } from '../../src/shared/errors'
import { fileExists, findFiles, readFileContent } from '../../src/shared/fs-utils'
import { WHATWG_BAD_PORTS, assertPortUsable, isBadPort } from '../../src/shared/port'
import { Err, Ok, Result, isErr, isOk } from '../../src/shared/result'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
