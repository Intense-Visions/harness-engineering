import { describe, it, expect } from 'vitest';
import * as receipts from '../../src/receipts';

describe('receipts module surface', () => {
  it.each([
    'validateReviewReceipt',
    'expectedReviewMoment',
    'reviewGateFailure',
    'parseReviewReceipt',
    'parseReviewerFindingsFile',
    'resolveReviewBackend',
    'readReviewReceiptFile',
    'reviewFindingsReaderFor',
    // Round 2 (architecture-1): the CLI reads the session layout from here, not a copy.
    'phaseOfReviewLabel',
    // Unit 3: the provenance stamp and the one reader of autopilot-state.json.
    'noteText',
    'readSessionReviewState',
    'jsonObjectFields',
    'assembleStamp',
    'buildProvenanceRow',
    'renderProvenanceBlock',
    'parseProvenanceStamp',
    // Unit 4: the stamp as pre-merge-brief prints it, and its head notice.
    'renderParsedStamp',
    'stampHeadNotice',
  ])('exports %s as a function', (name) => {
    expect(typeof (receipts as Record<string, unknown>)[name]).toBe('function');
  });
  it('publishes the layout names the CLI reads (round 2, architecture-1)', () => {
    expect(receipts).toMatchObject({
      REVIEW_RECEIPT_FILENAME: 'receipt.json',
      REVIEWS_DIRNAME: 'reviews',
    });
  });
  it('exports the marker (unit 3)', () => {
    expect(receipts.PROVENANCE_MARKER).toBe('<!-- harness:review-provenance -->');
  });
  // Only names that exist at this head: an assertion about an absent name passes vacuously.
  it('does not publish module-internal helpers', () => {
    for (const name of [
      'resolveReceiptPath',
      'ReviewerRecordSchema',
      'REVIEWER_ID_PATTERN',
      'BLOCKING_SEVERITIES',
      // No consumer outside the module (round 3, barrel-surface):
      'ReviewReceiptSchema',
      'ReviewerFindingsFileSchema',
      'isBlockingSeverity',
      'normalizeReviewPath',
      'tallyReviewFindings',
      'inert',
      // Round 4, fix 13: no consumer outside the module.
      'pathEscapes',
      'reviewMomentOfDir',
      // Unit 1 fix round 1, fix 14: no consumer outside the module, and FULL_SHA_PATTERN is the
      // types package's to export.
      'FINAL_REVIEW_LABEL',
      'SESSION_REVIEW_LABEL',
      'FULL_SHA_PATTERN',
      // Unit 3: internal to the stamp, or published by their owner (the state module).
      'reviewLabel',
      'compareReviewLabels',
      'MISSING_REVIEW',
      'STAMP_CELL_GRAMMAR',
      'STARTING_COMMIT_GAP',
      'AutopilotSessionStateSchema',
      'AUTOPILOT_STATE_FILENAME',
    ]) {
      expect(receipts).not.toHaveProperty(name);
    }
  });
});
