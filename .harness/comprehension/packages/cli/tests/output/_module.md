---
schemaVersion: 1
module: 'packages/cli/tests/output'
sourceHash: 'e16648649de86079bb7db2d4bf2d04478f5f35a903b968291e3f2ad345d0cecc'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['formatter.test.ts', 'logger-json-mode-hook.test.ts', 'logger.test.ts', 'prompt.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createProgram } from '../../src/index'
import { OutputFormatter, OutputMode, parseConventionalMarkdown } from '../../src/output/formatter'
import { logger, setMachineOutput } from '../../src/output/logger'
import { prompt } from '../../src/output/prompt'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
