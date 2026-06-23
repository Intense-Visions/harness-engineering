import { describe, it, expect } from 'vitest';
import {
  CiReviewVerdictSchema,
  parseCiReviewVerdict,
  CI_REVIEW_VERDICT_SCHEMA_VERSION,
  CI_RUNNERS,
} from '../../../src/review/ci/verdict-schema';
import type { ReviewFinding } from '../../../src/review/types';

function makeFinding(over: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'bug-src-auth-ts-42',
    file: 'src/auth.ts',
    lineRange: [40, 45],
    domain: 'bug',
    severity: 'important',
    title: 'Test finding',
    rationale: 'because',
    evidence: ['line 42'],
    validatedBy: 'heuristic',
    ...over,
  };
}

function makeVerdict(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    runner: 'claude',
    ranLlmTier: true,
    assessment: 'request-changes',
    findings: [makeFinding()],
    blockingFindings: [makeFinding({ severity: 'critical' })],
    exitCode: 1,
    skipped: false,
    ...over,
  };
}

describe('CiReviewVerdictSchema', () => {
  it('parses a valid verdict and reuses ReviewFinding shape', () => {
    const v = parseCiReviewVerdict(makeVerdict());
    expect(v.runner).toBe('claude');
    expect(v.findings[0].domain).toBe('bug');
  });

  it('rejects a schemaVersion other than the current literal', () => {
    expect(() => parseCiReviewVerdict(makeVerdict({ schemaVersion: 2 }))).toThrow();
    expect(CI_REVIEW_VERDICT_SCHEMA_VERSION).toBe(1);
  });

  it('rejects an unknown assessment', () => {
    expect(() => parseCiReviewVerdict(makeVerdict({ assessment: 'nope' }))).toThrow();
  });

  it('rejects a malformed finding (missing required ReviewFinding fields)', () => {
    expect(() => parseCiReviewVerdict(makeVerdict({ findings: [{ id: 'x' }] }))).toThrow();
  });

  it('includes the local endpoint runner in the CI_RUNNERS enum', () => {
    expect(CI_RUNNERS).toContain('local');
    expect(CI_RUNNERS).toEqual(['claude', 'gemini', 'codex', 'cursor', 'local', 'floor-only']);
  });

  it('parses a local endpoint verdict (ranLlmTier true, single-pass)', () => {
    const v = parseCiReviewVerdict(
      makeVerdict({ runner: 'local', ranLlmTier: true, assessment: 'approve' })
    );
    expect(v.runner).toBe('local');
    expect(v.ranLlmTier).toBe(true);
  });

  it('allows floor-only runner with ranLlmTier false and skipped reason', () => {
    const v = parseCiReviewVerdict(
      makeVerdict({
        runner: 'floor-only',
        ranLlmTier: false,
        skipped: true,
        skipReason: 'no secret',
      })
    );
    expect(v.skipReason).toBe('no secret');
  });

  it('exposes a Zod schema object', () => {
    expect(typeof CiReviewVerdictSchema.parse).toBe('function');
  });
});
