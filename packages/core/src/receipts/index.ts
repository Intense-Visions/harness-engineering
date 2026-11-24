/**
 * Pipeline receipts: typed records of what a review did, and the gates that recompute them
 * (docs/changes/shift-left-pipeline-fidelity/proposal.md, D3 and D4). Only what a consumer
 * outside this directory uses is exported.
 */
export { FULL_SHA_PATTERN } from './schema';
export { parseReviewReceipt, parseReviewerFindingsFile } from './schema';
export { finalReviewBase, reviewGateFailure, validateReviewReceipt } from './review-gate';
export { checkReviewerFindingsText } from './review-gate';
export type { ReviewGateContext, ReviewGateFailure, ReviewGateResult } from './review-gate';
export type { FinalReviewBase } from './review-gate';
export { escapeTerminalText } from './terminal-text';
export { resolveReviewBackend } from './backend';
export type { ResolvedReviewBackend } from './backend';
export { FINAL_REVIEW_LABEL, REVIEWS_DIRNAME, SESSION_REVIEW_LABEL } from './layout';
export { expectedReviewMoment } from './layout';
export { sessionDirOfReviewDir } from './layout';
export { readRegularFile, readReviewReceiptFile, reviewFindingsReaderFor } from './load';
