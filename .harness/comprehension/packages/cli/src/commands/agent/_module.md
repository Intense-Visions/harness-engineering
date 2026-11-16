---
schemaVersion: 1
module: 'packages/cli/src/commands/agent'
sourceHash: '39cd27dd60e2c70dbbfeb76595a04b2128c3cbd0069ec1d2f12926516d86f624'
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
import { GIT_MAX_BUFFER_BYTES, buildDiffInfo } from '../review-ci'
import { createReviewCommand } from './review'
import { createRunCommand } from './run'
import { AgentType, Err, Ok, Result, ReviewPipelineResult, parseDiff, requestPeerReview, runReviewPipeline } from '@harness-engineering/core'
import { execSync } from 'child_process'
import * as childProcess from 'child_process'
import { Command } from 'commander'
import * as path from 'path'
```
