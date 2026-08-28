---
schemaVersion: 1
module: 'packages/cli/tests/commands/hooks'
sourceHash: '516c9bf9674e699bc3740bb3c454c6c8b7fb1c4f9cc63218daea0eabd2e59b89'
compiledAt: '2026-08-28T01:22:09.601Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['run.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createRunCommand, runHook } from '../../../src/commands/hooks/run'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
