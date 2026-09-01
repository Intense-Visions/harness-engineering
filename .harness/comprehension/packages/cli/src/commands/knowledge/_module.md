---
schemaVersion: 1
module: 'packages/cli/src/commands/knowledge'
sourceHash: '9a6db4e9216156da7e4524e0804a86abb9d8f7ba25e33f1e18dac3b1a418f159'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'mdl.ts']
---

## Interface Contract

```ts
export createKnowledgeCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { ExitCode } from '../../utils/errors'
import { createMdlCommand } from './mdl'
import { DEFAULT_MDL_CONFIG, InclusionEvent, KnowledgeEntry, MdlReport, RunOutcome, buildKnowledgeEntriesFromLearnings, buildMdlReport, loadRelevantLearnings } from '@harness-engineering/core'
import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
```
