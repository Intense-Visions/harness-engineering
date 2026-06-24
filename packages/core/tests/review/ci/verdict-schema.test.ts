import { describe, it, expect } from 'vitest';
import {
  CiReviewVerdictSchema,
  parseCiReviewVerdict,
  CI_REVIEW_VERDICT_SCHEMA_VERSION,
  CI_RUNNERS,
  CI_REVIEW_DOMAINS,
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

function makeCritical(over: Partial<ReviewFinding> = {}): ReviewFinding {
  return makeFinding({
    id: 'bug-src-auth-ts-99',
    severity: 'critical',
    title: 'Critical finding',
    ...over,
  });
}

/**
 * A consistent valid verdict: the single critical finding is both in `findings`
 * and mirrored in `blockingFindings`, assessment is 'request-changes', exitCode 1.
 */
function makeVerdict(over: Record<string, unknown> = {}) {
  const critical = makeCritical();
  return {
    schemaVersion: 1,
    runner: 'claude',
    ranLlmTier: true,
    assessment: 'request-changes',
    findings: [makeFinding(), critical],
    blockingFindings: [critical],
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
    expect(CI_RUNNERS).toEqual([
      'claude',
      'gemini',
      'antigravity',
      'codex',
      'cursor',
      'local',
      'floor-only',
    ]);
  });

  it('includes the antigravity runner in the CI_RUNNERS enum', () => {
    expect(CI_RUNNERS).toContain('antigravity');
  });

  it('parses an antigravity verdict (single-stage agent-cli, ranLlmTier true)', () => {
    const v = parseCiReviewVerdict(
      makeVerdict({
        runner: 'antigravity',
        ranLlmTier: true,
        assessment: 'approve',
        findings: [],
        blockingFindings: [],
        exitCode: 0,
      })
    );
    expect(v.runner).toBe('antigravity');
    expect(v.ranLlmTier).toBe(true);
  });

  it('parses a local endpoint verdict (ranLlmTier true, single-pass)', () => {
    const v = parseCiReviewVerdict(
      makeVerdict({
        runner: 'local',
        ranLlmTier: true,
        assessment: 'approve',
        findings: [],
        blockingFindings: [],
        exitCode: 0,
      })
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
        assessment: 'comment',
        findings: [],
        blockingFindings: [],
        exitCode: 0,
      })
    );
    expect(v.skipReason).toBe('no secret');
  });

  it('exposes a Zod schema object', () => {
    expect(typeof CiReviewVerdictSchema.parse).toBe('function');
  });
});

describe('CiReviewVerdictSchema — finding domain (IMP-3 trust boundary)', () => {
  it('exposes CI_REVIEW_DOMAINS mirroring the core ReviewDomain union', () => {
    expect(CI_REVIEW_DOMAINS).toEqual([
      'compliance',
      'bug',
      'security',
      'architecture',
      'learnings',
    ]);
  });

  it('accepts every valid ReviewDomain value', () => {
    for (const domain of CI_REVIEW_DOMAINS) {
      const finding = makeCritical({ domain });
      const v = parseCiReviewVerdict(
        makeVerdict({ findings: [finding], blockingFindings: [finding] })
      );
      expect(v.findings[0].domain).toBe(domain);
    }
  });

  it("rejects a finding domain outside ReviewDomain (e.g. 'style')", () => {
    const bad = makeFinding({ domain: 'style' as ReviewFinding['domain'] });
    expect(() =>
      parseCiReviewVerdict(makeVerdict({ findings: [bad], blockingFindings: [], exitCode: 1 }))
    ).toThrow();
  });
});

describe('CiReviewVerdictSchema — superRefine invariants (IMP-2 trust boundary)', () => {
  it('(a) throws when a blocking finding is NOT present in findings', () => {
    const orphan = makeCritical({ id: 'bug-not-in-findings' });
    expect(() =>
      parseCiReviewVerdict(
        makeVerdict({
          findings: [makeFinding()],
          blockingFindings: [orphan],
          assessment: 'request-changes',
          exitCode: 1,
        })
      )
    ).toThrow(/not present in findings/);
  });

  it('(b) throws when a blocking finding is not critical severity', () => {
    const important = makeFinding({ id: 'bug-imp', severity: 'important' });
    expect(() =>
      parseCiReviewVerdict(
        makeVerdict({
          findings: [important],
          blockingFindings: [important],
          assessment: 'request-changes',
          exitCode: 1,
        })
      )
    ).toThrow(/only 'critical' findings may block/);
  });

  it("(a') throws when blockingFindings omits a critical finding present in findings", () => {
    const critical = makeCritical();
    expect(() =>
      parseCiReviewVerdict(
        makeVerdict({
          findings: [makeFinding(), critical],
          blockingFindings: [], // critical not surfaced as blocking
          assessment: 'request-changes',
          exitCode: 1,
        })
      )
    ).toThrow(/must equal the critical findings/);
  });

  it("(c) throws when blockingFindings non-empty but assessment is not 'request-changes'", () => {
    const critical = makeCritical();
    expect(() =>
      parseCiReviewVerdict(
        makeVerdict({
          findings: [critical],
          blockingFindings: [critical],
          assessment: 'comment',
          exitCode: 1,
        })
      )
    ).toThrow(/assessment must be 'request-changes'/);
  });

  it('(c) throws when exitCode is 0 but a blocking finding exists', () => {
    const critical = makeCritical();
    expect(() =>
      parseCiReviewVerdict(
        makeVerdict({
          findings: [critical],
          blockingFindings: [critical],
          assessment: 'request-changes',
          exitCode: 0,
        })
      )
    ).toThrow(/exitCode must be non-zero/);
  });

  it("(c) throws when assessment is 'request-changes' but exitCode is 0 (no blockers)", () => {
    expect(() =>
      parseCiReviewVerdict(
        makeVerdict({
          findings: [makeFinding()],
          blockingFindings: [],
          assessment: 'request-changes',
          exitCode: 0,
        })
      )
    ).toThrow(/exitCode must be non-zero/);
  });

  it('(c) throws when exitCode is non-zero but there are no blockers and assessment is not request-changes', () => {
    expect(() =>
      parseCiReviewVerdict(
        makeVerdict({
          findings: [makeFinding()],
          blockingFindings: [],
          assessment: 'comment',
          exitCode: 1,
        })
      )
    ).toThrow(/exitCode must be 0/);
  });

  it('accepts a consistent no-blocker comment verdict (exitCode 0)', () => {
    const v = parseCiReviewVerdict(
      makeVerdict({
        findings: [makeFinding()],
        blockingFindings: [],
        assessment: 'comment',
        exitCode: 0,
      })
    );
    expect(v.exitCode).toBe(0);
    expect(v.blockingFindings).toHaveLength(0);
  });
});
