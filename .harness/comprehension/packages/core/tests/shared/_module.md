---
schemaVersion: 1
module: 'packages/core/tests/shared'
sourceHash: 'f385399a0f432a89479155155da8362fbb8c0baca1d34e5505e27bac9df9ec9d'
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
    'unsafe-text.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { isUnsafeLogChar } from '../../src/autonomy/decision-schema'
import { validateOverrideSlug } from '../../src/autonomy/paths'
import { DEFAULT_FIND_FILES_IGNORE } from '../../src/index'
import { BaseError, FeedbackError, ValidationError, createError } from '../../src/shared/errors'
import { fileExists, findFiles, readFileContent } from '../../src/shared/fs-utils'
import { WHATWG_BAD_PORTS, assertPortUsable, isBadPort } from '../../src/shared/port'
import { Err, Ok, Result, isErr, isOk } from '../../src/shared/result'
import { sessionSlugError } from '../../src/shared/session-slug'
import { escapeTerminalText, isUnsafeTextChar } from '../../src/shared/unsafe-text'
import { resolveSessionDir } from '../../src/state/session-resolver'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
