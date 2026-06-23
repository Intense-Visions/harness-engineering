import { buildCiReviewVerdict, type CiReviewVerdict } from '../verdict-schema';

const VERDICT_MAP: Record<string, CiReviewVerdict['assessment']> = {
  approve: 'approve',
  comment: 'comment',
  'request-changes': 'request-changes',
};

/** Map a gemini headless code-review envelope ({ review: { verdict, issues } }) into a CiReviewVerdict. */
export function parseGeminiVerdict(raw: string): CiReviewVerdict {
  const parsed = JSON.parse(raw) as { review?: { verdict?: string; issues?: unknown[] } };
  const assessment = VERDICT_MAP[parsed.review?.verdict ?? 'comment'] ?? 'comment';
  // issues are still UNVALIDATED here; buildCiReviewVerdict schema-validates them
  // FIRST and then derives blockingFindings/exitCode from validated data.
  return buildCiReviewVerdict({
    runner: 'gemini',
    ranLlmTier: true,
    assessment,
    findings: parsed.review?.issues,
  });
}
