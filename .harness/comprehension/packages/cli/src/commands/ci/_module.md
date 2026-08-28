---
schemaVersion: 1
module: 'packages/cli/src/commands/ci'
sourceHash: '2de5d46aa76b3964b495c6e180d9c482f28ccb42b82295c9e4f0af908d54f852'
compiledAt: '2026-08-28T01:22:08.777Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['check.ts', 'index.ts', 'init.ts', 'notify.ts']
---

## Interface Contract

```ts
export createCICommand
```

## Dependency Slice

```
import { resolveConfig } from '../../config/loader'
import { OutputMode } from '../../output/formatter'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { resolveOutputMode } from '../../utils/output'
import { createCheckCommand } from './check'
import { createInitCommand } from './init'
import { createNotifyCommand } from './notify'
import { CICheckName, CICheckReport, CIFailOnSeverity, CINotifier, CINotifyTarget, CIPlatform, ConstraintStage, Err, GitHubIssuesSyncAdapter, Ok, Result, TrackerSyncConfig, runCIChecks } from '@harness-engineering/core'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
