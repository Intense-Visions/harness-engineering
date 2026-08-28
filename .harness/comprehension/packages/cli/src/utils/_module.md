---
schemaVersion: 1
module: 'packages/cli/src/utils'
sourceHash: 'e66cece86d5e273c931ed94a40b9b60df27560b32c289b95b7e0dd29c1c135ac'
compiledAt: '2026-08-28T01:22:09.518Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
