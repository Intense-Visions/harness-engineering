---
schemaVersion: 1
module: 'packages/cli/tests/review-receipts'
sourceHash: 'a31509d9730fc720fb4d945b1c8f8512be8692721ac4b44ec0dc7a72e1a9927e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['gate-git.test.ts', 'io.test.ts', 'round3-target.test.ts', 'round4-target.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { formatCheckReviewReceipt } from '../../src/commands/check-review-receipt'
import { runReviewTier } from '../../src/commands/review-tier'
import { handleCheckReviewReceipt } from '../../src/mcp/tools/review-receipt'
import { runCheckFindingsFile, runCheckReviewReceipt } from '../../src/review-receipts/gate'
import { CwdGit, defaultPrReader, isOwnBranchRef, listDiffFiles, runGitIn, sessionDirFrom } from '../../src/review-receipts/io'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
