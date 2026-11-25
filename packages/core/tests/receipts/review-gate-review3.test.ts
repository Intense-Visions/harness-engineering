import { describe, it, expect } from 'vitest';
import { checkReviewerFindingsText, validateReviewReceipt } from '../../src/receipts/review-gate';
import { BASE, HEAD, OTHER, codesOf, ctx, findingsText, receipt } from './round4-helpers';

/** Review round 3 on unit 1: the gate rules it changed, against the pure gate. */

describe('fix 2: a findings file records the base it was reviewed from', () => {
  const withBase = (id: string, base: unknown) =>
    JSON.stringify({ ...JSON.parse(findingsText(id)), base });
  it('a file whose base is the receipt base passes', () => {
    expect(codesOf(validateReviewReceipt(receipt(), ctx()))).toEqual([]);
  });
  it('a file reviewed from another base fails FINDINGS_BASE_MISMATCH, naming the reviewer', () => {
    const readFindings = (p: string) => {
      const id = p.replace(/\.json$/, '');
      return id === 'bug' ? withBase(id, OTHER) : findingsText(id);
    };
    const r = validateReviewReceipt(receipt(), ctx({ readFindings }));
    expect(codesOf(r)).toEqual(['FINDINGS_BASE_MISMATCH']);
    expect(r.failures[0]?.reviewerId).toBe('bug');
  });
  it.each([
    ['absent', undefined],
    ['abbreviated', BASE.slice(0, 7)],
    ['not a string', 7],
  ])('a file whose base is %s is invalid', (_n, base) => {
    const readFindings = (p: string) => {
      const id = p.replace(/\.json$/, '');
      if (id !== 'bug') return findingsText(id);
      const file = JSON.parse(findingsText(id)) as Record<string, unknown>;
      if (base === undefined) delete file.base;
      else file.base = base;
      return JSON.stringify(file);
    };
    expect(codesOf(validateReviewReceipt(receipt(), ctx({ readFindings })))).toEqual([
      'FINDINGS_FILE_INVALID',
    ]);
  });
  it('the self-check with a range fails a file whose base is not --base', () => {
    const range = {
      ranged: true as const,
      base: OTHER,
      head: HEAD,
      worktreeHead: HEAD,
      diffFiles: ['src/a.ts'],
      worktreeClean: true,
    };
    expect(
      checkReviewerFindingsText(findingsText('bug'), 'bug.json', range).map((f) => f.code)
    ).toEqual(['FINDINGS_BASE_MISMATCH']);
    expect(
      checkReviewerFindingsText(findingsText('bug'), 'bug.json', { ...range, base: BASE })
    ).toEqual([]);
  });
});
