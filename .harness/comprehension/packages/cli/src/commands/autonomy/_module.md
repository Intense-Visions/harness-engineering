---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: '4010b0de9403e9598b410d0abdf2206f8a4ca42b46c2e3beb5978dc8374ffc52'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['deps.ts', 'set.ts', 'show.ts']
---

## Interface Contract

```ts
export createAutonomySetCommand
export createAutonomyShowCommand
export defaultIsInteractive
export formatAutonomy
export runAutonomySet
export runAutonomyShow
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { prompt } from '../../output/prompt'
import { AutonomyCliDeps } from './deps'
import { AutonomySessionOverride, AutonomySetting, ResolvedAutonomy, isRaisingChange, resolveAutonomyForSession, writeSessionOverride } from '@harness-engineering/core'
import { Command } from 'commander'
```
