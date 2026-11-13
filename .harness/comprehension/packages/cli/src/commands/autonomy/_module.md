---
schemaVersion: 1
module: 'packages/cli/src/commands/autonomy'
sourceHash: '85d4f085b599066583169cac698340a2bb43ee848454bf9428bb58f3f48b6c56'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['deps.ts', 'show.ts']
---

## Interface Contract

```ts
export createAutonomyShowCommand
export formatAutonomy
export runAutonomyShow
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { AutonomyCliDeps } from './deps'
import { ResolvedAutonomy, resolveAutonomyForSession } from '@harness-engineering/core'
import { Command } from 'commander'
```
