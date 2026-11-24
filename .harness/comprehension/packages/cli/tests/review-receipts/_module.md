---
schemaVersion: 1
module: 'packages/cli/tests/review-receipts'
sourceHash: 'cc9b98aa4df6f45032200d014c49987e08b79614641f34fb3baaaef16b51dbe7'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['gate-git.test.ts', 'io.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runCheckFindingsFile, runCheckReviewReceipt } from '../../src/review-receipts/gate'
import { CwdGit, sessionDirFrom } from '../../src/review-receipts/io'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
