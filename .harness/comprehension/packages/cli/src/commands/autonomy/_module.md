---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: '8e9caa9711c75161c48f5cc94ac4dc27c3b7eefbee9612c5b4be50720c117d1e'
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
import { AutonomySessionOverride, AutonomySetting, ResolvedAutonomy, isRaisingChange, resolveAutonomyForSession, sessionDirForRaise, writeSessionOverride } from '@harness-engineering/core'
import { Command } from 'commander'
```
