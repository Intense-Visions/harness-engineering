import { buildCiReviewVerdict, type CiReviewVerdict } from '../verdict-schema';

/**
 * The outer transcript envelope `claude -p <instruction> --output-format json`
 * prints to stdout. The review verdict itself is a JSON *string* in `.result`.
 */
interface ClaudeTranscriptEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  /** A JSON string: `{"assessment":...,"findings":[...]}`. */
  result?: string;
}

/** The inner verdict, parsed out of the transcript `.result` string. */
interface ClaudeInnerVerdict {
  assessment: 'approve' | 'comment' | 'request-changes';
  findings?: unknown[];
}

/**
 * Map a `claude -p ... --output-format json` transcript envelope into a
 * normalized CiReviewVerdict.
 *
 * Two-stage envelope (confirmed against the real CLI, Task 10 smoke test):
 *   1. `JSON.parse(raw)` -> transcript envelope `{ type, is_error, result, ... }`
 *   2. `JSON.parse(envelope.result)` -> `{ assessment, findings }`
 *
 * Throws if either stage is not valid JSON, if the CLI reported `is_error: true`,
 * or if the `.result` field is missing — matching the parser error convention
 * (no silent pass on a malformed/error envelope).
 */
export function parseClaudeVerdict(raw: string): CiReviewVerdict {
  const envelope = JSON.parse(raw) as ClaudeTranscriptEnvelope;

  if (envelope.is_error === true) {
    throw new Error(
      `parseClaudeVerdict: claude transcript reported is_error=true (subtype=${envelope.subtype ?? 'unknown'})`
    );
  }
  if (typeof envelope.result !== 'string') {
    throw new Error(
      'parseClaudeVerdict: claude transcript envelope is missing a string `.result` field'
    );
  }

  // Stage 2: the verdict is a JSON string nested in `.result`. Throws on bad JSON.
  const inner = JSON.parse(envelope.result) as ClaudeInnerVerdict;

  // findings are still UNVALIDATED here; buildCiReviewVerdict schema-validates
  // them FIRST and then derives blockingFindings/exitCode from validated data.
  return buildCiReviewVerdict({
    runner: 'claude',
    ranLlmTier: true,
    assessment: inner.assessment,
    findings: inner.findings,
  });
}
