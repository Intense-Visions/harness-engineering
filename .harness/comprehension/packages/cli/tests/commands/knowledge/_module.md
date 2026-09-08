---
schemaVersion: 1
module: 'packages/cli/tests/commands/knowledge'
sourceHash: 'a973353f298353e320627f376d2c9204a12a5d2cbba3873b15ab9468dabdb514'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['mdl.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createMdlCommand } from '../../../src/commands/knowledge/mdl'
import { captureConsole, runToExit, stubProcessExit } from '../cli-command-harness'
import { Command } from 'commander'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
