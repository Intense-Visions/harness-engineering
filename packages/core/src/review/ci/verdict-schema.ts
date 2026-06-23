import { z } from 'zod';

/** Schema version for CiReviewVerdict. Bump on breaking field changes. */
export const CI_REVIEW_VERDICT_SCHEMA_VERSION = 1 as const;

/**
 * Runner ids that map to a verdict.
 * 'local' = single-pass openai-compatible endpoint runner (kind: 'endpoint').
 * 'floor-only' = heuristic floor ran, no LLM tier.
 */
export const CI_RUNNERS = ['claude', 'gemini', 'codex', 'cursor', 'local', 'floor-only'] as const;
export type CiRunner = (typeof CI_RUNNERS)[number];

/** Assessment values — must stay in lockstep with core ReviewAssessment (output.ts). */
export const CI_ASSESSMENTS = ['approve', 'comment', 'request-changes'] as const;

/**
 * Zod schema for a single ReviewFinding. Field set MUST mirror the existing
 * core ReviewFinding interface (src/review/types/fan-out.ts) — do not redefine
 * the TS type; this schema validates objects that satisfy it at the CI boundary.
 */
const ReviewFindingSchema = z
  .object({
    id: z.string().min(1),
    file: z.string().min(1),
    lineRange: z.tuple([z.number(), z.number()]),
    domain: z.string().min(1),
    severity: z.enum(['critical', 'important', 'suggestion']),
    title: z.string().min(1),
    rationale: z.string().min(1),
    suggestion: z.string().optional(),
    evidence: z.array(z.string()),
    validatedBy: z.enum(['mechanical', 'graph', 'heuristic']),
    cweId: z.string().optional(),
    owaspCategory: z.string().optional(),
    confidence: z
      .union([
        z.enum(['high', 'medium', 'low']),
        z.literal(25),
        z.literal(50),
        z.literal(75),
        z.literal(100),
      ])
      .optional(),
    remediation: z.string().optional(),
    references: z.array(z.string()).optional(),
    trustScore: z.number().optional(),
    rubricItemId: z.string().optional(),
    subagent: z.string().optional(),
  })
  .passthrough();

export const CiReviewVerdictSchema = z.object({
  schemaVersion: z.literal(CI_REVIEW_VERDICT_SCHEMA_VERSION),
  runner: z.enum(CI_RUNNERS),
  ranLlmTier: z.boolean(),
  assessment: z.enum(CI_ASSESSMENTS),
  findings: z.array(ReviewFindingSchema),
  blockingFindings: z.array(ReviewFindingSchema),
  exitCode: z.number().int(),
  skipped: z.boolean(),
  skipReason: z.string().optional(),
});

export type CiReviewVerdict = z.infer<typeof CiReviewVerdictSchema>;

/** Parse + validate an unknown into a CiReviewVerdict. Throws ZodError on invalid input. */
export function parseCiReviewVerdict(input: unknown): CiReviewVerdict {
  return CiReviewVerdictSchema.parse(input);
}
