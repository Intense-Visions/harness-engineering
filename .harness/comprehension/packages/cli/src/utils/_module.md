---
schemaVersion: 1
module: 'packages/cli/src/utils'
sourceHash: 'e66cece86d5e273c931ed94a40b9b60df27560b32c289b95b7e0dd29c1c135ac'
compiledAt: '2026-08-28T01:22:09.518Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'concurrency.ts',
    'env-flag.ts',
    'errors.ts',
    'files.ts',
    'first-run.ts',
    'guardian-context.ts',
    'node-version.ts',
    'output.ts',
    'paths.ts',
    'string.ts',
    'version-guard.ts',
  ]
---

## Summary

`packages/cli/src/utils` is a foundational support library providing error handling (semantic exit codes), directory discovery and path resolution (walking up to locate `agents/`, `personas/`, `skills/`), concurrency control, file discovery with shared ignore patterns, Node version validation, one-time setup tracking via marker file in `~/.harness/`, and degrade-safe guardian diff-coverage context loading. It bridges framework-level and project-level concerns, distinguishing harness bundled resources from adopter project resources.

## Invariants

- Project vs. harness distinction via null return — resolveProjectSkillsDir() and resolveProjectPersonasDir() return null (not fallback to bundled), preventing adopter projects from accidentally writing to the harness's own bundled skill/persona directories.
- Dual-path fallback for bundled resources — Path resolvers first walk up from \_\_dirname (dev/monorepo), then fall back to dist/ bundled paths (production). This dual-path is required for both monorepo dev and npm-installed harness to work.
- Marker files distinguish framework dirs from code — findUpFrom() uses marker files (e.g., base/template.json for templates/, personas subdir for agents/) to disambiguate actual framework directories from same-named code directories.
- Exit codes are semantic and must be distinct — ExitCode.VALIDATION_FAILED (1), ERROR (2), and ZERO_DENOMINATOR (3) are consumed by gates and CI to distinguish validation issues from runtime errors from 'examined nothing' abstentions.
- Guardian coverage is degrade-safe — loadGuardianCoverage() never throws; missing intelligence package or archives return undefined. Commands that call it must handle undefined and degrade gracefully.
- Concurrency errors don't sink the batch — mapWithConcurrency() places per-task errors in the results array rather than rejecting wholesale, so maintenance sweeps complete even if some items fail.
- First-run setup is CI-aware and idempotent — markSetupComplete() is safe to call repeatedly; printFirstRunWelcome() skips in CI, when --quiet is set, or if marker file exists.

## Interface Contract

```ts
export CLIError
export ExitCode
export GUARDED_COMMANDS
export REQUIRED_NODE_VERSION
export checkNodeVersion
export envEnabled
export evaluateVersionGuard
export findFiles
export findProjectRoot
export findUpFrom
export formatError
export handleError
export installVersionGuard
export isFirstRun
export loadGuardianCoverage
export mapWithConcurrency
export markSetupComplete
export printFirstRunWelcome
export resolveAllSkillsDirs
export resolveAllSkillsDirsWithSource
export resolveCommandPath
export resolveCommunitySkillsDir
export resolveExpectedVersion
export resolveGlobalCommunityBaseDir
export resolveGlobalCommunitySkillsDir
export resolveGlobalSkillsDir
export resolveOutputMode
export resolvePersonasDir
export resolveProjectPersonasDir
export resolveProjectSkillsDir
export resolveSkillDir
export resolveSkillsDir
export resolveTemplatesDir
export toKebabCase
```

## Dependency Slice

```
import { OutputMode, OutputModeType } from '../output/formatter'
import { CLI_VERSION } from '../version'
import { envEnabled } from './env-flag'
import { ExitCode } from './errors'
import { DEFAULT_FIND_FILES_IGNORE } from '@harness-engineering/core'
import from '@harness-engineering/intelligence'
import { Command } from 'commander'
import * as fs from 'fs'
import { glob } from 'glob'
import { existsSync, readFileSync } from 'node:fs'
import * as path, { join, parsePath, resolve } from 'node:path'
import * as os from 'os'
import * as path from 'path'
import semver from 'semver'
import { fileURLToPath } from 'url'
```
