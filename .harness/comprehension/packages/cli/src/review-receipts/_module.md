---
schemaVersion: 1
module: 'packages/cli/src/review-receipts'
sourceHash: 'ba75ac69c5fa26a8515d1ec6bfb05afaaa8812a319a40ac603a2ed6f50d1de9f'
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
export runArchiveReviewRound
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
import { ArchiveRoundResult, EarlierPhaseReceipt, FULL_SHA_PATTERN, FinalReviewBase, FindingsFileRange, PhaseReviewBase, REVIEWS_DIRNAME, REVIEW_RECEIPT_FILENAME, Result, ReviewGateContext, ReviewGateFailure, ReviewGateResult, StandaloneReviewBase, archiveReviewRound, checkReviewerFindingsText, expectedReviewMoment, finalReviewBase, interruptedArchiveFailure, listInterruptedArchives, parseReviewReceipt, phaseOfReviewLabel, phaseReviewBase, readArchivedRounds, readRegularFile, readReviewReceiptFile, resolveSessionDir, reviewFindingsReaderFor, reviewGateFailure, sessionDirOfReviewDir, standaloneReviewBase, validateReviewReceipt } from '@harness-engineering/core'
import { REVIEW_MOMENTS, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
