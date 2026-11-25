---
schemaVersion: 1
module: 'packages/cli/src/review-receipts'
sourceHash: '042eae2d37129e9f5ca31db58c38910086a100b97a119d352fd05e03e8cf1c9a'
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
export earlierPhaseReceipt
export fields
export gateReviewReceipt
export isAncestor
export isOwnBranchRef
export isSha
export listDiffFiles
export readSessionStateText
export remoteTrackingRef
export resolveCommit
export resolveFinalReviewBase
export resolveRepoRoots
export resolveStandaloneReviewBase
export reviewMergeBase
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
import { CwdGit, earlierPhaseReceipt, fields, isAncestor, isSha, listDiffFiles, resolveCommit, resolveRepoRoots, reviewMergeBase, runGitIn, sessionStartingCommit, tryGit, worktreeClean } from './io'
import { EarlierPhaseReceipt, FULL_SHA_PATTERN, FinalReviewBase, FindingsFileRange, PhaseReviewBase, REVIEWS_DIRNAME, REVIEW_RECEIPT_FILENAME, Result, ReviewGateContext, ReviewGateFailure, ReviewGateResult, StandaloneReviewBase, checkReviewerFindingsText, expectedReviewMoment, finalReviewBase, parseReviewReceipt, phaseOfReviewLabel, phaseReviewBase, readRegularFile, readReviewReceiptFile, resolveSessionDir, reviewFindingsReaderFor, reviewGateFailure, sessionDirOfReviewDir, standaloneReviewBase, validateReviewReceipt } from '@harness-engineering/core'
import { REVIEW_MOMENTS, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
