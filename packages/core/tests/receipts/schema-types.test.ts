import { describe, it, expectTypeOf } from 'vitest';
import type { z } from 'zod';
import type { CONDITIONAL_REVIEWER_IDS } from '@harness-engineering/types';
import type { ConditionalSubagent } from '../../src/review/depth-calibrator';
import type { ReviewReceipt } from '@harness-engineering/types';
import type { ReviewReceiptSchema, ReviewerFindingsFile } from '../../src/receipts/schema';

/**
 * The runtime schemas and the contract types in packages/types (which has no zod) are written
 * separately. This file pins each such schema's output to its type, in both directions: it is listed in tsconfig.type-tests.json, so `typecheck` fails when a field is
 * added, removed, retyped or made optional on one side only. That is what lets the parsers
 * return schema output with no cast.
 */
describe('runtime schemas match their contract types', () => {
  it('ReviewReceiptSchema is ReviewReceipt', () => {
    expectTypeOf<z.infer<typeof ReviewReceiptSchema>>().toEqualTypeOf<ReviewReceipt>();
  });
  it('a receipt diff holds exactly base, head, baseSource and target', () => {
    expectTypeOf<keyof ReviewReceipt['diff']>().toEqualTypeOf<
      'base' | 'head' | 'baseSource' | 'target'
    >();
  });
  it('ReviewerFindingsFile, derived from its schema, has exactly the five documented fields', () => {
    // ReceiptFinding is derived the same way; finding-compat.test.ts pins its seven fields.
    expectTypeOf<keyof ReviewerFindingsFile>().toEqualTypeOf<
      'schemaVersion' | 'reviewerId' | 'head' | 'examinedFiles' | 'findings'
    >();
  });
  it('the conditional reviewer ids of the receipt contract are the ones depth calibration activates', () => {
    // Three places name them (types, depth-calibrator, fan-out); this ties the first two, so
    // adding a conditional reviewer to one without the other fails typecheck.
    expectTypeOf<(typeof CONDITIONAL_REVIEWER_IDS)[number]>().toEqualTypeOf<ConditionalSubagent>();
  });
});
