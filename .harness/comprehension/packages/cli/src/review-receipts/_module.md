---
schemaVersion: 1
module: 'packages/cli/src/review-receipts'
sourceHash: 'd0fea5de094f033db777e4d32c66d37b92929b09962d823b79f2df3bbd235b8a'
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
export escapeTerminalText
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
import { CwdGit, defaultBranchMergeBase, listDiffFiles, resolveRepoRoots, runGitIn, sessionStartingCommit, tryGit } from './io'
import { FULL_SHA_PATTERN, FinalReviewBase, Result, ReviewGateContext, ReviewGateFailure, ReviewGateResult, checkReviewerFindingsText, escapeTerminalText, expectedReviewMoment, finalReviewBase, readRegularFile, readReviewReceiptFile, resolveSessionDir, reviewFindingsReaderFor, reviewGateFailure, sessionDirOfReviewDir, validateReviewReceipt } from '@harness-engineering/core'
import { REVIEW_MOMENTS, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as path from 'node:path'
```
