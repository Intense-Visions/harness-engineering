import { describe, it, expect } from 'vitest';
import { validateReviewReceipt, type ReviewGateContext } from '../../src/receipts/review-gate';

export const BASE = 'a'.repeat(40);
export const HEAD = 'b'.repeat(40);
const FULL = ['compliance', 'bug', 'security', 'architecture'];

const record = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  required: true,
  ran: true,
  findingsPath: `${id}.json`,
  ...over,
});
const receipt = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  moment: 'phase',
  tier: 'full',
  backend: 'agent',
  diff: { base: BASE, head: HEAD },
  coldContext: true,
  priorFindingsSupplied: false,
  reviewers: FULL.map((id) => record(id)),
  blocking: 0,
  advisory: 0,
  ...over,
});
const findingsFile = (id: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    reviewerId: id,
    head: HEAD,
    examinedFiles: ['src/a.ts'],
    findings: [],
    ...over,
  });
/** A context in which every reviewer wrote a valid file over the one diff file. */
const ctx = (over: Partial<ReviewGateContext> = {}): ReviewGateContext => ({
  head: HEAD,
  diffFiles: ['src/a.ts', 'src/b.ts'],
  readFindings: (p) => findingsFile(p.replace(/\.json$/, '')),
  expectedMoment: { status: 'known', moment: 'phase' },
  baseIsAncestor: true,
  worktreeClean: true,
  phaseBase: { status: 'resolved', base: BASE, source: 'starting-commit' },
  mergeBase: BASE,
  ...over,
});
const codes = (r: ReturnType<typeof validateReviewReceipt>) => r.failures.map((f) => f.code);

describe('validateReviewReceipt: receipt, HEAD, roster, final moment', () => {
  it('passes a full receipt whose four core reviewers ran, and reports the denominator', () => {
    const r = validateReviewReceipt(receipt(), ctx());
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ pass: true, reviewersRun: 4, reviewersRequired: 4 });
  });
  it('fails an invalid receipt with RECEIPT_INVALID; nothing was checked, so it carries no counts', () => {
    const r = validateReviewReceipt({ schemaVersion: 1 }, ctx());
    expect(codes(r)).toEqual(['RECEIPT_INVALID']);
    expect(r).toMatchObject({ checked: false, pass: false });
    expect(r).not.toHaveProperty('reviewersRun');
  });
  it('fails when diff.head is not the current HEAD (SC: stale receipt)', () => {
    const r = validateReviewReceipt(receipt(), ctx({ head: 'c'.repeat(40) }));
    expect(codes(r)).toEqual(['HEAD_MISMATCH']);
  });
  it('SC2: a required reviewer that did not run fails and is named', () => {
    const reviewers = FULL.map((id) =>
      id === 'security'
        ? { id, required: true, ran: false, skippedReason: 'dispatch failed' }
        : record(id)
    );
    const r = validateReviewReceipt(receipt({ reviewers }), ctx());
    expect(r.failures).toEqual([
      expect.objectContaining({ code: 'REQUIRED_REVIEWER_NOT_RUN', reviewerId: 'security' }),
    ]);
    expect(r.failures[0]?.message).toContain('dispatch failed');
    expect(r).toMatchObject({ reviewersRun: 3, reviewersRequired: 4 });
  });
  it('SC1: a full receipt that omits a core reviewer, or lists it as not required, fails', () => {
    const missing = receipt({ reviewers: FULL.slice(0, 3).map((id) => record(id)) });
    expect(validateReviewReceipt(missing, ctx()).failures).toEqual([
      expect.objectContaining({ code: 'CORE_REVIEWER_MISSING', reviewerId: 'architecture' }),
    ]);
    const optional = receipt({
      reviewers: FULL.map((id) =>
        id === 'bug' ? { id, required: false, ran: false, skippedReason: 'not needed' } : record(id)
      ),
    });
    expect(codes(validateReviewReceipt(optional, ctx()))).toEqual(['CORE_REVIEWER_MISSING']);
  });
  it('accepts an inactive conditional reviewer listed as not required', () => {
    const reviewers = [
      ...FULL.map((id) => record(id)),
      { id: 'frontend-races', required: false, ran: false, skippedReason: 'no async-UI signal' },
    ];
    expect(validateReviewReceipt(receipt({ reviewers }), ctx()).pass).toBe(true);
  });
  it('SC5: a light receipt needs exactly one required reviewer', () => {
    const one = receipt({ tier: 'light', reviewers: [record('compliance-bug')] });
    expect(validateReviewReceipt(one, ctx()).pass).toBe(true);
    const two = receipt({ tier: 'light', reviewers: [record('compliance'), record('bug')] });
    expect(codes(validateReviewReceipt(two, ctx()))).toEqual(['LIGHT_TIER_ROSTER']);
  });
  it('fails a receipt that lists one reviewer id twice', () => {
    const reviewers = [...FULL.map((id) => record(id)), record('bug', { findingsPath: 'x.json' })];
    expect(codes(validateReviewReceipt(receipt({ reviewers }), ctx()))).toContain(
      'DUPLICATE_REVIEWER'
    );
  });
  it.each([
    ['a light tier', { tier: 'light', reviewers: [record('compliance-bug')] }, 'FINAL_NOT_FULL'],
    ['a warm context', { coldContext: false }, 'FINAL_NOT_COLD'],
    ['prior findings supplied', { priorFindingsSupplied: true }, 'FINAL_PRIOR_FINDINGS'],
  ])('SC4: a final receipt with %s fails', (_name, over, code) => {
    const final = ctx({ expectedMoment: { status: 'known', moment: 'final' } });
    const r = validateReviewReceipt(receipt({ moment: 'final', ...over }), final);
    expect(codes(r)).toEqual([code]);
  });
  it('SC4: a cold, full final receipt passes; the same flags on a phase receipt are not checked', () => {
    const final = ctx({ expectedMoment: { status: 'known', moment: 'final' } });
    expect(validateReviewReceipt(receipt({ moment: 'final' }), final).pass).toBe(true);
    const warmPhase = receipt({ coldContext: false, priorFindingsSupplied: true });
    expect(validateReviewReceipt(warmPhase, ctx()).pass).toBe(true);
  });
  it('SC15: a receipt recording backend agent is judged by the same rules', () => {
    const agent = validateReviewReceipt(receipt({ backend: 'agent' }), ctx());
    const pipeline = validateReviewReceipt(receipt({ backend: 'pipeline' }), ctx());
    expect(agent.pass).toBe(true);
    expect(pipeline.failures).toEqual(agent.failures);
  });
});

describe('validateReviewReceipt: reviewer findings files', () => {
  const only = (id: string, text: string | undefined): ReviewGateContext['readFindings'] => {
    return (p) => (p === `${id}.json` ? text : findingsFile(p.replace(/\.json$/, '')));
  };
  it('SC3: a reviewer marked ran with no findings file fails and is named', () => {
    const r = validateReviewReceipt(receipt(), ctx({ readFindings: only('bug', undefined) }));
    expect(r.failures).toEqual([
      expect.objectContaining({ code: 'FINDINGS_FILE_MISSING', reviewerId: 'bug' }),
    ]);
  });
  it('SC3: a reviewer marked ran that names no findingsPath fails', () => {
    const reviewers = FULL.map((id) =>
      id === 'bug' ? { id, required: true, ran: true } : record(id)
    );
    expect(codes(validateReviewReceipt(receipt({ reviewers }), ctx()))).toEqual([
      'FINDINGS_FILE_MISSING',
    ]);
  });
  it.each([
    ['not JSON', '{nope'],
    ['the wrong shape', JSON.stringify({ findings: [] })],
    [
      'a blocking finding with no attribution (SC7)',
      findingsFile('bug', {
        findings: [
          { id: 'x', file: 'src/a.ts', lineRange: [1, 1], severity: 'critical', title: 't' },
        ],
      }),
    ],
  ])('SC3: a findings file that is %s is invalid', (_name, text) => {
    const r = validateReviewReceipt(receipt(), ctx({ readFindings: only('bug', text) }));
    expect(codes(r)).toEqual(['FINDINGS_FILE_INVALID']);
  });
  it("fails a findings file written under another reviewer's id", () => {
    const r = validateReviewReceipt(
      receipt(),
      ctx({ readFindings: only('bug', findingsFile('security')) })
    );
    expect(codes(r)).toEqual(['FINDINGS_REVIEWER_MISMATCH']);
  });
  it('fails two reviewers that name the same findings file', () => {
    const reviewers = FULL.map((id) => record(id, { findingsPath: 'all.json' }));
    const r = validateReviewReceipt(
      receipt({ reviewers }),
      ctx({ readFindings: () => findingsFile('compliance') })
    );
    expect(codes(r).filter((c) => c === 'FINDINGS_FILE_SHARED')).toHaveLength(3);
  });
  it.each(['/etc/passwd', 'C:\\x\\bug.json', '../other/bug.json', 'a/../../bug.json'])(
    'refuses findings path %s without reading it',
    (findingsPath) => {
      const reviewers = FULL.map((id) =>
        id === 'bug' ? record(id, { findingsPath }) : record(id)
      );
      let read = 0;
      const r = validateReviewReceipt(
        receipt({ reviewers }),
        ctx({
          readFindings: (p) => {
            if (p === findingsPath) read++;
            return findingsFile(p.replace(/\.json$/, ''));
          },
        })
      );
      expect(codes(r)).toEqual(['FINDINGS_PATH_INVALID']);
      expect(read).toBe(0);
    }
  );
  it('SC3: an examined file outside the recomputed diff fails; win32 separators still match', () => {
    const outside = findingsFile('bug', { examinedFiles: ['src/a.ts', 'src/zzz.ts'] });
    const r = validateReviewReceipt(receipt(), ctx({ readFindings: only('bug', outside) }));
    expect(r.failures).toEqual([
      expect.objectContaining({ code: 'EXAMINED_OUTSIDE_DIFF', reviewerId: 'bug' }),
    ]);
    expect(r.failures[0]?.message).toContain('src/zzz.ts');
    const win = findingsFile('bug', { examinedFiles: ['.\\src\\b.ts'] });
    expect(validateReviewReceipt(receipt(), ctx({ readFindings: only('bug', win) })).pass).toBe(
      true
    );
  });
  it('fails a reviewer that examined nothing (an empty list is not evidence of a review)', () => {
    const empty = findingsFile('bug', { examinedFiles: [] });
    const r = validateReviewReceipt(receipt(), ctx({ readFindings: only('bug', empty) }));
    expect(codes(r)).toEqual(['EXAMINED_FILES_EMPTY']);
  });
  it('fails closed when the diff could not be recomputed or changes no files', () => {
    expect(codes(validateReviewReceipt(receipt(), ctx({ diffFiles: undefined })))).toEqual([
      'DIFF_UNRESOLVED',
    ]);
    expect(codes(validateReviewReceipt(receipt(), ctx({ diffFiles: [] })))).toContain('EMPTY_DIFF');
  });
  it('does not read a file for a reviewer that did not run', () => {
    const reviewers = [
      ...FULL.map((id) => record(id)),
      { id: 'adversarial', required: false, ran: false, skippedReason: 'quick depth' },
    ];
    const read: string[] = [];
    validateReviewReceipt(
      receipt({ reviewers }),
      ctx({
        readFindings: (p) => {
          read.push(p);
          return findingsFile(p.replace(/\.json$/, ''));
        },
      })
    );
    expect(read).not.toContain('adversarial.json');
    expect(read).toHaveLength(4);
  });
});

describe('validateReviewReceipt: the receipt counts are recomputed from the findings files (N6)', () => {
  const f = (id: string, line: number, severity: string, file = 'src/a.ts') => ({
    id,
    file,
    lineRange: [line, line],
    severity,
    title: 't',
    ...(severity !== 'suggestion' && { findingClass: 'edge-case', escapedFrom: 'plan' }),
  });
  const withFindings = (byReviewer: Record<string, unknown[]>) =>
    ctx({
      readFindings: (p) => {
        const id = p.replace(/\.json$/, '');
        return findingsFile(id, { findings: byReviewer[id] ?? [] });
      },
    });
  it('fails a receipt that claims no blocking finding while a findings file holds a critical', () => {
    const r = validateReviewReceipt(
      receipt({ blocking: 0, advisory: 0 }),
      withFindings({ bug: [f('b1', 3, 'critical')] })
    );
    expect(codes(r)).toEqual(['COUNTS_MISMATCH']);
    expect(r.pass).toBe(false);
    expect(r.failures[0]?.message).toMatch(/claims 0 blocking and 0 advisory/);
    expect(r.failures[0]?.message).toMatch(/hold 1 blocking and 0 advisory/);
  });
  it('fails a wrong advisory count too, and an overstated blocking count', () => {
    const files = { bug: [f('b1', 3, 'important'), f('s1', 9, 'suggestion')] };
    expect(
      codes(validateReviewReceipt(receipt({ blocking: 1, advisory: 0 }), withFindings(files)))
    ).toEqual(['COUNTS_MISMATCH']);
    expect(
      codes(validateReviewReceipt(receipt({ blocking: 2, advisory: 1 }), withFindings(files)))
    ).toEqual(['COUNTS_MISMATCH']);
    expect(
      validateReviewReceipt(receipt({ blocking: 1, advisory: 1 }), withFindings(files)).pass
    ).toBe(true);
  });
  it('counts every finding once, whatever its location: two blocking findings on one line are two', () => {
    const files = {
      bug: [f('b1', 3, 'critical'), f('s1', 9, 'suggestion')],
      security: [f('x1', 3, 'important'), f('s2', 3, 'suggestion'), f('s3', 9, 'suggestion')],
      architecture: [f('a1', 3, 'suggestion', 'src/b.ts')],
    };
    const ok = validateReviewReceipt(receipt({ blocking: 2, advisory: 4 }), withFindings(files));
    expect(ok.failures).toEqual([]);
    expect(
      codes(validateReviewReceipt(receipt({ blocking: 1, advisory: 2 }), withFindings(files)))
    ).toEqual(['COUNTS_MISMATCH']);
  });
  it('does not add a count failure when a findings file could not be loaded', () => {
    const r = validateReviewReceipt(
      receipt({ blocking: 5, advisory: 5 }),
      ctx({
        readFindings: (p) =>
          p === 'bug.json' ? undefined : findingsFile(p.replace(/\.json$/, '')),
      })
    );
    expect(codes(r)).toEqual(['FINDINGS_FILE_MISSING']);
  });
});
