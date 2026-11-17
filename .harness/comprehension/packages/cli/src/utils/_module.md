---
schemaVersion: 1
module: 'packages/cli/src/utils'
sourceHash: 'a7146429f42268029321106138fadf41ea80354d9c3cd277aae49b231a253618'
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
    'git-ignored.ts',
    'global-option-propagation.ts',
    'guardian-context.ts',
    'json-missing-subcommand.ts',
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
export gitIgnoredExcludeGlobs
export handleError
export installJsonMissingSubcommand
export installRootOptionPropagation
export installVersionGuard
export isFirstRun
export loadGuardianCoverage
export mapWithConcurrency
export markSetupComplete
export missingSubcommandError
export printFirstRunWelcome
export propagateRootOptions
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
import '@harness-engineering/intelligence'
import { ZERO_DENOMINATOR_EXIT_CODE } from '@harness-engineering/types'
import { Command } from 'commander'
import * as fs from 'fs'
import { glob } from 'glob'
import { escape } from 'minimatch'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, parsePath, resolve } from 'node:path'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import semver from 'semver'
import { fileURLToPath } from 'url'
```
