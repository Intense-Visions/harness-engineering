---
schemaVersion: 1
module: 'packages/core/tests/receipts'
sourceHash: '8c8eb4ce32e25dae4424eb40f4d5943511886b5c0e77a869daf6491e077025dd'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'backend.test.ts',
    'finding-compat.test.ts',
    'layout.test.ts',
    'load.test.ts',
    'public-surface.test.ts',
    'review-gate-demotion.test.ts',
    'review-gate-phase-base.test.ts',
    'review-gate-review3-basesource.test.ts',
    'review-gate-review3-standalone.test.ts',
    'review-gate-review3.test.ts',
    'review-gate-round2.test.ts',
    'review-gate-round3.test.ts',
    'review-gate-worktree.test.ts',
    'review-gate.test.ts',
    'round4-final-base.test.ts',
    'round4-findings-check.test.ts',
    'round4-helpers.ts',
    'round4-reviewer-ids.test.ts',
    'round4-rounds.test.ts',
    'schema-types.test.ts',
    'schema.test.ts',
    'session-review-label.test.ts',
  ]
---

## Interface Contract

```ts
export BASE
export FULL
export HEAD
export OTHER
export START
export codesOf
export ctx
export finding
export findingsText
export receipt
export record
```

## Dependency Slice

```
import * as receipts from '../../src/receipts'
import { resolveReviewBackend } from '../../src/receipts/backend'
import { ExpectedMoment, REVIEW_RECEIPT_FILENAME, SESSION_REVIEW_LABEL, expectedReviewMoment, isReviewDirectory, phaseOfReviewLabel, reviewMomentOfDir, sessionDirOfReviewDir } from '../../src/receipts/layout'
import { REVIEW_FILE_MAX_BYTES, errnoReason, readRegularFile, readReviewReceiptFile, reviewFindingsReaderFor } from '../../src/receipts/load'
import { PhaseReviewBase, ReviewGateContext, checkReviewerFindingsText, finalReviewBase, phaseReviewBase, validateReviewReceipt } from '../../src/receipts/review-gate'
import { ArchiveRoundIo, archiveReviewRound, listArchivedRounds, listInterruptedArchives, readArchivedRounds } from '../../src/receipts/rounds'
import { BLOCKING_SEVERITIES, ReceiptFinding, ReviewReceiptSchema, ReviewerFindingsFile, isBlockingSeverity, parseReviewReceipt, parseReviewerFindingsFile } from '../../src/receipts/schema'
import { ConditionalSubagent } from '../../src/review/depth-calibrator'
import { ReviewDomain } from '../../src/review/types/context'
import { ReviewFinding, ReviewSubagent } from '../../src/review/types/fan-out'
import { normalizeReviewPath, pathEscapes } from '../../src/shared/review-paths'
import { BASE, FULL, HEAD, OTHER, START, codesOf, ctx, finding, findingsText, receipt, record } from './round4-helpers'
import { ArchivedRound, CONDITIONAL_REVIEWER_IDS, FULL_TIER_REVIEWER_IDS, LIGHT_TIER_REVIEWER_ID, PIPELINE_DOMAINS_OUTSIDE_RECEIPT, RECEIPT_UNREAD_REASONS, REVIEW_MOMENTS, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
```
