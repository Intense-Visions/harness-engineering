---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: '78bd58a9eec0f021caf64f4d85a07f52dd71954ea44e9fa65bb46afbce1d71e9'
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
import { confirmYesNo } from '../../output/prompt'
import { AutonomyCliDeps } from './deps'
import { createAutonomySetCommand } from './set'
import { createAutonomyShowCommand } from './show'
import { AutonomySessionOverride, AutonomySetting, ResolvedAutonomy, isRaisingChange, resolveAutonomyForSession, sessionDirForRaise, writeSessionOverride } from '@harness-engineering/core'
import { Command } from 'commander'
```
