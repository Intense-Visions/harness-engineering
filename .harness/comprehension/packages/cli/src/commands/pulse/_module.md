---
schemaVersion: 1
module: 'packages/cli/src/commands/pulse'
sourceHash: '08fe126c7594ceb70834d9d14766794c7704d7bc74f8ea51aa2af5c87c5b8d3b'
compiledAt: '2026-08-28T01:22:08.852Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'run.ts']
---

## Interface Contract

```ts
export createPulseCommand
```

## Dependency Slice

```
import { createRunCommand } from './run'
import { assembleReport, computeWindow, extractHeadlines, runPulse } from '@harness-engineering/core'
import { PulseConfig, PulseRunStatus } from '@harness-engineering/types'
import { Command } from 'commander'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
```
