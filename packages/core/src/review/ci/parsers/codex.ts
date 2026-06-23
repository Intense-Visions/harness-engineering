import {
  CI_REVIEW_VERDICT_SCHEMA_VERSION,
  parseCiReviewVerdict,
  type CiReviewVerdict,
} from '../verdict-schema';

const RESULT_MAP: Record<string, CiReviewVerdict['assessment']> = {
  approve: 'approve',
  comment: 'comment',
  'request-changes': 'request-changes',
};

/** Map a codex headless code-review result ({ result, findings }) into a CiReviewVerdict. */
export function parseCodexVerdict(raw: string): CiReviewVerdict {
  const parsed = JSON.parse(raw) as { result?: string; findings?: unknown[] };
  const assessment = RESULT_MAP[parsed.result ?? 'comment'] ?? 'comment';
  const findings = (parsed.findings ?? []) as CiReviewVerdict['findings'];
  const blockingFindings = findings.filter((f) => f.severity === 'critical');
  return parseCiReviewVerdict({
    schemaVersion: CI_REVIEW_VERDICT_SCHEMA_VERSION,
    runner: 'codex',
    ranLlmTier: true,
    assessment,
    findings,
    blockingFindings,
    exitCode: blockingFindings.length > 0 || assessment === 'request-changes' ? 1 : 0,
    skipped: false,
  });
}
