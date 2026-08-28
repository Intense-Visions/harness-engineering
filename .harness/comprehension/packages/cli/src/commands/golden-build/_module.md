---
schemaVersion: 1
module: 'packages/cli/src/commands/golden-build'
sourceHash: 'a6c2c7c1bfe176e9ec7119a07f4292d791c088ff21693762502a661883ab92a9'
compiledAt: '2026-08-28T01:22:08.812Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'runners.ts']
---

## Interface Contract

```ts
export GoldenCommandOptions
export GoldenPromoteResult
export GoldenVerifyResult
export createGoldenBuildCommand
export runGoldenDiff
export runGoldenPromote
export runGoldenVerify
```

## Dependency Slice

```
import { findConfigFile, loadConfig } from '../../config/loader'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { GoldenVerifyResult, runGoldenDiff, runGoldenPromote, runGoldenVerify } from './runners'
import { Err, GoldenBuildManager, GoldenConfig, GoldenConfigSchema, GoldenDiffResult, GoldenSnapshot, Ok, Result } from '@harness-engineering/core'
import { Command } from 'commander'
import { execSync } from 'node:child_process'
import * as path from 'node:path'
```
