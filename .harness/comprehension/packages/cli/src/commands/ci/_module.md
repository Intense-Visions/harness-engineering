---
schemaVersion: 1
module: 'packages/cli/src/commands/ci'
sourceHash: 'cd49a0cff42eaa93b52e8d3bfa6aba909f8abcd7a1af0ca011b9f2af2d8f51f8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['check.ts', 'index.ts', 'init.ts', 'notify.test.ts', 'notify.ts']
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
