---
schemaVersion: 1
module: 'packages/core/tests/shared'
sourceHash: 'efe9c4d7c51fda4a68999c24164edf953ec7feb26b27321aa2b0a35d065e1c38'
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
    'session-slug.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { validateOverrideSlug } from '../../src/autonomy/paths'
import { DEFAULT_FIND_FILES_IGNORE } from '../../src/index'
import { BaseError, FeedbackError, ValidationError, createError } from '../../src/shared/errors'
import { fileExists, findFiles, readFileContent } from '../../src/shared/fs-utils'
import { WHATWG_BAD_PORTS, assertPortUsable, isBadPort } from '../../src/shared/port'
import { Err, Ok, Result, isErr, isOk } from '../../src/shared/result'
import { sessionSlugError } from '../../src/shared/session-slug'
import { resolveSessionDir } from '../../src/state/session-resolver'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
