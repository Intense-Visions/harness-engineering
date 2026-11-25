---
schemaVersion: 1
module: 'packages/core/src/receipts'
sourceHash: '986e9b98ff604226ea834a3a05cb89bacb63d2646dd160b3a09f6dccf95b19a3'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'backend.ts',
    'decisions.ts',
    'index.ts',
    'layout.ts',
    'load.ts',
    'provenance.ts',
    'review-gate.ts',
    'rounds.ts',
    'schema.ts',
    'stamp-grammar.ts',
    'stamp-parser.ts',
  ]
---

## Interface Contract

```ts
export ArchiveRoundResult
export CommitsAfter
export EarlierPhaseReceipt
export ExpectedUnknown
export FinalReviewBase
export FindingsFileRange
export NO_PIPELINE_REVIEW
export OrphanDecision
export PROVENANCE_MARKER
export ParsedProvenanceStamp
export PhaseReviewBase
export ProvenanceRow
export ProvenanceRowInput
export REVIEWS_DIRNAME
export REVIEW_RECEIPT_FILENAME
export ResolvedReviewBackend
export ReviewDecisionRecordSchema
export ReviewDirRead
export ReviewGateContext
export ReviewGateFailure
export ReviewGateResult
export SessionReviewState
export SkipCheck
export StampGit
export StampNote
export StampRow
export StampSessionState
export StandaloneReviewBase
export UnreadReview
export UnreadReviewRow
export UnreviewedCommits
export archiveReviewRound
export assembleStamp
export buildProvenanceRow
export checkReviewerFindingsText
export escapeTerminalText
export expectedReviewMoment
export finalReviewBase
export interruptedArchiveFailure
export jsonObjectFields
export listInterruptedArchives
export noteText
export parseProvenanceStamp
export parseReviewReceipt
export parseReviewerFindingsFile
export phaseOfReviewLabel
export phaseReviewBase
export readArchivedRounds
export readRegularFile
export readReviewReceiptFile
export readSessionReviewState
export renderProvenanceBlock
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
import { AutopilotPhaseEntrySchema, AutopilotSessionStateSchema } from '../state/autopilot-session-state'
import { SessionReviewState } from './decisions'
import { ExpectedMoment, FINAL_REVIEW_LABEL, REVIEW_RECEIPT_FILENAME, SESSION_REVIEW_LABEL, compareReviewLabels, isReviewDirectory, reviewLabel } from './layout'
import { errnoReason, readReviewReceiptFile, reviewFindingsReaderFor } from './load'
import { CheckedReceiptResult } from './review-gate'
import { ReviewFindingTally, ReviewerFindingsFile, parseReviewReceipt, parseReviewerFindingsFile, tallyReviewFindings } from './schema'
import { FINAL_REVIEW_LABEL, MISSING_REVIEW, NO_PIPELINE_REVIEW, PROVENANCE_MARKER, SESSION_REVIEW_LABEL, STAMP_COLUMNS, STAMP_HEADING, STAMP_LIMITS, STAMP_TABLE_HEADER, STAMP_TABLE_RULE, StampCells, StampNote, UNREAD_REASON, compareReviewLabels, countsText, inert, isStampNoteLine, listed, noteText, parseStampRow, plural } from './stamp-grammar'
import { ArchivedRound, CONDITIONAL_REVIEWER_IDS, ERRNO_REASON, ESCAPED_FROM_STAGES, Err, EscapedFrom, FINDING_CLASSES, FULL_SHA_PATTERN, FULL_TIER_REVIEWER_IDS, FindingClass, LIGHT_TIER_REVIEWER_ID, Ok, RECEIPT_UNREAD_REASONS, REVIEW_BACKENDS, REVIEW_BASE_SOURCES, REVIEW_DECIDERS, REVIEW_DECISION_KINDS, REVIEW_GATE_FAILURE_CODES, REVIEW_MOMENTS, REVIEW_SKIP_REASONS, REVIEW_TIERS, REVIEW_TIER_DEMOTIONS, ReadReviewDecision, ReceiptReadProblem, ReceiptUnreadReason, Result, ReviewBackend, ReviewBaseSource, ReviewDecisionKind, ReviewGateFailureCode, ReviewMoment, ReviewPriorRound, ReviewReceipt, ReviewSkipReason, ReviewTier, ReviewerRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
```
