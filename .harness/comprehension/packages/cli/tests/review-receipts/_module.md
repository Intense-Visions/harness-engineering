---
schemaVersion: 1
module: 'packages/cli/tests/review-receipts'
sourceHash: 'b061737892a261e48c6aebb6405162fe244c9b4443283d7422c0e16f3b595fb2'
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
import { handleCheckReviewReceipt } from '../../src/mcp/tools/review-receipt'
import { runCheckFindingsFile, runCheckReviewReceipt } from '../../src/review-receipts/gate'
import { CwdGit, sessionDirFrom } from '../../src/review-receipts/io'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
