import {
  CI_REVIEW_VERDICT_SCHEMA_VERSION,
  parseCiReviewVerdict,
  type CiReviewVerdict,
} from '../verdict-schema';

const VERDICT_MAP: Record<string, CiReviewVerdict['assessment']> = {
  approve: 'approve',
  comment: 'comment',
  'request-changes': 'request-changes',
};

/**
 * Map a single-pass openai-compatible JSON review response into a CiReviewVerdict.
 *
 * The `local` endpoint runner does ONE LLM-judgment pass over the diff (no agent
 * harness), so the provider returns a flat envelope: `{ assessment, findings }`.
 * The findings already satisfy the core ReviewFinding shape (the provider is
 * given the ReviewFinding response schema). `raw` is the JSON string the provider
 * produced (the `result` of an AnalysisResponse, re-serialized) so this parser
 * stays symmetric with the agent-cli parsers (string in, verdict out).
 */
export function parseLocalVerdict(raw: string): CiReviewVerdict {
  const parsed = JSON.parse(raw) as { assessment?: string; findings?: unknown[] };
  const assessment = VERDICT_MAP[parsed.assessment ?? 'comment'] ?? 'comment';
  const findings = (parsed.findings ?? []) as CiReviewVerdict['findings'];
  const blockingFindings = findings.filter((f) => f.severity === 'critical');
  return parseCiReviewVerdict({
    schemaVersion: CI_REVIEW_VERDICT_SCHEMA_VERSION,
    runner: 'local',
    ranLlmTier: true,
    assessment,
    findings,
    blockingFindings,
    exitCode: blockingFindings.length > 0 || assessment === 'request-changes' ? 1 : 0,
    skipped: false,
  });
}
