import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseClaudeVerdict } from '../../../src/review/ci/parsers/claude';
import { parseGeminiVerdict } from '../../../src/review/ci/parsers/gemini';
import { parseCodexVerdict } from '../../../src/review/ci/parsers/codex';
import { parseAntigravityVerdict } from '../../../src/review/ci/parsers/antigravity';
import { parseLocalVerdict } from '../../../src/review/ci/parsers/local';
import { parseCiReviewVerdict } from '../../../src/review/ci/verdict-schema';

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('claude verdict parser', () => {
  it('unwraps the transcript `.result` JSON string into a schema-valid CiReviewVerdict', () => {
    // Real shape: outer transcript envelope whose `.result` is a JSON STRING.
    const v = parseClaudeVerdict(fx('claude-verdict.json'));
    const validated = parseCiReviewVerdict(v); // throws if invalid
    expect(validated.runner).toBe('claude');
    expect(validated.ranLlmTier).toBe(true);
    expect(validated.assessment).toBe('request-changes');
    expect(validated.findings).toHaveLength(1);
    expect(validated.blockingFindings.every((f) => f.severity === 'critical')).toBe(true);
    expect(validated.exitCode).toBe(1);
  });

  it('approves with exitCode 0 when the inner verdict has no blocking findings', () => {
    const envelope = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: JSON.stringify({ assessment: 'approve', findings: [] }),
    });
    const v = parseClaudeVerdict(envelope);
    expect(v.assessment).toBe('approve');
    expect(v.findings).toHaveLength(0);
    expect(v.exitCode).toBe(0);
  });

  it('throws on non-JSON input (does not silently pass)', () => {
    expect(() => parseClaudeVerdict('not json')).toThrow();
  });

  it('throws when the transcript reports is_error=true (does not silently pass)', () => {
    const errEnvelope = JSON.stringify({
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      result: 'partial output',
    });
    expect(() => parseClaudeVerdict(errEnvelope)).toThrow(/is_error/);
  });

  it('throws when the `.result` field is missing', () => {
    const noResult = JSON.stringify({ type: 'result', is_error: false });
    expect(() => parseClaudeVerdict(noResult)).toThrow(/result/);
  });

  it('throws when the inner `.result` string is not valid JSON', () => {
    const badInner = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'this is not json',
    });
    expect(() => parseClaudeVerdict(badInner)).toThrow();
  });
});

describe('codex verdict parser', () => {
  it('extracts the agent_message text from the JSONL stream into an approve verdict', () => {
    // Real shape: JSONL event stream; verdict lives in item.completed/agent_message.text.
    const v = parseCiReviewVerdict(parseCodexVerdict(fx('codex-verdict.jsonl')));
    expect(v.runner).toBe('codex');
    expect(v.assessment).toBe('approve');
    expect(v.findings).toHaveLength(0);
    expect(v.exitCode).toBe(0);
  });

  it('takes the LAST agent_message when multiple are present', () => {
    const stream = [
      JSON.stringify({ type: 'thread.started', thread_id: 'th_1' }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'i0',
          type: 'agent_message',
          text: JSON.stringify({ assessment: 'comment', findings: [] }),
        },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'i1',
          type: 'agent_message',
          text: JSON.stringify({
            assessment: 'request-changes',
            findings: [
              {
                id: 'bug-1',
                file: 'src/x.ts',
                lineRange: [1, 2],
                domain: 'bug',
                severity: 'critical',
                title: 'boom',
                rationale: 'because',
                evidence: ['src/x.ts:1'],
                validatedBy: 'heuristic',
              },
            ],
          }),
        },
      }),
      JSON.stringify({ type: 'turn.completed' }),
    ].join('\n');
    const v = parseCodexVerdict(stream);
    expect(v.assessment).toBe('request-changes');
    expect(v.blockingFindings).toHaveLength(1);
    expect(v.exitCode).toBe(1);
  });

  it('skips non-JSON noise lines defensively', () => {
    const stream = [
      'progress: spinning up sandbox...',
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'i0',
          type: 'agent_message',
          text: JSON.stringify({ assessment: 'approve', findings: [] }),
        },
      }),
    ].join('\n');
    const v = parseCodexVerdict(stream);
    expect(v.assessment).toBe('approve');
  });

  it('throws when no agent_message event is present (does not silently pass)', () => {
    const stream = [
      JSON.stringify({ type: 'thread.started', thread_id: 'th_1' }),
      JSON.stringify({ type: 'turn.completed' }),
    ].join('\n');
    expect(() => parseCodexVerdict(stream)).toThrow(/agent_message/);
  });

  it('throws when the agent_message text is not valid JSON', () => {
    const stream = JSON.stringify({
      type: 'item.completed',
      item: { id: 'i0', type: 'agent_message', text: 'not json' },
    });
    expect(() => parseCodexVerdict(stream)).toThrow();
  });
});

describe('antigravity verdict parser (single-stage `agy --print` plain-text JSON)', () => {
  it('parses the real plain-text JSON output directly into a schema-valid verdict', () => {
    // Real captured stdout: the verdict object emitted DIRECTLY (no transcript
    // wrapper), with a trailing newline.
    const v = parseCiReviewVerdict(parseAntigravityVerdict(fx('antigravity-verdict.txt')));
    expect(v.runner).toBe('antigravity');
    expect(v.ranLlmTier).toBe(true);
    expect(v.assessment).toBe('approve');
    expect(v.findings).toHaveLength(0);
    expect(v.blockingFindings).toHaveLength(0);
    expect(v.exitCode).toBe(0);
  });

  it('strips a ```json fenced block before parsing', () => {
    const fenced = [
      '```json',
      JSON.stringify({
        assessment: 'request-changes',
        findings: [
          {
            id: 'bug-1',
            file: 'src/x.ts',
            lineRange: [1, 2],
            domain: 'bug',
            severity: 'critical',
            title: 'boom',
            rationale: 'because',
            evidence: ['src/x.ts:1'],
            validatedBy: 'heuristic',
          },
        ],
      }),
      '```',
    ].join('\n');
    const v = parseAntigravityVerdict(fenced);
    expect(v.assessment).toBe('request-changes');
    expect(v.blockingFindings).toHaveLength(1);
    expect(v.exitCode).toBe(1);
  });

  it('extracts the first balanced JSON object when wrapped in surrounding prose', () => {
    const prose =
      'Here is my review of the diff:\n\n' +
      JSON.stringify({ assessment: 'comment', findings: [] }) +
      '\n\nLet me know if you need more detail.';
    const v = parseAntigravityVerdict(prose);
    expect(v.assessment).toBe('comment');
    expect(v.findings).toHaveLength(0);
    expect(v.exitCode).toBe(0);
  });

  it('throws when no parseable JSON object is present (does not silently pass)', () => {
    expect(() => parseAntigravityVerdict('I could not complete the review.')).toThrow(
      /no parseable JSON object/
    );
  });
});

describe('gemini verdict parser (UNVERIFIED — preset downgraded to unsupported)', () => {
  // The gemini agent-cli preset is `supported: false` until its output envelope
  // is captured in CI. The parser is retained (and still exported) against the
  // representative envelope shape so it can be re-enabled without rewriting tests.
  it('maps the representative gemini review envelope to a schema-valid CiReviewVerdict', () => {
    const v = parseCiReviewVerdict(parseGeminiVerdict(fx('gemini-verdict.json')));
    expect(v.runner).toBe('gemini');
    expect(v.assessment).toBe('comment');
    expect(v.blockingFindings).toHaveLength(0);
    expect(v.exitCode).toBe(0);
  });
});

describe('local (single-pass endpoint) verdict parser', () => {
  it('maps an openai-compatible review response to a schema-valid CiReviewVerdict', () => {
    const v = parseCiReviewVerdict(parseLocalVerdict(fx('local-verdict.json')));
    expect(v.runner).toBe('local');
    expect(v.ranLlmTier).toBe(true);
    expect(v.assessment).toBe('request-changes');
    expect(v.findings).toHaveLength(2);
    expect(v.blockingFindings).toHaveLength(1);
    expect(v.blockingFindings.every((f) => f.severity === 'critical')).toBe(true);
    expect(v.exitCode).toBe(1);
  });

  it('defaults to comment with exitCode 0 when the endpoint returns no findings', () => {
    const v = parseLocalVerdict(JSON.stringify({ assessment: 'approve', findings: [] }));
    expect(v.assessment).toBe('approve');
    expect(v.findings).toHaveLength(0);
    expect(v.exitCode).toBe(0);
  });

  it('throws on non-JSON input', () => {
    expect(() => parseLocalVerdict('not json')).toThrow();
  });

  it('rejects malformed findings at the schema boundary (highest-risk producer)', () => {
    // findings are schema-validated FIRST: an invalid domain ('style') and a
    // missing required field must be rejected rather than cast through.
    const badDomain = JSON.stringify({
      assessment: 'comment',
      findings: [
        {
          id: 'x-1',
          file: 'src/x.ts',
          lineRange: [1, 1],
          domain: 'style',
          severity: 'suggestion',
          title: 't',
          rationale: 'r',
          evidence: [],
          validatedBy: 'heuristic',
        },
      ],
    });
    expect(() => parseLocalVerdict(badDomain)).toThrow();

    const missingField = JSON.stringify({
      assessment: 'comment',
      findings: [{ id: 'x-1' }],
    });
    expect(() => parseLocalVerdict(missingField)).toThrow();
  });
});
