import { describe, it, expect } from 'vitest';
import { checkReviewerFindingsText, validateReviewReceipt } from '../../src/receipts/review-gate';
import { HEAD, codesOf, ctx, findingsText, receipt } from './round4-helpers';

/**
 * Fix 5. A receipt is bound to a commit, but reviewers and the mechanical checks read the working
 * tree, so the gate requires the tracked files to equal HEAD. Partition of what the caller
 * recomputed (`git status --porcelain=v1 -z --untracked-files=no`): clean, dirty, could not say;
 * for the self-check also no range given (nothing is bound to a head, so nothing is checked).
 */
describe('the receipt gate: tracked files must equal HEAD', () => {
  it.each([
    ['clean', true, []],
    ['dirty', false, ['WORKTREE_DIRTY']],
    ['unknown (git could not say)', undefined, ['WORKTREE_DIRTY']],
  ] as const)('%s', (_n, worktreeClean, expected) => {
    expect(codesOf(validateReviewReceipt(receipt(), ctx({ worktreeClean })))).toEqual(expected);
  });
  it('the two messages differ: dirty says to commit or discard, unknown says git could not tell', () => {
    const [dirty] = validateReviewReceipt(receipt(), ctx({ worktreeClean: false })).failures;
    const [unknown] = validateReviewReceipt(receipt(), ctx({ worktreeClean: undefined })).failures;
    expect(dirty?.message).toMatch(/commit or discard/);
    expect(unknown?.message).toMatch(/could not tell/);
  });
});

describe('the self-check: tracked files must equal HEAD when a range is given', () => {
  const codes = (range: Parameters<typeof checkReviewerFindingsText>[2]) =>
    checkReviewerFindingsText(findingsText('bug'), 'bug.json', range).map((f) => f.code);
  it.each([
    ['no range', { ranged: false }, []],
    [
      'range, clean',
      { ranged: true, head: HEAD, diffFiles: ['src/a.ts'], worktreeClean: true },
      [],
    ],
    [
      'range, dirty',
      { ranged: true, head: HEAD, diffFiles: ['src/a.ts'], worktreeClean: false },
      ['WORKTREE_DIRTY'],
    ],
    [
      'range, unknown',
      { ranged: true, head: HEAD, diffFiles: ['src/a.ts'], worktreeClean: undefined },
      ['WORKTREE_DIRTY'],
    ],
  ] as const)('%s', (_n, range, expected) => {
    expect(codes(range)).toEqual(expected);
  });
});
