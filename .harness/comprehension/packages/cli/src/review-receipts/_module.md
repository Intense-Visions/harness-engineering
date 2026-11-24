---
schemaVersion: 1
module: 'packages/cli/src/review-receipts'
sourceHash: 'ddbd355e8f5963260a2587150e1f0338b85b5fa0d8a3d67cf66b94c70e190452'
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
export escapeTerminalText
export fields
export gateReviewReceipt
export isAncestor
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
import { EarlierPhaseReceipt, FULL_SHA_PATTERN, FinalReviewBase, FindingsFileRange, PhaseReviewBase, Result, ReviewGateContext, ReviewGateFailure, ReviewGateResult, StandaloneReviewBase, checkReviewerFindingsText, escapeTerminalText, expectedReviewMoment, finalReviewBase, phaseReviewBase, readRegularFile, readReviewReceiptFile, resolveSessionDir, reviewFindingsReaderFor, reviewGateFailure, sessionDirOfReviewDir, standaloneReviewBase, validateReviewReceipt } from '@harness-engineering/core'
import { REVIEW_MOMENTS, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
