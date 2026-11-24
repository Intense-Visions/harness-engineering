---
schemaVersion: 1
module: 'packages/cli/src/review-receipts'
sourceHash: 'b7931314d793fcf28137158a4f9bd40d093107d3dbb17a1f4db70d4c1a92b28e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['gate.ts', 'io.ts']
---

## Interface Contract

```ts
export CwdGit
export REVIEW_MOMENTS
export ReviewGateFailure
export ReviewMoment
export defaultBranchMergeBase
export earlierPhaseReceipt
export escapeTerminalText
export fields
export gateReviewReceipt
export isSha
export listDiffFiles
export readSessionStateText
export resolveFinalReviewBase
export resolveRepoRoots
export runCheckFindingsFile
export runCheckReviewReceipt
export runGitIn
export sessionDirFrom
export sessionStartingCommit
export tryGit
export worktreeClean
```

## Dependency Slice

```
import { CwdGit, defaultBranchMergeBase, earlierPhaseReceipt, fields, isSha, listDiffFiles, resolveRepoRoots, runGitIn, sessionStartingCommit, tryGit, worktreeClean } from './io'
import { EarlierPhaseReceipt, FULL_SHA_PATTERN, FinalReviewBase, Result, ReviewGateContext, ReviewGateFailure, ReviewGateResult, checkReviewerFindingsText, escapeTerminalText, expectedReviewMoment, finalReviewBase, phaseReviewBase, readRegularFile, readReviewReceiptFile, resolveSessionDir, reviewFindingsReaderFor, reviewGateFailure, sessionDirOfReviewDir, validateReviewReceipt } from '@harness-engineering/core'
import { REVIEW_MOMENTS, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
