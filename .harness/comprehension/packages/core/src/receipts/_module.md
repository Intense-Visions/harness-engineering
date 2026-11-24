---
schemaVersion: 1
module: 'packages/core/src/receipts'
sourceHash: '32390e4dd9e991fe37503a3e0ec0027f7f3d5bd2e714d33917a193d0a7bf0b44'
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
export EarlierPhaseReceipt
export FINAL_REVIEW_LABEL
export FULL_SHA_PATTERN
export FinalReviewBase
export PhaseReviewBase
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
export phaseReviewBase
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
import { CONDITIONAL_REVIEWER_IDS, ESCAPED_FROM_STAGES, EscapedFrom, FINDING_CLASSES, FULL_SHA_PATTERN, FULL_TIER_REVIEWER_IDS, FindingClass, LIGHT_TIER_REVIEWER_ID, REVIEW_BACKENDS, REVIEW_BASE_SOURCES, REVIEW_MOMENTS, REVIEW_TIERS, REVIEW_TIER_DEMOTIONS, ReviewBackend, ReviewBaseSource, ReviewGateFailureCode, ReviewMoment, ReviewReceipt, ReviewTier, ReviewerRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
```
