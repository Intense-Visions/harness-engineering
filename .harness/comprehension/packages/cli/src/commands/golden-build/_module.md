---
schemaVersion: 1
module: 'packages/cli/src/commands/golden-build'
sourceHash: '869aa2a1912d9e6594ae99889488ceda37a3032d586a2cc9fdc2812da5f62f86'
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
import { resolveProject } from '../../config/loader'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { GoldenVerifyResult, runGoldenDiff, runGoldenPromote, runGoldenVerify } from './runners'
import { Err, GoldenBuildManager, GoldenConfig, GoldenConfigSchema, GoldenDiffResult, GoldenSnapshot, Ok, Result } from '@harness-engineering/core'
import chalk from 'chalk'
import { Command } from 'commander'
import { execSync } from 'node:child_process'
```
