import { describe, it, expect } from 'vitest';
import { validateReviewReceipt } from '../../src/receipts/review-gate';
import { codesOf, ctx, receipt, record } from './round4-helpers';

/**
 * Fix 3. A session with no subagent tool runs `light` whatever the tier command computed. The
 * receipt records what the command printed (`computedTier`, `tierReasons`) and, for that one
 * demotion, `demotion: "no-subagent-tool"`. Partition: tier x computedTier {absent, light, full}
 * x demotion {absent, no-subagent-tool, another value}; a demotion that does not describe a
 * demotion is an invalid receipt.
 */
const light = { tier: 'light', reviewers: [record('compliance-bug')] };
const full = {};
const DEMOTED = 'no-subagent-tool';
describe('the receipt gate: a light receipt below a computed full tier', () => {
  it.each<[string, Record<string, unknown>, string[]]>([
    ['light, nothing computed recorded', { ...light }, []],
    ['light, computed light', { ...light, computedTier: 'light', tierReasons: [] }, []],
    [
      'light, computed full, no demotion',
      { ...light, computedTier: 'full', tierReasons: ['risk-keyword:token'] },
      ['TIER_DEMOTED'],
    ],
    [
      'light, computed full, demotion no-subagent-tool',
      { ...light, computedTier: 'full', tierReasons: ['risk-keyword:token'], demotion: DEMOTED },
      [],
    ],
    ['full, computed full', { ...full, computedTier: 'full', tierReasons: ['x'] }, []],
    ['full, computed light (raised)', { ...full, computedTier: 'light', tierReasons: [] }, []],
    [
      'full with a demotion',
      { ...full, computedTier: 'full', demotion: DEMOTED },
      ['RECEIPT_INVALID'],
    ],
    [
      'light, computed light, with a demotion',
      { ...light, computedTier: 'light', demotion: DEMOTED },
      ['RECEIPT_INVALID'],
    ],
    [
      'light, nothing computed, with a demotion',
      { ...light, demotion: DEMOTED },
      ['RECEIPT_INVALID'],
    ],
    [
      'light, computed full, an unknown demotion',
      { ...light, computedTier: 'full', demotion: 'busy' },
      ['RECEIPT_INVALID'],
    ],
    ['an unknown computed tier', { ...light, computedTier: 'heavy' }, ['RECEIPT_INVALID']],
    [
      'an empty tier reason',
      { ...light, computedTier: 'light', tierReasons: [''] },
      ['RECEIPT_INVALID'],
    ],
  ])('%s', (_n, over, expected) => {
    expect(codesOf(validateReviewReceipt(receipt(over), ctx()))).toEqual(expected);
  });
  it('TIER_DEMOTED names the computed reasons', () => {
    const r = validateReviewReceipt(
      receipt({ ...light, computedTier: 'full', tierReasons: ['risk-keyword:token'] }),
      ctx()
    );
    expect(r.failures[0]?.message).toContain('risk-keyword:token');
  });
  it('a final review is never excused by a demotion', () => {
    const over = { ...light, moment: 'final', computedTier: 'full', demotion: DEMOTED };
    const r = validateReviewReceipt(receipt(over), ctx({}, 'final'));
    expect(codesOf(r)).toEqual(['FINAL_NOT_FULL']);
  });
});
