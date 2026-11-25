import { describe, it, expect } from 'vitest';
import { validateReviewReceipt } from '../../src/receipts/review-gate';
import { codesOf, ctx, receipt, record } from './round4-helpers';

/** Review round 3, fix 5: a standalone review is always computed full. */

describe('fix 5: a standalone review is always computed full', () => {
  const light = { moment: 'standalone', tier: 'light', reviewers: [record('compliance-bug')] };
  const at = (over: Record<string, unknown>) =>
    codesOf(validateReviewReceipt(receipt({ ...light, ...over }), ctx({}, 'standalone')));
  it.each<[string, Record<string, unknown>, string[]]>([
    ['light without computedTier', {}, ['TIER_DEMOTED']],
    ['light, computedTier light recorded', { computedTier: 'light' }, ['TIER_DEMOTED']],
    ['light, computedTier full, no demotion', { computedTier: 'full' }, ['TIER_DEMOTED']],
    ['light without computedTier, demotion no-subagent-tool', { demotion: 'no-subagent-tool' }, []],
    [
      'light, computedTier full, demotion no-subagent-tool',
      { computedTier: 'full', demotion: 'no-subagent-tool' },
      [],
    ],
  ])('%s', (_n, over, expected) => expect(at(over)).toEqual(expected));
  it('the directory decides: a receipt that says phase in a standalone directory', () => {
    const r = validateReviewReceipt(receipt({ ...light, moment: 'phase' }), ctx({}, 'standalone'));
    expect(codesOf(r)).toEqual(['MOMENT_MISMATCH', 'TIER_DEMOTED']);
  });
  it('a phase light receipt without computedTier still passes (its tier is a claim)', () => {
    const r = validateReviewReceipt(
      receipt({ tier: 'light', reviewers: [record('compliance-bug')] }),
      ctx()
    );
    expect(codesOf(r)).toEqual([]);
  });
  it('a final light receipt fails FINAL_NOT_FULL, demotion or not', () => {
    const final = { ...light, moment: 'final' };
    expect(codesOf(validateReviewReceipt(receipt(final), ctx({}, 'final')))).toEqual([
      'FINAL_NOT_FULL',
    ]);
    const demoted = { ...final, demotion: 'no-subagent-tool' };
    expect(codesOf(validateReviewReceipt(receipt(demoted), ctx({}, 'final')))).toEqual([
      'FINAL_NOT_FULL',
    ]);
  });
});

describe('suggestion: the light roster is exactly compliance-bug', () => {
  it('an extra reviewer that is not required fails LIGHT_TIER_ROSTER', () => {
    const r = receipt({
      tier: 'light',
      reviewers: [record('compliance-bug'), record('security', { required: false, ran: false })],
    });
    expect(codesOf(validateReviewReceipt(r, ctx()))).toEqual(['LIGHT_TIER_ROSTER']);
  });
  it('positive control: compliance-bug alone passes', () => {
    const r = receipt({ tier: 'light', reviewers: [record('compliance-bug')] });
    expect(codesOf(validateReviewReceipt(r, ctx()))).toEqual([]);
  });
});

describe('suggestion: diff.target is a full refs/remotes/ ref', () => {
  it.each(['origin/parent', 'refs/heads/parent', 'HEAD~1'])(
    '%s is an invalid receipt',
    (target) => {
      const r = receipt({
        moment: 'final',
        diff: { base: 'a'.repeat(40), head: 'b'.repeat(40), target },
      });
      expect(codesOf(validateReviewReceipt(r, ctx({}, 'final')))).toEqual(['RECEIPT_INVALID']);
    }
  );
});
