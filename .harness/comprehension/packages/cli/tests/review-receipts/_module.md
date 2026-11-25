---
schemaVersion: 1
module: 'packages/cli/tests/review-receipts'
sourceHash: '0149e03f81b6446d2dfd4b73a1c064bfe60c667b2ee44950865562049c320275'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['gate-git.test.ts', 'io.test.ts', 'round3-target.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runReviewTier } from '../../src/commands/review-tier'
import { handleCheckReviewReceipt } from '../../src/mcp/tools/review-receipt'
import { runCheckFindingsFile, runCheckReviewReceipt } from '../../src/review-receipts/gate'
import { CwdGit, listDiffFiles, runGitIn, sessionDirFrom } from '../../src/review-receipts/io'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
