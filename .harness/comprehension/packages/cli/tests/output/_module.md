---
schemaVersion: 1
module: 'packages/cli/tests/output'
sourceHash: 'eaafe5607dcb61b3f33016179476ff6880d48e0b616f6a24caccb700ab73c6a6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'error-json.test.ts',
    'formatter.test.ts',
    'logger-json-mode-hook.test.ts',
    'logger.test.ts',
    'prompt.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createProgram } from '../../src/index'
import { installErrorJsonSerialization, serializeError } from '../../src/output/error-json'
import { OutputFormatter, OutputMode, parseConventionalMarkdown } from '../../src/output/formatter'
import { logger, setMachineOutput } from '../../src/output/logger'
import { prompt } from '../../src/output/prompt'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
