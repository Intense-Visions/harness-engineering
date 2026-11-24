---
schemaVersion: 1
module: 'packages/core/src/receipts'
sourceHash: 'a1b17de106bd9559bd7041376cb53280838165e995e35d0c404f71408a1ec7f5'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'backend.ts',
    'index.ts',
    'layout.ts',
    'load.ts',
    'review-gate.ts',
    'schema.ts',
    'terminal-text.ts',
  ]
---

## Interface Contract

```ts
export FINAL_REVIEW_LABEL
export FULL_SHA_PATTERN
export FinalReviewBase
export REVIEWS_DIRNAME
export ResolvedReviewBackend
export ReviewGateContext
export ReviewGateFailure
export ReviewGateResult
export SESSION_REVIEW_LABEL
export checkReviewerFindingsText
export escapeTerminalText
export expectedReviewMoment
export finalReviewBase
export parseReviewReceipt
export parseReviewerFindingsFile
export readRegularFile
export readReviewReceiptFile
export resolveReviewBackend
export reviewFindingsReaderFor
export reviewGateFailure
export sessionDirOfReviewDir
export validateReviewReceipt
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { ExpectedMoment, REVIEW_RECEIPT_FILENAME } from './layout'
import { ReviewFindingTally, ReviewerFindingsFile, normalizeReviewPath, parseReviewReceipt, parseReviewerFindingsFile, pathEscapes, tallyReviewFindings } from './schema'
import { CONDITIONAL_REVIEWER_IDS, ESCAPED_FROM_STAGES, EscapedFrom, FINDING_CLASSES, FULL_SHA_PATTERN, FULL_TIER_REVIEWER_IDS, FindingClass, LIGHT_TIER_REVIEWER_ID, REVIEW_BACKENDS, REVIEW_BASE_SOURCES, REVIEW_MOMENTS, REVIEW_TIERS, ReviewBackend, ReviewBaseSource, ReviewGateFailureCode, ReviewMoment, ReviewReceipt, ReviewTier, ReviewerRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
```
