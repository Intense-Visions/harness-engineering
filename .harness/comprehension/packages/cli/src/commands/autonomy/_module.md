---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: '1fc6b15c96ea6823e80df3f7c1739430511f86a90050e7217665623167a5000f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['deps.ts', 'index.ts', 'set.ts', 'show.ts']
---

## Interface Contract

```ts
export createAutonomyCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { prompt } from '../../output/prompt'
import { AutonomyCliDeps } from './deps'
import { createAutonomySetCommand } from './set'
import { createAutonomyShowCommand } from './show'
import { AutonomySessionOverride, AutonomySetting, ResolvedAutonomy, isRaisingChange, resolveAutonomyForSession, writeSessionOverride } from '@harness-engineering/core'
import { Command } from 'commander'
```
