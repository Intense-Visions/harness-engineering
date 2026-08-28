---
schemaVersion: 1
module: 'packages/cli/src/commands/agent'
sourceHash: '9c03e8e78b0386067d7f4f3f89a9cf6fa06c3ca8f0cd28762f5169d5634a6b5f'
compiledAt: '2026-08-28T01:22:08.765Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'review.ts', 'run.ts']
---

## Interface Contract

```ts
export createAgentCommand
```

## Dependency Slice

```
import { resolveConfig } from '../../config/loader'
import { OutputMode, OutputModeType } from '../../output/formatter'
import { logger } from '../../output/logger'
import { ALLOWED_PERSONA_COMMANDS } from '../../persona/constants'
import { loadPersona } from '../../persona/loader'
import { CommandExecutor, runPersona } from '../../persona/runner'
import { TriggerContext } from '../../persona/schema'
import { executeSkill } from '../../persona/skill-executor'
import { CLIError, ExitCode } from '../../utils/errors'
import { loadGuardianCoverage } from '../../utils/guardian-context'
import { resolvePersonasDir } from '../../utils/paths'
import { createReviewCommand } from './review'
import { createRunCommand } from './run'
import { AgentType, Err, Ok, Result, ReviewPipelineResult, parseDiff, requestPeerReview, runReviewPipeline } from '@harness-engineering/core'
import * as childProcess, { execSync } from 'child_process'
import { Command } from 'commander'
import * as path from 'path'
```
