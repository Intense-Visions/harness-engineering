import { buildCiReviewVerdict, type CiReviewVerdict } from '../verdict-schema';

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
  // findings are still UNVALIDATED here (the openai-compatible provider's raw
  // output); buildCiReviewVerdict schema-validates them FIRST and then derives
  // blockingFindings/exitCode from validated data. The CI boundary requires the
  // provider to emit valid ReviewDomain values (Phase 2's local provider will
  // normalize raw model output accordingly).
  return buildCiReviewVerdict({
    runner: 'local',
    ranLlmTier: true,
    assessment,
    findings: parsed.findings,
  });
}
