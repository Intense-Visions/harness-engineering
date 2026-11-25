---
schemaVersion: 1
module: 'packages/core/src/receipts'
sourceHash: '8848e9a649bc90977927fa04b0408967fa83962c94d956ff03e0e536b3b317f6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['backend.ts', 'index.ts', 'layout.ts', 'load.ts', 'review-gate.ts', 'rounds.ts', 'schema.ts']
---

## Interface Contract

```ts
export ArchiveRoundResult
export EarlierPhaseReceipt
export FinalReviewBase
export FindingsFileRange
export PhaseReviewBase
export REVIEWS_DIRNAME
export REVIEW_RECEIPT_FILENAME
export ResolvedReviewBackend
export ReviewGateContext
export ReviewGateFailure
export ReviewGateResult
export StandaloneReviewBase
export archiveReviewRound
export checkReviewerFindingsText
export escapeTerminalText
export expectedReviewMoment
export finalReviewBase
export interruptedArchiveFailure
export listInterruptedArchives
export parseReviewReceipt
export parseReviewerFindingsFile
export phaseOfReviewLabel
export phaseReviewBase
export readArchivedRounds
export readRegularFile
export readReviewReceiptFile
export resolveReviewBackend
export reviewFindingsReaderFor
export reviewGateFailure
export sessionDirOfReviewDir
export standaloneReviewBase
export validateReviewReceipt
```

## Dependency Slice

```
import { normalizeReviewPath, pathEscapes } from '../shared/review-paths'
import { ExpectedMoment, REVIEW_RECEIPT_FILENAME, isReviewDirectory } from './layout'
import { errnoReason, readReviewReceiptFile, reviewFindingsReaderFor } from './load'
import { ReviewFindingTally, ReviewerFindingsFile, parseReviewReceipt, parseReviewerFindingsFile, tallyReviewFindings } from './schema'
import { ArchivedRound, CONDITIONAL_REVIEWER_IDS, ERRNO_REASON, ESCAPED_FROM_STAGES, Err, EscapedFrom, FINDING_CLASSES, FULL_SHA_PATTERN, FULL_TIER_REVIEWER_IDS, FindingClass, LIGHT_TIER_REVIEWER_ID, Ok, REVIEW_BACKENDS, REVIEW_BASE_SOURCES, REVIEW_MOMENTS, REVIEW_TIERS, REVIEW_TIER_DEMOTIONS, ReceiptReadProblem, ReceiptUnreadReason, Result, ReviewBackend, ReviewBaseSource, ReviewGateFailureCode, ReviewMoment, ReviewReceipt, ReviewTier, ReviewerRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
```
