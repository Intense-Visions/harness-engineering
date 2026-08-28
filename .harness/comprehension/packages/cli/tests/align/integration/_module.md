---
schemaVersion: 1
module: 'packages/cli/tests/align/integration'
sourceHash: 'a27c781d830e0cfbe5eed85d81b485d01c54d119d63c223ead3e3c56cf9988b8'
compiledAt: '2026-08-28T01:22:09.520Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['end-to-end.test.ts', 'revert.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runAlignDesignSystem } from '../../../src/align'
import { LAST_BATCH_PATH } from '../../../src/align/revert/state'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
