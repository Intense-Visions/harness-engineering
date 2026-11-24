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
  ])('exports %s as a function', (name) => {
    expect(typeof (receipts as Record<string, unknown>)[name]).toBe('function');
  });
  it('does not publish module-internal helpers', () => {
    for (const name of [
      'attributionKey',
      'findingLocationKey',
      'resolveReceiptPath',
      'ReviewerRecordSchema',
      'REVIEWER_ID_PATTERN',
      'BLOCKING_SEVERITIES',
      // No consumer outside the module (round 3, barrel-surface):
      'ReviewReceiptSchema',
      'ReviewerFindingsFileSchema',
      'ReviewAttributionRecordSchema',
      'isBlockingSeverity',
      'normalizeReviewPath',
      'tallyReviewFindings',
      'effectiveAttribution',
      'reviewLabel',
      'MISSING_REVIEW',
      'REVIEW_RECEIPT_FILENAME',
      // Generic names, renamed so a second receipt kind cannot collide:
      'ATTRIBUTION_REVIEW_LABEL',
      'STAMP_CELL_GRAMMAR',
      'inert',
      'gateFailure',
      'readReceiptFile',
      'findingsReaderFor',
      // Round 4, fix 13: no consumer outside the module.
      'pathEscapes',
      'compareReviewLabels',
      'reviewMomentOfDir',
      'STARTING_COMMIT_GAP',
      // Unit 1 fix round 1, fix 14: no consumer outside the module in unit 1 (later units add
      // what they use), and FULL_SHA_PATTERN is the types package's to export.
      'FINAL_REVIEW_LABEL',
      'REVIEWS_DIRNAME',
      'SESSION_REVIEW_LABEL',
      'FULL_SHA_PATTERN',
    ]) {
      expect(receipts).not.toHaveProperty(name);
    }
  });
});
