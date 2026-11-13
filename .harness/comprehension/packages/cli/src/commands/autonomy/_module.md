---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: 'd629f6c674f49cece424d46785b294427a74c4f775a577dc92e9d541e1beaca7'
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
