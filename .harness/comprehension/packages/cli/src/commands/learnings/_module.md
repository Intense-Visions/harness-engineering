---
schemaVersion: 1
module: 'packages/cli/src/commands/learnings'
sourceHash: 'd5e7f43dea4fb0c667a618380a98c825674b4f9c502392cea809f136b63784da'
compiledAt: '2026-08-28T01:22:08.846Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'prune.ts']
---

## Interface Contract

```ts
export createLearningsCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { ExitCode } from '../../utils/errors'
import { createPruneCommand } from './prune'
import { pruneLearnings } from '@harness-engineering/core'
import { Command } from 'commander'
import * as path from 'path'
```
