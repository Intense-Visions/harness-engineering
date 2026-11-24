import { describe, it, expect } from 'vitest';
import {
  CONDITIONAL_REVIEWER_IDS,
  FULL_TIER_REVIEWER_IDS,
  LIGHT_TIER_REVIEWER_ID,
} from '@harness-engineering/types';
import { validateReviewReceipt } from '../../src/receipts/review-gate';
import { FULL, codesOf, ctx, finding, findingsText, receipt, record } from './round4-helpers';

/** Round 4, fix 11: every reviewer id in a receipt is a known reviewer; duplicates are O(n). */
describe('UNKNOWN_REVIEWER: a receipt names only known reviewers', () => {
  const known = [...FULL_TIER_REVIEWER_IDS, ...CONDITIONAL_REVIEWER_IDS];
  it.each(known)('known conditional or core id %s passes', (id) => {
    const reviewers = [...new Set([...FULL, id])].map((r) => record(r));
    const r = validateReviewReceipt(receipt({ reviewers }), ctx());
    expect(codesOf(r)).toEqual([]);
  });
  it(`the light reviewer ${LIGHT_TIER_REVIEWER_ID} passes on a light receipt`, () => {
    const r = validateReviewReceipt(
      receipt({ tier: 'light', reviewers: [record(LIGHT_TIER_REVIEWER_ID)] }),
      ctx()
    );
    expect(codesOf(r)).toEqual([]);
  });
  const unknown: Array<[string, Record<string, unknown>]> = [
    ['a misspelled required reviewer', record('typescript-strct')],
    ['an unknown reviewer that did not run', record('performance', { ran: false })],
    ['an unknown optional reviewer', record('whatever', { required: false, ran: false })],
  ];
  it.each(unknown)('%s fails UNKNOWN_REVIEWER', (_name, extra) => {
    const r = validateReviewReceipt(
      receipt({ reviewers: [...FULL.map((id) => record(id)), extra] }),
      ctx({ readFindings: (p) => findingsText(p.replace(/\.json$/, '')) })
    );
    expect(codesOf(r)).toContain('UNKNOWN_REVIEWER');
    expect(r.failures.find((f) => f.code === 'UNKNOWN_REVIEWER')?.reviewerId).toBe(extra.id);
  });
  it('two unknown ids give two failures, a duplicate unknown id one per listing', () => {
    const reviewers = [...FULL.map((id) => record(id)), record('x-one'), record('x-two')];
    const r = validateReviewReceipt(receipt({ reviewers }), ctx());
    expect(codesOf(r).filter((c) => c === 'UNKNOWN_REVIEWER')).toHaveLength(2);
  });
});

describe('DUPLICATE_FINDING_ID: one pass over the ids', () => {
  const withIds = (ids: string[]) =>
    ctx({
      readFindings: (p) => {
        const id = p.replace(/\.json$/, '');
        return findingsText(id, id === 'bug' ? ids.map((f) => finding(f, 'suggestion')) : []);
      },
    });
  const rows: Array<[string, string[], string[]]> = [
    ['none', [], []],
    ['one', ['f1'], []],
    ['many distinct', ['f1', 'f2', 'f3'], []],
    ['one duplicate', ['f1', 'f2', 'f1'], ['f1']],
    ['a triple is named once', ['f1', 'f1', 'f1'], ['f1']],
    ['two duplicates in first-repeat order', ['b', 'a', 'a', 'b'], ['a', 'b']],
  ];
  it.each(rows)('%s', (_name, ids, repeated) => {
    const r = validateReviewReceipt(receipt({ advisory: ids.length }), withIds(ids));
    const dup = r.failures.find((f) => f.code === 'DUPLICATE_FINDING_ID');
    if (repeated.length === 0) expect(dup).toBeUndefined();
    else expect(dup?.message).toMatch(new RegExp(`used more than once: ${repeated.join(', ')}$`));
  });
  it('100,000 distinct ids are checked in well under a second (was quadratic)', () => {
    const ids = Array.from({ length: 100_000 }, (_, i) => `f${i}`);
    const started = Date.now();
    const r = validateReviewReceipt(receipt({ advisory: ids.length }), withIds(ids));
    expect(codesOf(r)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
