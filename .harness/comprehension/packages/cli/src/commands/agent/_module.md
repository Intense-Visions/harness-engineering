---
schemaVersion: 1
module: 'packages/cli/src/commands/agent'
sourceHash: '62db7e9e1fbfed1ace98865007e9116f384fa6f920412e8aef950e8794f5668b'
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
import { execSync } from 'child_process'
import * as childProcess from 'child_process'
import { Command } from 'commander'
import * as path from 'path'
```
