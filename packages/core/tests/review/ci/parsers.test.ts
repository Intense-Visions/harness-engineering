import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseClaudeVerdict } from '../../../src/review/ci/parsers/claude';
import { parseGeminiVerdict } from '../../../src/review/ci/parsers/gemini';
import { parseCodexVerdict } from '../../../src/review/ci/parsers/codex';
import { parseLocalVerdict } from '../../../src/review/ci/parsers/local';
import { parseCiReviewVerdict } from '../../../src/review/ci/verdict-schema';

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('claude verdict parser', () => {
  it('maps raw claude output to a schema-valid CiReviewVerdict', () => {
    const v = parseClaudeVerdict(fx('claude-verdict.json'));
    const validated = parseCiReviewVerdict(v); // throws if invalid
    expect(validated.runner).toBe('claude');
    expect(validated.ranLlmTier).toBe(true);
    expect(validated.assessment).toBe('request-changes');
    expect(validated.blockingFindings.every((f) => f.severity === 'critical')).toBe(true);
  });

  it('throws on non-JSON input', () => {
    expect(() => parseClaudeVerdict('not json')).toThrow();
  });
});

describe('gemini verdict parser', () => {
  it('maps gemini review envelope to a schema-valid CiReviewVerdict', () => {
    const v = parseCiReviewVerdict(parseGeminiVerdict(fx('gemini-verdict.json')));
    expect(v.runner).toBe('gemini');
    expect(v.assessment).toBe('comment');
    expect(v.blockingFindings).toHaveLength(0);
    expect(v.exitCode).toBe(0);
  });
});

describe('codex verdict parser', () => {
  it('maps codex clean result to an approve verdict with exitCode 0', () => {
    const v = parseCiReviewVerdict(parseCodexVerdict(fx('codex-verdict.json')));
    expect(v.runner).toBe('codex');
    expect(v.assessment).toBe('approve');
    expect(v.findings).toHaveLength(0);
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
});
