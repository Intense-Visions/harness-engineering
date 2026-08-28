---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/extract'
sourceHash: 'dc10f86588aaf6c211c0af23ac2805edfded4328e9416da4f6eafd9b01e82902'
compiledAt: '2026-08-28T01:22:08.750Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['discover.ts']
---

## Interface Contract

```ts
export COMMAND_ROOTS
export DEFAULT_EXCLUDED_DIRS
export classifyCommand
export discoverCommands
export isNonCommandFile
```

## Dependency Slice

```
import { CommandKind } from '../catalog/rubrics/types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
