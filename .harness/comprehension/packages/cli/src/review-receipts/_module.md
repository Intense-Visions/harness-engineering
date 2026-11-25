---
schemaVersion: 1
module: 'packages/cli/src/review-receipts'
sourceHash: 'f7292f6a4f31e290280202e37e6bacc82175140d1748881c85409c5711eec997'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['gate.ts', 'io.ts', 'provenance.ts']
---

## Interface Contract

```ts
export CwdGit
export REVIEW_MOMENTS
export ReviewGateFailure
export ReviewMoment
export earlierPhaseReceipt
export gateReviewReceipt
export isAncestor
export isDirectory
export isOwnBranchRef
export isSha
export listDiffFiles
export listDirectoryEntries
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
export runReviewProvenanceRender
export sessionDirFrom
export sessionStartingCommit
export tryGit
export worktreeClean
```

## Dependency Slice

```
import { CwdGit, UnreadReceipt, gateReviewReceipt } from './gate'
import { CwdGit, earlierPhaseReceipt, isAncestor, isDirectory, isSha, listDiffFiles, listDirectoryEntries, readSessionStateText, resolveCommit, resolveRepoRoots, reviewMergeBase, runGitIn, sessionDirFrom, sessionStartingCommit, tryGit, worktreeClean } from './io'
import { AUTOPILOT_STATE_FILENAME, ArchiveRoundResult, EarlierPhaseReceipt, Err, FULL_SHA_PATTERN, FinalReviewBase, FindingsFileRange, Ok, PhaseReviewBase, REVIEWS_DIRNAME, REVIEW_RECEIPT_FILENAME, Result, ReviewDirRead, ReviewGateContext, ReviewGateFailure, ReviewGateResult, StampRow, StandaloneReviewBase, archiveReviewRound, assembleStamp, checkReviewerFindingsText, expectedReviewMoment, finalReviewBase, interruptedArchiveFailure, jsonObjectFields, listInterruptedArchives, noteText, parseReviewReceipt, phaseOfReviewLabel, phaseReviewBase, readArchivedRounds, readRegularFile, readReviewReceiptFile, readSessionReviewState, renderProvenanceBlock, resolveSessionDir, reviewFindingsReaderFor, reviewGateFailure, sessionDirOfReviewDir, standaloneReviewBase, validateReviewReceipt } from '@harness-engineering/core'
import { REVIEW_MOMENTS, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
