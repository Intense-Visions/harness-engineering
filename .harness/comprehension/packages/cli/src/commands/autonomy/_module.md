---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: '98c40e74fd9fad14cc70240a582bd3b346ab44680ee8bebe50481692b67540ee'
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
import { AutoDecision, AutoDecisionSummary, AutonomySessionOverride, AutonomySetting, ResolvedAutonomy, isRaisingChange, readAutoDecisions, renderAutoDecisionSummary, resolveAutonomyForSession, sessionDirForRaise, summarizeAutoDecisions, validateAutonomySetting, writeSessionOverride } from '@harness-engineering/core'
import { Command } from 'commander'
```
