---
schemaVersion: 1
module: 'packages/core/tests/golden'
sourceHash: '6911981a205615dee811613ff97db83ba213f8847e8ea113d687b4f2351e7ecf'
compiledAt: '2026-08-28T01:22:10.865Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['manager.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { GoldenBuildManager } from '../../src/golden/manager'
import { GoldenSnapshotSchema } from '../../src/golden/types'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
