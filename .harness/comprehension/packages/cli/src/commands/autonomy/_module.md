---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: '41731ab62b643eb5224d9deaffdd0465681a208659199319d1595ad097c3b015'
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
