import { z } from 'zod';
import type { ReviewDomain } from '../types/context';

/** Schema version for CiReviewVerdict. Bump on breaking field changes. */
export const CI_REVIEW_VERDICT_SCHEMA_VERSION = 1 as const;

/**
 * Runner ids that map to a verdict.
 * 'local' = single-pass openai-compatible endpoint runner (kind: 'endpoint').
 * 'floor-only' = heuristic floor ran, no LLM tier.
 */
export const CI_RUNNERS = [
  'claude',
  'gemini',
  'antigravity',
  'codex',
  'cursor',
  'local',
  'floor-only',
] as const;
export type CiRunner = (typeof CI_RUNNERS)[number];

/** Assessment values — must stay in lockstep with core ReviewAssessment (output.ts). */
export const CI_ASSESSMENTS = ['approve', 'comment', 'request-changes'] as const;

/**
 * Single source of the valid finding `domain` values at the CI boundary. This is
 * the zod-enumerable mirror of the core `ReviewDomain` union
 * (src/review/types/context.ts), which exists only as a TS union type (no const
 * array), so we list the values here and pin them to the union with a
 * compile-time assertion below — there is no runtime list to reuse.
 *
 * The CI boundary REQUIRES producers (parsers, and Phase 2's live local provider)
 * to emit findings whose `domain` is a valid ReviewDomain. The local provider
 * will normalize raw model output to one of these values before it reaches the
 * schema; anything else is rejected here rather than cast through silently.
 */
export const CI_REVIEW_DOMAINS = [
  'compliance',
  'bug',
  'security',
  'architecture',
  'learnings',
] as const;

// Compile-time guard: CI_REVIEW_DOMAINS and core ReviewDomain must stay in sync.
// If a value is added/removed/renamed in either, one of these assignments fails
// to type-check, forcing the lists back into agreement.
type _DomainsCoverReviewDomain = (typeof CI_REVIEW_DOMAINS)[number] extends ReviewDomain
  ? true
  : never;
type _ReviewDomainCoversDomains = ReviewDomain extends (typeof CI_REVIEW_DOMAINS)[number]
  ? true
  : never;
const _assertDomainsCoverReviewDomain: _DomainsCoverReviewDomain = true;
const _assertReviewDomainCoversDomains: _ReviewDomainCoversDomains = true;
void _assertDomainsCoverReviewDomain;
void _assertReviewDomainCoversDomains;

/**
 * Zod schema for a single ReviewFinding. Field set MUST mirror the existing
 * core ReviewFinding interface (src/review/types/fan-out.ts) — do not redefine
 * the TS type; this schema validates objects that satisfy it at the CI boundary.
 * `domain` is constrained to the core ReviewDomain union (not an open string) so
 * the boundary actually mirrors ReviewFinding and the parser casts stay sound.
 */
const ReviewFindingSchema = z
  .object({
    id: z.string().min(1),
    file: z.string().min(1),
    lineRange: z.tuple([z.number(), z.number()]),
    domain: z.enum(CI_REVIEW_DOMAINS),
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

type ReviewFindingShape = z.infer<typeof ReviewFindingSchema>;

/**
 * Identity check used to assert that a blockingFindings entry is also present in
 * findings. Prefers a stable `id` match; falls back to structural (deep) equality
 * when ids are absent/empty so the invariant still holds for id-less producers.
 */
function findingsMatch(a: ReviewFindingShape, b: ReviewFindingShape): boolean {
  if (a.id && b.id) return a.id === b.id;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Derive the blockingFindings set from already-validated findings. Blocking ==
 * critical severity. This is the single source of truth for blockingFindings;
 * every parser MUST derive its blocking set from validated findings via this
 * helper rather than trusting a caller-supplied array.
 */
export function deriveBlockingFindings<T extends { severity: string }>(findings: T[]): T[] {
  return findings.filter((f) => f.severity === 'critical');
}

/**
 * Derive the CI exit code from the validated assessment and blocking set.
 * Non-zero (1) iff there is at least one blocking finding OR the assessment is
 * 'request-changes'; otherwise 0. Single source of truth for exitCode.
 */
export function deriveExitCode(
  assessment: (typeof CI_ASSESSMENTS)[number],
  blockingFindings: unknown[]
): number {
  return blockingFindings.length > 0 || assessment === 'request-changes' ? 1 : 0;
}

export const CiReviewVerdictSchema = z
  .object({
    schemaVersion: z.literal(CI_REVIEW_VERDICT_SCHEMA_VERSION),
    runner: z.enum(CI_RUNNERS),
    ranLlmTier: z.boolean(),
    assessment: z.enum(CI_ASSESSMENTS),
    findings: z.array(ReviewFindingSchema),
    blockingFindings: z.array(ReviewFindingSchema),
    exitCode: z.number().int(),
    skipped: z.boolean(),
    skipReason: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    // (b) Every blocking finding must itself be critical severity.
    for (const [i, f] of v.blockingFindings.entries()) {
      if (f.severity !== 'critical') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['blockingFindings', i, 'severity'],
          message: `blockingFindings[${i}] has severity '${f.severity}'; only 'critical' findings may block`,
        });
      }
    }

    // (a) Every blocking finding must also be present in findings (by id, else deep-equal).
    for (const [i, bf] of v.blockingFindings.entries()) {
      const present = v.findings.some((f) => findingsMatch(f, bf));
      if (!present) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['blockingFindings', i],
          message: `blockingFindings[${i}] (id='${bf.id}') is not present in findings`,
        });
      }
    }

    // (a') blockingFindings must equal exactly the critical findings — no missing
    // critical finding, and no extra/duplicated entry beyond the derived set.
    const criticalCount = v.findings.filter((f) => f.severity === 'critical').length;
    if (v.blockingFindings.length !== criticalCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockingFindings'],
        message: `blockingFindings (${v.blockingFindings.length}) must equal the critical findings in findings (${criticalCount})`,
      });
    }

    // (c) assessment / exitCode / blockingFindings consistency:
    //   - blockingFindings non-empty  => assessment MUST be 'request-changes' and exitCode MUST be non-zero.
    //   - assessment === 'request-changes' => exitCode MUST be non-zero.
    //   - no blocking findings AND assessment !== 'request-changes' => exitCode MUST be 0.
    const blocking = v.blockingFindings.length > 0;
    if (blocking && v.assessment !== 'request-changes') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assessment'],
        message: `assessment must be 'request-changes' when blockingFindings is non-empty (got '${v.assessment}')`,
      });
    }
    const mustExitNonZero = blocking || v.assessment === 'request-changes';
    if (mustExitNonZero && v.exitCode === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exitCode'],
        message: `exitCode must be non-zero when blockingFindings is non-empty or assessment is 'request-changes'`,
      });
    }
    if (!mustExitNonZero && v.exitCode !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exitCode'],
        message: `exitCode must be 0 when there are no blocking findings and assessment is not 'request-changes'`,
      });
    }
  });

export type CiReviewVerdict = z.infer<typeof CiReviewVerdictSchema>;

/** Parse + validate an unknown into a CiReviewVerdict. Throws ZodError on invalid input. */
export function parseCiReviewVerdict(input: unknown): CiReviewVerdict {
  return CiReviewVerdictSchema.parse(input);
}

/** Inputs every parser supplies; findings are still UNVALIDATED at this point. */
export interface CiReviewVerdictParts {
  runner: CiRunner;
  ranLlmTier: boolean;
  assessment: (typeof CI_ASSESSMENTS)[number];
  /** Raw, caller-supplied findings — validated here, never trusted as-is. */
  findings: unknown;
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Shared validate-then-derive builder used by ALL parsers.
 *
 * Trust-boundary order (security-relevant): the raw findings are schema-validated
 * FIRST (each finding must satisfy ReviewFindingSchema), and only then are
 * blockingFindings and exitCode DERIVED from the validated findings via the
 * shared helpers. Parsers never compute blockingFindings/exitCode from an
 * unchecked cast and never pass a caller-supplied blocking set. The fully-built
 * object is run back through parseCiReviewVerdict so the returned verdict already
 * satisfies every schema invariant (including the superRefine consistency rules).
 */
export function buildCiReviewVerdict(parts: CiReviewVerdictParts): CiReviewVerdict {
  // 1. Validate findings FIRST (defends against the unchecked cast).
  const findings = z.array(ReviewFindingSchema).parse(parts.findings ?? []);
  // 2. DERIVE blocking set + exit code from the VALIDATED findings only.
  const blockingFindings = deriveBlockingFindings(findings);
  const exitCode = deriveExitCode(parts.assessment, blockingFindings);
  // 3. Re-validate the assembled verdict so the result satisfies the full schema.
  return parseCiReviewVerdict({
    schemaVersion: CI_REVIEW_VERDICT_SCHEMA_VERSION,
    runner: parts.runner,
    ranLlmTier: parts.ranLlmTier,
    assessment: parts.assessment,
    findings,
    blockingFindings,
    exitCode,
    skipped: parts.skipped ?? false,
    skipReason: parts.skipReason,
  });
}
