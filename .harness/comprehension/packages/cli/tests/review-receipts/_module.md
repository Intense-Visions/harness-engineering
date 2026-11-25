---
schemaVersion: 1
module: 'packages/cli/tests/review-receipts'
sourceHash: 'a8390f6008860555fe76309f331549f376907c70bf5792749dee70d4e09bf734'
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
