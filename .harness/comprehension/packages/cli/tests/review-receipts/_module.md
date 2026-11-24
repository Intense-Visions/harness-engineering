---
schemaVersion: 1
module: 'packages/cli/tests/review-receipts'
sourceHash: '551f7df93ad6a9541c78752d9efd16490bd448e23f781c366666aaf075a9a69a'
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
