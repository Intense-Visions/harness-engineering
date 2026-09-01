---
schemaVersion: 1
module: 'packages/cli/src/commands/ci'
sourceHash: '4afc71a8f7ec95b98612f34190e3f7b5e15a141b04884fee5901455bcf43f6c5'
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
