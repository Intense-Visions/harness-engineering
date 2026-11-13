---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: '25dbbce9ed12ccf8d0735c06c01037b99c3e75a23566652089ce95436552db8b'
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
