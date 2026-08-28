---
schemaVersion: 1
module: 'packages/core/src/shared'
sourceHash: '85584bf85ecb9455d97defc03bf2d91ec97629d092872d4c570b31ebcb847d9e'
compiledAt: '2026-08-28T01:22:10.582Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['errors.ts', 'fs-utils.ts', 'llm.ts', 'port.ts', 'result.ts', 'uuid.ts']
---

## Summary

A cross-cutting utilities module providing standardized error handling, file I/O, LLM service abstraction, port validation, and Result-type aliases for the comprehension core. Five submodules: errors.ts (typed error hierarchy with BaseError contract), fs-utils.ts (file operations + glob with POSIX normalization), llm.ts (LLMService interface + mock), port.ts (WHATWG fetch spec port blocker), and result.ts (re-export from @harness-engineering/types). No domain logic—pure infrastructure.

## Invariants

- Error structure is canonical: all error types inherit BaseError (code + message + details + suggestions); downstream error handlers rely on this contract
- DEFAULT_FIND_FILES_IGNORE must not drift from skipDirGlobs() in @harness-engineering/graph; desync causes false-positive findings from nested node_modules/venv
- findFiles() returns native-separator paths (backslash on Windows); callers must normalize via relativePosix() for comparison/serialization; do NOT normalize in findFiles() itself (dead-code detector relies on native separators)
- WHATWG_BAD_PORTS is immutable and authoritative; binding a server to a bad port causes all fetch() calls to fail silently with 'bad port' error—must assertPortUsable() at startup
- Result type is imported from @harness-engineering/types, not defined locally; do not redefine Result
- generateId() requires Web Crypto API (crypto.randomUUID or getRandomValues); throws if unavailable; callers in non-Node environments must ensure polyfill

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
