---
schemaVersion: 1
module: 'packages/cli/src/review-receipts'
sourceHash: '8eefa236c103314c8a67bf459f161c7476227a03554f6ba18214b955a068a84e'
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
export gateReviewReceipt
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
```

## Dependency Slice

```
import { CwdGit, defaultBranchMergeBase, listDiffFiles, runGitIn, sessionStartingCommit, tryGit } from './io'
import { FULL_SHA_PATTERN, FinalReviewBase, Result, ReviewGateContext, ReviewGateFailure, ReviewGateResult, checkReviewerFindingsText, expectedReviewMoment, finalReviewBase, readRegularFile, readReviewReceiptFile, resolveSessionDir, reviewFindingsReaderFor, reviewGateFailure, sessionDirOfReviewDir, validateReviewReceipt } from '@harness-engineering/core'
import { REVIEW_MOMENTS, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as path from 'node:path'
```
