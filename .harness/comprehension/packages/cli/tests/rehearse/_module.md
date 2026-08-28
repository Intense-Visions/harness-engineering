---
schemaVersion: 1
module: 'packages/cli/tests/rehearse'
sourceHash: '053591f3f19a60c4a1f63647effa91be40f87de151309da7e6a804b72d8f97cf'
compiledAt: '2026-08-28T01:22:09.884Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['fixtures-catalog.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { RecoveryRecord, findFixture, loadCatalog, scoreRecovery } from '@harness-engineering/core'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
```
