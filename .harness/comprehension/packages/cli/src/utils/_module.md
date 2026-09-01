---
schemaVersion: 1
module: 'packages/cli/src/utils'
sourceHash: '7725781afcf97977b80b91d43a22bd90e0ecf4d548384086d532257c931dd608'
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
export GUARDED_MCP_TOOLS
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
