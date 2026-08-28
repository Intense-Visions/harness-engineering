---
schemaVersion: 1
module: 'packages/cli/tests/align/revert'
sourceHash: '388d5769841ffe78e61c5baad8fb6775de01ded7868ae9f2fee6fedfbfef15ea'
compiledAt: '2026-08-28T01:22:09.526Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['inverse.test.ts', 'state.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { FixOutcome } from '../../../src/align/findings/outcome'
import { applyInverse } from '../../../src/align/revert/inverse'
import { LAST_BATCH_PATH, hashContent, loadLastBatch, saveLastBatch } from '../../../src/align/revert/state'
import { DriftFinding } from '../../../src/drift/findings/finding'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
