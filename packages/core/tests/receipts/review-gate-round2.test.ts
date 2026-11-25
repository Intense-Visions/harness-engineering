import { describe, it, expect } from 'vitest';
import { validateReviewReceipt, type ReviewGateContext } from '../../src/receipts/review-gate';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const OTHER = 'c'.repeat(40);
const FULL = ['compliance', 'bug', 'security', 'architecture'];

const record = (id: string) => ({ id, required: true, ran: true, findingsPath: `${id}.json` });
const receipt = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  moment: 'phase',
  tier: 'full',
  backend: 'agent',
  diff: { base: BASE, head: HEAD },
  coldContext: true,
  priorFindingsSupplied: false,
  reviewers: FULL.map(record),
  blocking: 0,
  advisory: 0,
  ...over,
});
const light = (id: string, over: Record<string, unknown> = {}) =>
  receipt({ tier: 'light', reviewers: [record(id)], ...over });
const finding = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  file: 'src/a.ts',
  lineRange: [1, 1],
  severity: 'important',
  title: `finding ${id}`,
  findingClass: 'edge-case',
  escapedFrom: 'execution',
  ...over,
});
const file = (id: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    reviewerId: id,
    base: BASE,
    head: HEAD,
    examinedFiles: ['src/a.ts'],
    findings: [],
    ...over,
  });
const ctx = (over: Partial<ReviewGateContext> = {}): ReviewGateContext => ({
  head: HEAD,
  diffFiles: ['src/a.ts', 'src/b.ts'],
  readFindings: (p) => file(p.replace(/\.json$/, '')),
  expectedMoment: { status: 'known', moment: 'phase' },
  baseIsAncestor: true,
  worktreeClean: true,
  phaseBase: { status: 'resolved', base: BASE, source: 'starting-commit' },
  mergeBase: BASE,
  ...over,
});
const codes = (r: ReturnType<typeof validateReviewReceipt>) => r.failures.map((f) => f.code);
/** Findings files by reviewer id; any reviewer not named wrote an empty file. */
const files =
  (by: Record<string, Record<string, unknown>>): ReviewGateContext['readFindings'] =>
  (p) => {
    const id = p.replace(/\.json$/, '');
    return file(id, by[id] ?? {});
  };

describe('fix 1: the moment is bound to where the receipt sits', () => {
  it('fails a receipt that says phase where the caller expects the final review', () => {
    const r = validateReviewReceipt(
      light('compliance-bug'),
      ctx({ expectedMoment: { status: 'known', moment: 'final' } })
    );
    expect(codes(r)).toEqual(['MOMENT_MISMATCH']);
    expect(r.failures[0]?.message).toContain('final');
  });
  it('fails, and does not skip the check, when the expected moment is unknown', () => {
    const r = validateReviewReceipt(receipt(), ctx({ expectedMoment: { status: 'unknown' } }));
    expect(codes(r)).toEqual(['MOMENT_UNKNOWN']);
  });
  it('passes when the receipt and the location agree', () => {
    expect(validateReviewReceipt(receipt(), ctx()).pass).toBe(true);
    const final = receipt({ moment: 'final' });
    expect(
      validateReviewReceipt(final, ctx({ expectedMoment: { status: 'known', moment: 'final' } }))
        .pass
    ).toBe(true);
  });
});

describe('fix 2: a light receipt lists exactly compliance-bug', () => {
  it('passes with compliance-bug as the one required reviewer', () => {
    expect(validateReviewReceipt(light('compliance-bug'), ctx()).failures).toEqual([]);
  });
  it('fails with any other single required reviewer', () => {
    const r = validateReviewReceipt(light('architecture'), ctx());
    expect(codes(r)).toEqual(['LIGHT_TIER_ROSTER']);
    expect(r.failures[0]?.message).toContain('compliance-bug');
  });
  it('fails with compliance-bug and a second required reviewer', () => {
    const two = receipt({ tier: 'light', reviewers: [record('compliance-bug'), record('bug')] });
    expect(codes(validateReviewReceipt(two, ctx()))).toEqual(['LIGHT_TIER_ROSTER']);
  });
});

describe('fix 3: a findings file carries the commit it reviewed', () => {
  it('fails a findings file written for an earlier head, and names the reviewer', () => {
    const r = validateReviewReceipt(
      receipt(),
      ctx({ readFindings: files({ bug: { head: OTHER } }) })
    );
    expect(r.failures).toEqual([
      expect.objectContaining({ code: 'FINDINGS_HEAD_MISMATCH', reviewerId: 'bug' }),
    ]);
  });
  it('rejects a findings file with no head as invalid', () => {
    const noHead = JSON.stringify({
      schemaVersion: 1,
      reviewerId: 'bug',
      base: BASE,
      examinedFiles: ['src/a.ts'],
      findings: [],
    });
    const r = validateReviewReceipt(
      receipt(),
      ctx({ readFindings: (p) => (p === 'bug.json' ? noHead : file(p.replace(/\.json$/, ''))) })
    );
    expect(codes(r)).toEqual(['FINDINGS_FILE_INVALID']);
  });
});

describe('fix 4: diff.base is checked as far as git allows', () => {
  it('fails a base that is not an ancestor of the head', () => {
    const r = validateReviewReceipt(receipt(), ctx({ baseIsAncestor: false }));
    expect(codes(r)).toEqual(['DIFF_BASE_NOT_ANCESTOR']);
  });
  it('round 2: git could not say whether it is an ancestor: DIFF_UNRESOLVED, not a claim it is not', () => {
    const r = validateReviewReceipt(receipt(), ctx({ baseIsAncestor: undefined }));
    expect(codes(r)).toEqual(['DIFF_UNRESOLVED']);
    expect(r.failures[0]?.message).toMatch(/could not tell whether/);
  });
  it('fails a final receipt whose base is not the merge base with the default branch', () => {
    const final = receipt({ moment: 'final' });
    const r = validateReviewReceipt(
      final,
      ctx({ expectedMoment: { status: 'known', moment: 'final' }, mergeBase: OTHER })
    );
    expect(codes(r)).toEqual(['FINAL_BASE_NOT_MERGE_BASE']);
    expect(r.failures[0]?.message).toContain(OTHER);
  });
  it('fails a final receipt when the default branch could not be resolved', () => {
    const final = receipt({ moment: 'final' });
    const r = validateReviewReceipt(
      final,
      ctx({ expectedMoment: { status: 'known', moment: 'final' }, mergeBase: undefined })
    );
    expect(codes(r)).toEqual(['FINAL_BASE_NOT_MERGE_BASE']);
    expect(r.failures[0]?.message).toContain('could not be resolved');
  });
  it('accepts a final receipt whose base is declared the starting commit', () => {
    const final = receipt({
      moment: 'final',
      diff: { base: BASE, head: HEAD, baseSource: 'starting-commit' },
    });
    // Round 4, fix 1: accepted when it is the session's starting commit.
    const c = ctx({
      expectedMoment: { status: 'known', moment: 'final' },
      mergeBase: undefined,
      startingCommit: BASE,
    });
    expect(validateReviewReceipt(final, c).failures).toEqual([]);
  });
  it('does not compare a phase receipt with the merge base', () => {
    expect(validateReviewReceipt(receipt(), ctx({ mergeBase: OTHER })).pass).toBe(true);
  });
});

describe('fix 5: one count per finding, and finding ids are unique across a review', () => {
  it('counts two distinct blocking findings at one file and start line as two', () => {
    const readFindings = files({
      bug: { findings: [finding('b1')] },
      security: { findings: [finding('s1', { severity: 'critical' })] },
    });
    const two = validateReviewReceipt(receipt({ blocking: 2 }), ctx({ readFindings }));
    expect(two.failures).toEqual([]);
    expect(two.tally.blocking.map((f) => f.id)).toEqual(['b1', 's1']);
    const one = validateReviewReceipt(receipt({ blocking: 1 }), ctx({ readFindings }));
    expect(codes(one)).toEqual(['COUNTS_MISMATCH']);
  });
  it('counts a suggestion beside a blocking finding at the same location as advisory', () => {
    const readFindings = files({
      bug: { findings: [finding('b1'), finding('b2', { severity: 'suggestion' })] },
    });
    const r = validateReviewReceipt(receipt({ blocking: 1, advisory: 1 }), ctx({ readFindings }));
    expect(r.failures).toEqual([]);
  });
  it('fails a finding id used by two reviewers, and names the id', () => {
    const readFindings = files({
      bug: { findings: [finding('f1')] },
      security: { findings: [finding('f1', { file: 'src/b.ts' })] },
    });
    const r = validateReviewReceipt(receipt({ blocking: 2 }), ctx({ readFindings }));
    expect(codes(r)).toEqual(['DUPLICATE_FINDING_ID']);
    expect(r.failures[0]?.message).toContain('f1');
  });
  it('fails a finding id used twice by one reviewer', () => {
    const readFindings = files({ bug: { findings: [finding('f1'), finding('f1')] } });
    const r = validateReviewReceipt(receipt({ blocking: 2 }), ctx({ readFindings }));
    expect(codes(r)).toEqual(['DUPLICATE_FINDING_ID']);
  });
});

describe('fix 6: reviewersRun counts reviewers whose findings file loaded', () => {
  it('does not count a reviewer marked ran whose file is absent', () => {
    const r = validateReviewReceipt(
      receipt(),
      ctx({ readFindings: (p) => (p === 'bug.json' ? undefined : file(p.replace('.json', ''))) })
    );
    expect(codes(r)).toEqual(['FINDINGS_FILE_MISSING']);
    expect(r).toMatchObject({ reviewersRun: 3, reviewersRequired: 4 });
    // A file that is absent, or read and rejected, did not load (round 4: renamed from unreadable).
    expect(r.notLoaded).toEqual(['bug']);
    expect(r).not.toHaveProperty('unreadable');
    expect(r.loaded).toEqual(['compliance', 'security', 'architecture']);
  });
});

describe('fix 13: a receipt may record its fix round and earlier rounds', () => {
  it('accepts round and priorRounds and returns them on the parsed receipt', () => {
    const priorRounds = [{ round: 1, head: OTHER, blocking: 3 }];
    const r = validateReviewReceipt(receipt({ round: 2, priorRounds }), ctx());
    expect(r.failures).toEqual([]);
    expect(r.checked && r.receipt).toMatchObject({ round: 2, priorRounds });
  });
  it.each([
    ['a round of zero', { round: 0 }],
    ['a fractional round', { round: 1.5 }],
    ['a prior round with no head', { priorRounds: [{ round: 1, blocking: 0 }] }],
    ['a prior round with a short head', { priorRounds: [{ round: 1, head: 'abc', blocking: 0 }] }],
  ])('rejects %s', (_name, over) => {
    expect(codes(validateReviewReceipt(receipt(over), ctx()))).toEqual(['RECEIPT_INVALID']);
  });
});

describe('fix 12: coverage of the diff by required reviewers is reported, not gated', () => {
  it('reports the diff files any required reviewer examined over the diff files', () => {
    const r = validateReviewReceipt(receipt(), ctx());
    expect(r.pass).toBe(true);
    expect(r.coverage).toEqual({ examined: 1, files: 2 });
  });
  it('does not count a file only a non-required reviewer examined', () => {
    const reviewers = [...FULL.map(record), { ...record('adversarial'), required: false }];
    const readFindings = files({ adversarial: { examinedFiles: ['src/b.ts'] } });
    const r = validateReviewReceipt(receipt({ reviewers }), ctx({ readFindings }));
    expect(r.coverage).toEqual({ examined: 1, files: 2 });
  });
  it('has no coverage when the diff could not be recomputed', () => {
    const r = validateReviewReceipt(receipt(), ctx({ diffFiles: undefined }));
    expect(r.coverage).toBeUndefined();
  });
});
