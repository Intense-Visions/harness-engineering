---
schemaVersion: 1
module: 'packages/cli/tests/commands/state'
sourceHash: '031ebad4cd060f4aba218e6cebb2e41535af683fb727f9b28d7350634466f18d'
compiledAt: '2026-08-28T01:22:09.611Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['show.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createShowCommand } from '../../../src/commands/state/show'
import { Command } from 'commander'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
