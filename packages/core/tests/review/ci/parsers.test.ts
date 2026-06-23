import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseClaudeVerdict } from '../../../src/review/ci/parsers/claude';
import { parseGeminiVerdict } from '../../../src/review/ci/parsers/gemini';
import { parseCodexVerdict } from '../../../src/review/ci/parsers/codex';
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
