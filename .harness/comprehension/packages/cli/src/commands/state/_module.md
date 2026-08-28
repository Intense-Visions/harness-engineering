---
schemaVersion: 1
module: 'packages/cli/src/commands/state'
sourceHash: 'e728fd0f32f41151cc1ad15a3ecbf8b0a0280ac22b09b0bcd10a50fe625ab6d4'
compiledAt: '2026-08-28T01:22:08.893Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'learn.ts', 'reset.test.ts', 'reset.ts', 'show.ts', 'streams.ts']
---

## Interface Contract

```ts
export createStateCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { readHarnessState } from '../../shared/state-events'
import { ExitCode } from '../../utils/errors'
import { createLearnCommand } from './learn'
import { createResetCommand } from './reset'
import { createShowCommand } from './show'
import { createStreamsCommand } from './streams'
import { HarnessState, appendLearning, archiveStream, createStream, eventSourcing, listStreams, loadStreamIndex, setActiveStream } from '@harness-engineering/core'
import { Command } from 'commander'
import * as path from 'path'
import * as readline from 'readline'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
