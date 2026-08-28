---
schemaVersion: 1
module: 'packages/cli/tests/output'
sourceHash: '16d1d8b5f86711dc7f61862aa496e87d7d093480436fb168a3e5fd078f026885'
compiledAt: '2026-08-28T01:22:09.822Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['formatter.test.ts', 'logger.test.ts', 'prompt.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { OutputFormatter, OutputMode, parseConventionalMarkdown } from '../../src/output/formatter'
import { logger } from '../../src/output/logger'
import { prompt } from '../../src/output/prompt'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
