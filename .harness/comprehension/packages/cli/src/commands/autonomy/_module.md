---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: '2d166170df14791f66979b5331c7e905160d6313095c73d8f7fa479cb5a00c7f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['deps.ts', 'index.ts', 'log.ts', 'set.ts', 'show.ts']
---

## Interface Contract

```ts
export createAutonomyCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { confirmYesNo } from '../../output/prompt'
import { AutonomyCliDeps } from './deps'
import { createAutonomyLogCommand } from './log'
import { createAutonomySetCommand } from './set'
import { createAutonomyShowCommand } from './show'
import { AutoDecision, AutoDecisionSummary, AutonomySessionOverride, AutonomySetting, ResolvedAutonomy, isRaisingChange, readAutoDecisions, renderAutoDecisionSummary, resolveAutonomyForSession, sessionDirForRaise, summarizeAutoDecisions, writeSessionOverride } from '@harness-engineering/core'
import { Command } from 'commander'
```
