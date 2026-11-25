---
schemaVersion: 1
module: 'packages/core/tests/receipts'
sourceHash: 'dbfeb51f0fe7a0141436537720b62ff5fb745e5f0dab5ef9420893c8eb1d14b6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'backend.test.ts',
    'decisions.test.ts',
    'finding-compat.test.ts',
    'layout.test.ts',
    'load.test.ts',
    'provenance.test.ts',
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
    'round4-decided-by.test.ts',
    'round4-final-base.test.ts',
    'round4-findings-check.test.ts',
    'round4-helpers.ts',
    'round4-reviewer-ids.test.ts',
    'round4-rounds.test.ts',
    'round4-stamp-assembly.test.ts',
    'round4-stamp-inert.test.ts',
    'round4-unread-decisions.test.ts',
    'schema-types.test.ts',
    'schema.test.ts',
    'session-review-label.test.ts',
    'session-state.test.ts',
    'stamp-round3.test.ts',
    'unit3-findings.test.ts',
    'unit3-fix-round1.test.ts',
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
import { ReviewDecisionRecordSchema, jsonObjectFields, readSessionReviewState } from '../../src/receipts/decisions'
import { ExpectedMoment, REVIEW_RECEIPT_FILENAME, SESSION_REVIEW_LABEL, compareReviewLabels, expectedReviewMoment, isReviewDirectory, phaseOfReviewLabel, reviewLabel, reviewMomentOfDir, sessionDirOfReviewDir } from '../../src/receipts/layout'
import { REVIEW_FILE_MAX_BYTES, errnoReason, readRegularFile, readReviewReceiptFile, reviewFindingsReaderFor } from '../../src/receipts/load'
import { ProvenanceRow, ProvenanceRowInput, ReviewDirRead, STARTING_COMMIT_GAP, StampRow, UnreadReview, UnreadReviewRow, assembleStamp, buildProvenanceRow, renderProvenanceBlock } from '../../src/receipts/provenance'
import { CheckedReceiptResult, PhaseReviewBase, ReviewGateContext, checkReviewerFindingsText, finalReviewBase, phaseReviewBase, validateReviewReceipt } from '../../src/receipts/review-gate'
import { ArchiveRoundIo, archiveReviewRound, listArchivedRounds, listInterruptedArchives, readArchivedRounds } from '../../src/receipts/rounds'
import { BLOCKING_SEVERITIES, BlockingReceiptFinding, ReceiptFinding, ReviewReceiptSchema, ReviewerFindingsFile, isBlockingSeverity, parseReviewReceipt, parseReviewerFindingsFile } from '../../src/receipts/schema'
import { HEADER, MARKER, NO_PIPELINE_REVIEW, OVERRIDE_CELL_MAX, PROVENANCE_MARKER, RULE, STAMP_COLUMNS, STAMP_LIMITS, STAMP_NOTES, StampNote, StampNoteId, inert, isInert, noteText, parseStampRow } from '../../src/receipts/stamp-grammar'
import { parseProvenanceStamp } from '../../src/receipts/stamp-parser'
import { ConditionalSubagent } from '../../src/review/depth-calibrator'
import { ReviewDomain } from '../../src/review/types/context'
import { ReviewFinding, ReviewSubagent } from '../../src/review/types/fan-out'
import { normalizeReviewPath, pathEscapes } from '../../src/shared/review-paths'
import { AutopilotSessionStateSchema } from '../../src/state/autopilot-session-state'
import { BASE, FULL, HEAD, OTHER, START, codesOf, ctx, finding, findingsText, receipt, record } from './round4-helpers'
import { ArchivedRound, AutopilotPhaseEntry, AutopilotSessionState, CONDITIONAL_REVIEWER_IDS, ESCAPED_FROM_STAGES, FINDING_CLASSES, FULL_TIER_REVIEWER_IDS, LIGHT_TIER_REVIEWER_ID, PIPELINE_DOMAINS_OUTSIDE_RECEIPT, RECEIPT_UNREAD_REASONS, REVIEW_DECIDERS, REVIEW_DECISION_KINDS, REVIEW_GATE_FAILURE_CODES, REVIEW_MOMENTS, REVIEW_SKIP_REASONS, ReadReviewDecision, ReviewDecider, ReviewDecisionRecord, ReviewGateFailureCode, ReviewMoment, ReviewReceipt } from '@harness-engineering/types'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
```
