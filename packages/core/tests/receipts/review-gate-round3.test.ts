import { describe, it, expect, expectTypeOf } from 'vitest';
import { REVIEW_MOMENTS, type ReviewMoment, type ReviewReceipt } from '@harness-engineering/types';
import { expectedReviewMoment, type ExpectedMoment } from '../../src/receipts/layout';
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
const file = (id: string) =>
  JSON.stringify({
    schemaVersion: 1,
    reviewerId: id,
    base: BASE,
    head: HEAD,
    examinedFiles: ['src/a.ts'],
    findings: [],
  });
const known = (moment: ReviewMoment): ExpectedMoment => ({ status: 'known', moment });
const ctx = (over: Partial<ReviewGateContext> = {}): ReviewGateContext => ({
  head: HEAD,
  diffFiles: ['src/a.ts'],
  readFindings: (p) => file(p.replace(/\.json$/, '')),
  expectedMoment: known('phase'),
  baseIsAncestor: true,
  worktreeClean: true,
  phaseBase: { status: 'resolved', base: BASE, source: 'starting-commit' },
  mergeBase: BASE,
  ...over,
});
const codes = (r: ReturnType<typeof validateReviewReceipt>) => r.failures.map((f) => f.code);

/**
 * Fix 1. Input partition for the expected moment: what the directory states {phase, final,
 * standalone, nothing} x what the caller states {nothing, phase, final, standalone}. The
 * directory wins; the caller's word counts only where the directory is silent; the four rows
 * where both speak and disagree are a conflict, never the caller's answer.
 */
describe('expectedReviewMoment: the directory wins over the caller', () => {
  const dirs: Array<[string, ReviewMoment | undefined]> = [
    ['/r/.harness/sessions/s/reviews/phase-0', 'phase'],
    ['/r/.harness/sessions/s/reviews/final-all', 'final'],
    ['/r/.harness/reviews/feat-x-abc', 'standalone'],
    ['/tmp/somewhere/else', undefined],
  ];
  const rows = dirs.flatMap(([dir, directory]) =>
    [undefined, ...REVIEW_MOMENTS].map((stated) => {
      let expected: ExpectedMoment;
      if (directory === undefined) {
        expected = stated === undefined ? { status: 'unknown' } : known(stated);
      } else if (stated === undefined || stated === directory) expected = known(directory);
      else expected = { status: 'conflict', directory, stated };
      return [dir, stated, expected] as const;
    })
  );
  it('covers all sixteen combinations', () => {
    expect(rows).toHaveLength(16);
    expect(rows.filter(([, , e]) => e.status === 'conflict')).toHaveLength(6);
  });
  it.each(rows)('directory %s, caller %s', (dir, stated, expected) => {
    expect(expectedReviewMoment(dir, stated)).toEqual(expected);
  });
  it('reads a win32 path the same way', () => {
    expect(expectedReviewMoment('C:\\r\\.harness\\reviews\\x', 'phase')).toEqual({
      status: 'conflict',
      directory: 'standalone',
      stated: 'phase',
    });
  });
});

describe('the gate on each expected-moment state', () => {
  it.each(REVIEW_MOMENTS)('known and equal to the receipt (%s): no moment failure', (moment) => {
    const r = validateReviewReceipt(receipt({ moment }), ctx({ expectedMoment: known(moment) }));
    expect(codes(r)).not.toContain('MOMENT_MISMATCH');
    expect(codes(r)).not.toContain('MOMENT_UNKNOWN');
  });
  it('known and different: MOMENT_MISMATCH naming both', () => {
    const r = validateReviewReceipt(receipt(), ctx({ expectedMoment: known('final') }));
    expect(codes(r)).toEqual(['MOMENT_MISMATCH']);
    expect(r.failures[0]?.message).toMatch(/phase.*final/);
  });
  it('unknown: MOMENT_UNKNOWN, with no angle brackets in the message', () => {
    const r = validateReviewReceipt(receipt(), ctx({ expectedMoment: { status: 'unknown' } }));
    expect(codes(r)).toEqual(['MOMENT_UNKNOWN']);
    expect(r.failures[0]?.message).not.toMatch(/[<>]/);
  });
  it.each(REVIEW_MOMENTS)(
    'conflict fails MOMENT_MISMATCH whatever the receipt says (%s), naming both sources',
    (moment) => {
      const expectedMoment: ExpectedMoment = {
        status: 'conflict',
        directory: 'final',
        stated: 'phase',
      };
      const r = validateReviewReceipt(receipt({ moment }), ctx({ expectedMoment }));
      expect(codes(r)).toContain('MOMENT_MISMATCH');
      const message = r.failures.find((f) => f.code === 'MOMENT_MISMATCH')?.message ?? '';
      expect(message).toMatch(/directory.*final/);
      expect(message).toMatch(/--moment.*phase/);
    }
  );
  it('the reviewers reproduction: a light, warm phase receipt in final-all with --moment phase', () => {
    const warm = receipt({
      tier: 'light',
      coldContext: false,
      priorFindingsSupplied: true,
      reviewers: [record('compliance-bug')],
    });
    const expectedMoment = expectedReviewMoment(
      '/r/.harness/sessions/s/reviews/final-all',
      'phase'
    );
    expect(validateReviewReceipt(warm, ctx({ expectedMoment })).pass).toBe(false);
  });
});

/**
 * Fix 2. Input partition for a final receipt's base: baseSource {absent, merge-base,
 * starting-commit} x the default-branch merge base {unresolved, equal to diff.base, different}.
 * `starting-commit` is accepted only where the merge base is unresolved.
 */
describe('a final receipt base against the default-branch merge base', () => {
  const final = (baseSource: string | undefined) =>
    receipt({
      moment: 'final',
      diff: { base: BASE, head: HEAD, ...(baseSource !== undefined && { baseSource }) },
    });
  const gate = (baseSource: string | undefined, mergeBase: string | undefined) =>
    codes(
      validateReviewReceipt(final(baseSource), ctx({ expectedMoment: known('final'), mergeBase }))
    );
  it.each([
    [undefined, BASE, []],
    ['merge-base', BASE, []],
    ['starting-commit', BASE, []],
    [undefined, OTHER, ['FINAL_BASE_NOT_MERGE_BASE']],
    ['merge-base', OTHER, ['FINAL_BASE_NOT_MERGE_BASE']],
    ['starting-commit', OTHER, ['FINAL_BASE_NOT_MERGE_BASE']],
    [undefined, undefined, ['FINAL_BASE_NOT_MERGE_BASE']],
    ['merge-base', undefined, ['FINAL_BASE_NOT_MERGE_BASE']],
    // Round 4, fix 1: with no session starting commit to compare with, it cannot be checked.
    ['starting-commit', undefined, ['STARTING_COMMIT_UNKNOWN']],
  ])('baseSource %s, merge base %s -> %j', (baseSource, mergeBase, expected) => {
    expect(gate(baseSource, mergeBase)).toEqual(expected);
  });
  it('says the declared starting commit does not stand when the merge base resolves', () => {
    const r = validateReviewReceipt(
      final('starting-commit'),
      ctx({ expectedMoment: known('final'), mergeBase: OTHER })
    );
    expect(r.failures[0]?.message).toMatch(/starting-commit/);
    expect(r.failures[0]?.message).toContain(OTHER);
  });
  it.each(['phase', 'standalone'] as const)('a %s receipt is never held to the merge base', (m) => {
    const r = validateReviewReceipt(
      receipt({ moment: m }),
      ctx({ expectedMoment: known(m), mergeBase: OTHER })
    );
    expect(codes(r)).toEqual([]);
  });
});

/** The head rule, decided in core: HEAD {the reviewed head, another commit, unresolved}. */
describe('the reviewed head against HEAD', () => {
  it.each([
    [HEAD, []],
    [OTHER, ['HEAD_MISMATCH']],
    ['', ['HEAD_MISMATCH']],
  ])('HEAD %s -> %j', (head, expected) => {
    expect(codes(validateReviewReceipt(receipt(), ctx({ head })))).toEqual(expected);
  });
});

/**
 * Fix 4. The result is one of two states, told apart by `checked`: a receipt that did not parse
 * (nothing was checked, so there are no counts to read) or one that was checked.
 */
describe('ReviewGateResult is a discriminated union', () => {
  it.each([
    ['not an object', 7],
    ['null', null],
    ['an empty object', {}],
    ['a receipt with a short sha', receipt({ diff: { base: 'abc', head: HEAD } })],
  ])('%s: checked false, RECEIPT_INVALID, and no counters at all', (_name, raw) => {
    const r = validateReviewReceipt(raw, ctx());
    expect(r).toEqual({
      checked: false,
      pass: false,
      failures: [expect.objectContaining({ code: 'RECEIPT_INVALID' })],
    });
  });
  it('a receipt that parses: checked true, with the receipt and the counters', () => {
    const r = validateReviewReceipt(receipt(), ctx());
    expect(r.checked).toBe(true);
    if (!r.checked) throw new Error('unreachable');
    expectTypeOf(r.receipt).toEqualTypeOf<ReviewReceipt>();
    expect(r).toMatchObject({ pass: true, reviewersRun: 4, reviewersRequired: 4, loaded: FULL });
  });
  it('a checked receipt that fails still carries the receipt', () => {
    const r = validateReviewReceipt(receipt(), ctx({ head: OTHER }));
    expect(r).toMatchObject({ checked: true, pass: false, receipt: { tier: 'full' } });
  });
});
