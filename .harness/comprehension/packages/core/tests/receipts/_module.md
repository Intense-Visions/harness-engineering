---
schemaVersion: 1
module: 'packages/core/tests/receipts'
sourceHash: '195b6585ef88d892914eed1fa46aff6ad6c21bcd6903e2de38ddfafc758e55b7'
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
    'review-gate-round2.test.ts',
    'review-gate-round3.test.ts',
    'review-gate-worktree.test.ts',
    'review-gate.test.ts',
    'round4-final-base.test.ts',
    'round4-findings-check.test.ts',
    'round4-helpers.ts',
    'round4-reviewer-ids.test.ts',
    'schema-types.test.ts',
    'schema.test.ts',
    'session-review-label.test.ts',
    'terminal-text.test.ts',
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
import { ExpectedMoment, REVIEW_RECEIPT_FILENAME, SESSION_REVIEW_LABEL, expectedReviewMoment, reviewMomentOfDir, sessionDirOfReviewDir } from '../../src/receipts/layout'
import { REVIEW_FILE_MAX_BYTES, errnoReason, readRegularFile, readReviewReceiptFile, reviewFindingsReaderFor } from '../../src/receipts/load'
import { normalizeReviewPath, pathEscapes } from '../../src/receipts/paths'
import { PhaseReviewBase, ReviewGateContext, checkReviewerFindingsText, finalReviewBase, phaseReviewBase, validateReviewReceipt } from '../../src/receipts/review-gate'
import { BLOCKING_SEVERITIES, ReceiptFinding, ReviewReceiptSchema, ReviewerFindingsFile, isBlockingSeverity, parseReviewReceipt, parseReviewerFindingsFile } from '../../src/receipts/schema'
import { escapeTerminalText } from '../../src/receipts/terminal-text'
import { ConditionalSubagent } from '../../src/review/depth-calibrator'
import { ReviewFinding } from '../../src/review/types/fan-out'
import { BASE, FULL, HEAD, OTHER, START, codesOf, ctx, finding, findingsText, receipt, record } from './round4-helpers'
import { CONDITIONAL_REVIEWER_IDS, FULL_TIER_REVIEWER_IDS, LIGHT_TIER_REVIEWER_ID, RECEIPT_UNREAD_REASONS, REVIEW_MOMENTS, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
```
