---
schemaVersion: 1
module: 'packages/cli/src/commands/golden-build'
sourceHash: '987cfd4f9018437127dc3265e4ea45b0a58ca7995f1e990ed44c6046eb06683f'
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
import { Command } from 'commander'
import { execSync } from 'node:child_process'
```
