/**
 * Pipeline receipts: typed records of what a review did, and the gates that recompute them
 * (docs/changes/shift-left-pipeline-fidelity/proposal.md, D3 and D4). Only what a consumer
 * outside this directory uses is exported.
 */
export { parseReviewReceipt, parseReviewerFindingsFile } from './schema';
export {
  finalReviewBase,
  interruptedArchiveFailure,
  reviewGateFailure,
  validateReviewReceipt,
} from './review-gate';
export { phaseReviewBase } from './review-gate';
export type { EarlierPhaseReceipt, PhaseReviewBase } from './review-gate';
export { checkReviewerFindingsText } from './review-gate';
export type { ReviewGateContext, ReviewGateFailure, ReviewGateResult } from './review-gate';
export type { FindingsFileRange } from './review-gate';
export type { FinalReviewBase, StandaloneReviewBase } from './review-gate';
export { standaloneReviewBase } from './review-gate';
export { escapeUnsafeText as escapeTerminalText } from '../shared/unsafe-text';
export { resolveReviewBackend } from './backend';
export type { ResolvedReviewBackend } from './backend';
export { expectedReviewMoment } from './layout';
export { sessionDirOfReviewDir } from './layout';
export { phaseOfReviewLabel, REVIEW_RECEIPT_FILENAME, REVIEWS_DIRNAME } from './layout';
export { readRegularFile, readReviewReceiptFile, reviewFindingsReaderFor } from './load';
export { archiveReviewRound, listInterruptedArchives, readArchivedRounds } from './rounds';
export type { ArchiveRoundResult } from './rounds';
export { ReviewDecisionRecordSchema, jsonObjectFields, readSessionReviewState } from './decisions';
export type { ExpectedUnknown, OrphanDecision, SessionReviewState } from './decisions';
export { assembleStamp, buildProvenanceRow, renderProvenanceBlock } from './provenance';
export type {
  CommitsAfter,
  ProvenanceRow,
  ProvenanceRowInput,
  ReviewDirRead,
  SkipCheck,
  StampGit,
  StampRow,
  StampSessionState,
  UnreadReview,
  UnreadReviewRow,
  UnreviewedCommits,
} from './provenance';
export { NO_PIPELINE_REVIEW, PROVENANCE_MARKER, noteText } from './stamp-grammar';
export type { StampNote } from './stamp-grammar';
export { parseProvenanceStamp } from './stamp-parser';
export type { ParsedProvenanceStamp } from './stamp-parser';
