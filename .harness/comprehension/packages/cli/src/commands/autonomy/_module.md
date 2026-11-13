---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: 'e6656877e54e59e6abcb5a0e1f75eb54e41de1dbdf7d38e7d618db2ebf50c056'
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
