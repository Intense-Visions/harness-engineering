---
schemaVersion: 1
module: 'packages/cli/tests/design-craft/measurement'
sourceHash: '99834d8d791dffcb793d4c82c4c4def1e6aec86bcf50334de0890faf003675a1'
compiledAt: '2026-08-28T01:22:09.674Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['signal.test.ts', 'usage.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CraftFinding } from '../../../src/design-craft/findings/schema.js'
import { proposeFromRecurringFindings, recordSignalEvent, resetSignalStore } from '../../../src/design-craft/measurement/signal.js'
import { getCatalogStats, recordApply, recordCite, recordTrigger, resetCatalogStats } from '../../../src/design-craft/measurement/usage.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
