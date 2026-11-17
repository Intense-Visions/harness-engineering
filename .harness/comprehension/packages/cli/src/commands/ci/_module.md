---
schemaVersion: 1
module: 'packages/cli/src/commands/ci'
sourceHash: '59fbe7a0e53c581cdcbf40954ae7d9d8e649f8e1f63657c62fdb06eb5c008824'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['attribute-failure.ts', 'check.ts', 'index.ts', 'init.ts', 'notify.test.ts', 'notify.ts']
---

## Interface Contract

```ts
export createCICommand
```

## Dependency Slice

```
import { AttributeFailureError, AttributeFailureReport, GhRunner, JobAttribution, attributePrFailure, execGh } from '../../ci/attribute-failure'
import { resolveConfig, resolveProject } from '../../config/loader'
import { OutputMode } from '../../output/formatter'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { resolveOutputMode } from '../../utils/output'
import { createAttributeFailureCommand } from './attribute-failure'
import { createCheckCommand } from './check'
import { createInitCommand } from './init'
import { createNotifyCommand } from './notify'
import { CICheckName, CICheckReport, CIFailOnSeverity, CINotifier, CINotifyTarget, CIPlatform, ConstraintStage, Err, GitHubIssuesSyncAdapter, Ok, Result, TrackerSyncConfig, runCIChecks } from '@harness-engineering/core'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
