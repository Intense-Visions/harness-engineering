---
schemaVersion: 1
module: 'packages/cli/tests/utils'
sourceHash: '074b8a7cb5c12966d9af4314c38c3936fbb6650aa63dbafc7d71ce84e05673ce'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'concurrency.test.ts',
    'env-flag.test.ts',
    'errors.test.ts',
    'files.test.ts',
    'first-run.test.ts',
    'global-option-propagation.test.ts',
    'guardian-context.test.ts',
    'handle-error.test.ts',
    'output.test.ts',
    'paths.test.ts',
    'version-guard-wiring.test.ts',
    'version-guard.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { _resolveCommandName } from '../../src/bin/command-telemetry'
import { createProgram } from '../../src/index'
import { mapWithConcurrency } from '../../src/utils/concurrency'
import { envEnabled } from '../../src/utils/env-flag'
import { CLIError, ExitCode, formatError, handleError } from '../../src/utils/errors'
import { findFiles } from '../../src/utils/files'
import '../../src/utils/first-run'
import { loadGuardianCoverage } from '../../src/utils/guardian-context'
import { resolveOutputMode } from '../../src/utils/output'
import { resolveAllSkillsDirs, resolveAllSkillsDirsWithSource, resolveCommunitySkillsDir, resolvePersonasDir, resolveSkillDir, resolveSkillsDir, resolveTemplatesDir } from '../../src/utils/paths'
import { ExpectedVersion, GUARDED_COMMANDS, evaluateVersionGuard, findProjectRoot, installVersionGuard, resolveCommandPath, resolveExpectedVersion } from '../../src/utils/version-guard'
import { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION } from '@harness-engineering/intelligence'
import { Command, Option } from 'commander'
import * as fs from 'fs'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
