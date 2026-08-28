---
schemaVersion: 1
module: 'packages/core/tests/shared'
sourceHash: '5febfc07cfa2865ca86cddc0745a5572f9f60b9af9921256839ab21bf3038793'
compiledAt: '2026-08-28T01:22:11.020Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'errors.test.ts',
    'fs-utils-barrel.test.ts',
    'fs-utils.test.ts',
    'port.test.ts',
    'result.test.ts',
  ]
---

## Summary

packages/core/tests/shared is a test suite validating four core abstractions used across the harness platform: (1) structured Error types with code/message/details/suggestions fields created via createError factory; (2) file system utilities (fileExists, readFileContent, findFiles) wrapped in a Result<T, Error> type with configurable ignore patterns that extend rather than replace defaults; (3) WHATWG fetch-spec port validation to prevent binding to reserved ports; and (4) a discriminated-union Result<T, E> type with type-guard narrowing for safe control flow. The module also validates public constant exports like DEFAULT_FIND_FILES_IGNORE.

## Invariants

- All errors expose code, message, details (object), and suggestions (array); omitted fields default to {} and []
- Result type isOk() and isErr() guards must narrow TypeScript discriminant unions; post-guard access is type-safe
- findFiles(pattern, cwd, extraIgnore) extends default ignores with extraIgnore; defaults (node_modules, dist, build, coverage) must never be clobbered
- First-party dot-directories (.canary, .hbs) are traversed; infrastructure directories (.git, .harness, node_modules) are always excluded regardless of pattern (#1146)
- WHATWG_BAD_PORTS is frozen; callers cannot mutate the list
- assertPortUsable errors must cite the WHATWG fetch spec URL and include actionable guidance; custom labels propagate to error text
- findFiles returns platform-native separators (backslash on Windows); test assertions normalize to / for portability

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
