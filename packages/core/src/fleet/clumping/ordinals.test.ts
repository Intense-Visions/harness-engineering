// THE PROPERTY: two passes over one input must number it the same way.
//
// `formClumps` THROWS on a duplicate `ClumpableItem.id`, so every seam numbers
// repeated native ids — and `formatClumpedComments` numbers its findings TWICE,
// once to build the clump candidates and once to emit the complement. If the
// two passes ever disagree, a finding already folded into a clump also gets its
// own comment, which is the double-report this control exists to prevent and
// which no existing assertion could have caught: both outputs are well-formed.
//
// The helper's job is to make that agreement structural. Its own tests are
// therefore about determinism and key isolation, not about counting.

import { describe, expect, it } from 'vitest';

import { withOrdinals } from './ordinals';

describe('withOrdinals', () => {
  it('numbers repeats from 0, per key, in input order', () => {
    const got = withOrdinals(['a', 'b', 'a', 'a', 'b'], (s) => s);
    expect(got.map((n) => `${n.item}#${n.ordinal}`)).toEqual(['a#0', 'b#0', 'a#1', 'a#2', 'b#1']);
  });

  it('keeps distinct keys from stealing each other ordinals', () => {
    // The failure this guards is a `keyOf` that collapses two things into one
    // key: every item would then be numbered as a repeat of the other.
    const got = withOrdinals(['x', 'y', 'z'], (s) => s);
    expect(got.every((n) => n.ordinal === 0)).toBe(true);
    // POSITIVE CONTROL: a `keyOf` that DOES collapse them numbers them 0,1,2,
    // so the assertion above is about the keys and not about the helper always
    // answering 0.
    expect(withOrdinals(['x', 'y', 'z'], () => 'same').map((n) => n.ordinal)).toEqual([0, 1, 2]);
  });

  it('is a function of the input array, so two passes agree BY CONSTRUCTION', () => {
    // This is the whole reason the helper exists. Not a tautology about purity:
    // the two call sites in `formatClumpedComments` used to hold two separate
    // `Map`s, and nothing in the type system or the tests tied them together.
    const findings = [{ id: 'bug-a.ts-1' }, { id: 'bug-a.ts-1' }, { id: 'style-b.ts-9' }];
    const first = withOrdinals(findings, (f) => f.id);
    const second = withOrdinals(findings, (f) => f.id);
    expect(first.map((n) => n.ordinal)).toEqual(second.map((n) => n.ordinal));
    expect(first.map((n) => `${n.item.id}#${n.ordinal}`)).toEqual([
      'bug-a.ts-1#0',
      'bug-a.ts-1#1',
      'style-b.ts-9#0',
    ]);
  });

  it('answers [] for [] rather than throwing', () => {
    expect(withOrdinals([], (s: string) => s)).toEqual([]);
  });
});
