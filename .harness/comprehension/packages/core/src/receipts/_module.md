---
schemaVersion: 1
module: 'packages/core/src/receipts'
sourceHash: '3080293e3fd98e5a5c0ed27ab65fc9e997d81e21291bd354ba3693b3e214d13a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['backend.ts', 'index.ts', 'layout.ts', 'load.ts', 'review-gate.ts', 'schema.ts']
---

## Interface Contract

```ts
export EarlierPhaseReceipt
export FinalReviewBase
export FindingsFileRange
export PhaseReviewBase
export ResolvedReviewBackend
export ReviewGateContext
export ReviewGateFailure
export ReviewGateResult
export StandaloneReviewBase
export checkReviewerFindingsText
export escapeTerminalText
export expectedReviewMoment
export finalReviewBase
export parseReviewReceipt
export parseReviewerFindingsFile
export phaseReviewBase
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
import { ExpectedMoment, REVIEW_RECEIPT_FILENAME } from './layout'
import { ReviewFindingTally, ReviewerFindingsFile, parseReviewReceipt, parseReviewerFindingsFile, tallyReviewFindings } from './schema'
import { CONDITIONAL_REVIEWER_IDS, ERRNO_REASON, ESCAPED_FROM_STAGES, Err, EscapedFrom, FINDING_CLASSES, FULL_SHA_PATTERN, FULL_TIER_REVIEWER_IDS, FindingClass, LIGHT_TIER_REVIEWER_ID, Ok, REVIEW_BACKENDS, REVIEW_BASE_SOURCES, REVIEW_MOMENTS, REVIEW_TIERS, REVIEW_TIER_DEMOTIONS, ReceiptReadProblem, ReceiptUnreadReason, Result, ReviewBackend, ReviewBaseSource, ReviewGateFailureCode, ReviewMoment, ReviewReceipt, ReviewTier, ReviewerRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
```
