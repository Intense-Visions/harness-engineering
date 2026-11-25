import { describe, it, expectTypeOf } from 'vitest';
import type { z } from 'zod';
import type {
  CONDITIONAL_REVIEWER_IDS,
  FULL_TIER_REVIEWER_IDS,
  PIPELINE_DOMAINS_OUTSIDE_RECEIPT,
} from '@harness-engineering/types';
import type { ConditionalSubagent } from '../../src/review/depth-calibrator';
import type { ReviewDomain } from '../../src/review/types/context';
import type { ReviewSubagent } from '../../src/review/types/fan-out';
import type {
  AutopilotPhaseEntry,
  AutopilotSessionState,
  ReviewDecider,
  ReviewDecisionRecord,
  ReadReviewDecision,
  ReviewReceipt,
} from '@harness-engineering/types';
import type { ReviewReceiptSchema, ReviewerFindingsFile } from '../../src/receipts/schema';
import type { ReviewDecisionRecordSchema } from '../../src/receipts/decisions';
import type { AutopilotSessionStateSchema } from '../../src/state/autopilot-session-state';

/**
 * The runtime schemas and the contract types in packages/types (which has no zod) are written
 * separately. This file pins each such schema's output to its type, in both directions: it is listed in tsconfig.type-tests.json, so `typecheck` fails when a field is
 * added, removed, retyped or made optional on one side only. That is what lets the parsers
 * return schema output with no cast.
 */
type Known<T> = { [K in keyof T as string extends K ? never : K]: T[K] };

describe('runtime schemas match their contract types', () => {
  it('ReviewReceiptSchema is ReviewReceipt', () => {
    expectTypeOf<z.infer<typeof ReviewReceiptSchema>>().toEqualTypeOf<ReviewReceipt>();
  });
  it('a receipt diff holds exactly base, head, baseSource and target', () => {
    expectTypeOf<keyof ReviewReceipt['diff']>().toEqualTypeOf<
      'base' | 'head' | 'baseSource' | 'target'
    >();
  });
  it('ReviewerFindingsFile, derived from its schema, has exactly the six documented fields', () => {
    // ReceiptFinding is derived the same way; finding-compat.test.ts pins its seven fields.
    expectTypeOf<keyof ReviewerFindingsFile>().toEqualTypeOf<
      'schemaVersion' | 'reviewerId' | 'base' | 'head' | 'examinedFiles' | 'findings'
    >();
  });
  it('the conditional reviewer ids of the receipt contract are the ones depth calibration activates', () => {
    // Three places name them (types, depth-calibrator, fan-out); this ties the first two, so
    // adding a conditional reviewer to one without the other fails typecheck.
    expectTypeOf<(typeof CONDITIONAL_REVIEWER_IDS)[number]>().toEqualTypeOf<ConditionalSubagent>();
  });
  it("the pipeline's review subagents are the receipt reviewers plus the outside-the-receipt set", () => {
    // run_code_review groups findings into reviewer files by domain/subagent. A subagent that is
    // no receipt reviewer must be named in PIPELINE_DOMAINS_OUTSIDE_RECEIPT (its findings stay
    // outside the receipt and its counts), so a new one cannot drift in silently.
    type ReceiptReviewer =
      | (typeof FULL_TIER_REVIEWER_IDS)[number]
      | (typeof CONDITIONAL_REVIEWER_IDS)[number];
    type Outside = (typeof PIPELINE_DOMAINS_OUTSIDE_RECEIPT)[number];
    expectTypeOf<ReviewSubagent>().toEqualTypeOf<ReceiptReviewer | Outside>();
    expectTypeOf<ReviewDomain>().toEqualTypeOf<(typeof FULL_TIER_REVIEWER_IDS)[number] | Outside>();
  });
  it('AutopilotSessionStateSchema is AutopilotSessionState plus pass-through fields', () => {
    type Inferred = z.infer<typeof AutopilotSessionStateSchema>;
    type Phase = Known<NonNullable<Inferred['phases']>[number]>;
    expectTypeOf<Phase>().toEqualTypeOf<AutopilotPhaseEntry>();
    type Top = Omit<Known<Inferred>, 'phases'> & { phases?: AutopilotPhaseEntry[] };
    expectTypeOf<{ [K in keyof Top]: Top[K] }>().toEqualTypeOf<AutopilotSessionState>();
  });
  it('ReviewDecisionRecordSchema is ReviewDecisionRecord as written, one shape per kind', () => {
    type Inferred = z.infer<typeof ReviewDecisionRecordSchema>;
    // A written record's decidedBy is one of REVIEW_DECIDERS; `unknown` is only what the
    // session reader gives a record written before the field existed (ReadReviewDecision).
    type ByKind<T, K> = Extract<T, { kind: K }>;
    type Same<K> = { [P in keyof ByKind<Inferred, K>]: ByKind<Inferred, K>[P] };
    type Want<K> = {
      [P in keyof ByKind<ReviewDecisionRecord, K>]: ByKind<ReviewDecisionRecord, K>[P];
    };
    expectTypeOf<Same<'gate'>>().toEqualTypeOf<Want<'gate'>>();
    expectTypeOf<Same<'findings'>>().toEqualTypeOf<Want<'findings'>>();
    expectTypeOf<Same<'dismissed'>>().toEqualTypeOf<Want<'dismissed'>>();
    expectTypeOf<Same<'skipped'>>().toEqualTypeOf<Want<'skipped'>>();
    expectTypeOf<Inferred>().toExtend<ReviewDecisionRecord>();
    expectTypeOf<ReviewDecisionRecord>().toExtend<ReadReviewDecision>();
    expectTypeOf<ReviewDecisionRecord['decidedBy']>().toEqualTypeOf<ReviewDecider>();
  });
});
