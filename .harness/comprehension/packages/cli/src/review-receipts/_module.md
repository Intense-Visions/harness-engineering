---
schemaVersion: 1
module: 'packages/cli/src/review-receipts'
sourceHash: 'a4d90298310625e7844308cfa36f07c363b25b2ad6e59d916599d59816443332'
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
import { ArchiveRoundResult, EarlierPhaseReceipt, FULL_SHA_PATTERN, FinalReviewBase, FindingsFileRange, PhaseReviewBase, REVIEWS_DIRNAME, REVIEW_RECEIPT_FILENAME, Result, ReviewGateContext, ReviewGateFailure, ReviewGateResult, StandaloneReviewBase, archiveReviewRound, checkReviewerFindingsText, expectedReviewMoment, finalReviewBase, parseReviewReceipt, phaseOfReviewLabel, phaseReviewBase, readArchivedRounds, readRegularFile, readReviewReceiptFile, resolveSessionDir, reviewFindingsReaderFor, reviewGateFailure, sessionDirOfReviewDir, standaloneReviewBase, validateReviewReceipt } from '@harness-engineering/core'
import { REVIEW_MOMENTS, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
