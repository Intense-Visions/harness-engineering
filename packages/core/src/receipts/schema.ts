import { z } from 'zod';
import {
  ESCAPED_FROM_STAGES,
  FULL_SHA_PATTERN,
  FINDING_CLASSES,
  REVIEW_BACKENDS,
  REVIEW_BASE_SOURCES,
  REVIEW_MOMENTS,
  REVIEW_TIER_DEMOTIONS,
  REVIEW_TIERS,
  Ok,
  Err,
  type EscapedFrom,
  type FindingClass,
  type Result,
  type ReviewReceipt,
} from '@harness-engineering/types';

/** Severities that block a review. `suggestion` is advisory. */
export const BLOCKING_SEVERITIES = ['critical', 'important'] as const;

export function isBlockingSeverity(severity: string): boolean {
  return (BLOCKING_SEVERITIES as readonly string[]).includes(severity);
}

/** A blocking finding as the schema admits it: blocking severity with both attribution fields. */
function isBlockingFinding(f: ReceiptFinding): f is BlockingReceiptFinding {
  return (
    isBlockingSeverity(f.severity) && f.findingClass !== undefined && f.escapedFrom !== undefined
  );
}

/** Drops the pass-through index signature a loose object infers, leaving the declared fields. */
type Declared<T> = { [K in keyof T as string extends K ? never : K]: T[K] };

/**
 * The part of a ReviewFinding (review/types/fan-out.ts) that receipt consumers read; other
 * finding fields pass through. Derived from the schema below rather than `Pick<ReviewFinding>`:
 * importing review/types would take this module's dependency depth past the threshold
 * (tests/receipts/finding-compat.test.ts ties the two together).
 */
export type ReceiptFinding = Declared<z.infer<typeof ReceiptFindingSchema>>;

/** A finding that blocks a review. The schema requires both attribution fields on it. */
export type BlockingReceiptFinding = ReceiptFinding & {
  severity: (typeof BLOCKING_SEVERITIES)[number];
  findingClass: FindingClass;
  escapedFrom: EscapedFrom;
};

/**
 * What each reviewer writes: its findings and the diff files it read (`base`..`head`: the range
 * it was given, `head` the commit read).
 */
export type ReviewerFindingsFile = Omit<z.infer<typeof ReviewerFindingsFileSchema>, 'findings'> & {
  findings: ReceiptFinding[];
};

/** A reviewer id is also a file stem (`<id>.json`), so it must be path-safe. */
export const REVIEWER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const reviewerId = z.string().regex(REVIEWER_ID_PATTERN, 'must match ^[a-z][a-z0-9-]*$');
const sha = z.string().regex(FULL_SHA_PATTERN, 'must be a resolved 40-character sha');
const count = z.number().int().nonnegative();

export const ReviewerRecordSchema = z.object({
  id: reviewerId,
  required: z.boolean(),
  ran: z.boolean(),
  modelTier: z.string().min(1).exactOptional(),
  findingsPath: z.string().min(1).exactOptional(),
  skippedReason: z.string().min(1).exactOptional(),
});

export const ReviewReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    moment: z.enum(REVIEW_MOMENTS),
    tier: z.enum(REVIEW_TIERS),
    computedTier: z.enum(REVIEW_TIERS).exactOptional(),
    tierReasons: z.array(z.string().min(1)).exactOptional(),
    demotion: z.enum(REVIEW_TIER_DEMOTIONS).exactOptional(),
    backend: z.enum(REVIEW_BACKENDS),
    diff: z.object({
      base: sha,
      head: sha,
      baseSource: z.enum(REVIEW_BASE_SOURCES).exactOptional(),
      target: z
        .string()
        .regex(/^refs\/remotes\/./, 'must be a full remote-tracking ref (refs/remotes/...)')
        .exactOptional(),
    }),
    coldContext: z.boolean(),
    priorFindingsSupplied: z.boolean(),
    reviewers: z.array(ReviewerRecordSchema).min(1),
    blocking: count,
    advisory: count,
  })
  .superRefine((r, ctx) => {
    // A demotion says a review ran below its computed tier, so it is valid only on one. A final
    // or standalone review is always computed full, so it needs no computedTier to say so.
    const computedFull =
      r.computedTier === 'full' || (r.computedTier === undefined && r.moment !== 'phase');
    if (r.demotion !== undefined && !(r.tier === 'light' && computedFull)) {
      ctx.addIssue({
        code: 'custom',
        path: ['demotion'],
        message:
          'demotion is set only when tier is light and the computed tier is full (computedTier ' +
          'full, or a final or standalone review)',
      });
    }
    if (r.diff.target !== undefined && r.moment !== 'final') {
      const message = 'target is set only on a final receipt';
      ctx.addIssue({ code: 'custom', path: ['diff', 'target'], message });
    }
  });

export const ReceiptFindingSchema = z
  .looseObject({
    id: z.string().min(1),
    file: z.string().min(1),
    lineRange: z.tuple([count, count]),
    severity: z.enum(['critical', 'important', 'suggestion']),
    title: z.string().min(1),
    findingClass: z.enum(FINDING_CLASSES).exactOptional(),
    escapedFrom: z.enum(ESCAPED_FROM_STAGES).exactOptional(),
  })
  .superRefine((f, ctx) => {
    if (!isBlockingSeverity(f.severity)) return;
    for (const key of ['findingClass', 'escapedFrom'] as const) {
      if (f[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `a ${f.severity} finding must carry ${key}`,
        });
      }
    }
  });

export const ReviewerFindingsFileSchema = z.object({
  schemaVersion: z.literal(1),
  reviewerId,
  base: sha,
  head: sha,
  examinedFiles: z.array(z.string().min(1)),
  findings: z.array(ReceiptFindingSchema),
});

function issueText(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

export function parseReviewReceipt(raw: unknown): Result<ReviewReceipt, Error> {
  const r = ReviewReceiptSchema.safeParse(raw);
  if (r.success) return Ok(r.data);
  return Err(new Error(`invalid review receipt: ${issueText(r.error)}`));
}

export function parseReviewerFindingsFile(raw: unknown): Result<ReviewerFindingsFile, Error> {
  const r = ReviewerFindingsFileSchema.safeParse(raw);
  if (r.success) return Ok(r.data);
  return Err(new Error(`invalid reviewer findings file: ${issueText(r.error)}`));
}

export interface ReviewFindingTally {
  /** Every `critical` or `important` finding, in reviewer then file order. */
  blocking: BlockingReceiptFinding[];
  /** How many `suggestion` findings the files hold. */
  advisory: number;
}

/**
 * The one counting rule the receipt and the gate share: every
 * finding in every reviewer findings file counts once, as written. It is blocking when its
 * severity is `critical` or `important` and advisory otherwise. Nothing is merged by location;
 * the gate separately requires finding ids to be unique across a review.
 */
export function tallyReviewFindings(files: readonly ReviewerFindingsFile[]): ReviewFindingTally {
  const all = files.flatMap((file) => file.findings);
  const blocking = all.filter(isBlockingFinding);
  return { blocking, advisory: all.filter((f) => !isBlockingSeverity(f.severity)).length };
}
