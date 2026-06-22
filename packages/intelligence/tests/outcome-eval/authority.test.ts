import { describe, it, expect } from 'vitest';
import { deriveAuthority } from '../../src/outcome-eval/authority.js';
import type { Verdict, Confidence, Authority } from '../../src/outcome-eval/types.js';

const CONFIDENCES: Confidence[] = ['low', 'medium', 'high'];

/**
 * Hand-written oracle: every one of the 9 (verdict, confidence) pairs with its
 * expected authority typed out as a literal. Independent of the implementation
 * expression so the test cannot be tautological.
 */
const AUTHORITY_TABLE: ReadonlyArray<[Verdict, Confidence, Authority]> = [
  ['SATISFIED', 'low', 'advisory'],
  ['SATISFIED', 'medium', 'advisory'],
  ['SATISFIED', 'high', 'advisory'],
  ['NOT_SATISFIED', 'low', 'advisory'],
  ['NOT_SATISFIED', 'medium', 'advisory'],
  ['NOT_SATISFIED', 'high', 'blocking'],
  ['INCONCLUSIVE', 'low', 'advisory'],
  ['INCONCLUSIVE', 'medium', 'advisory'],
  ['INCONCLUSIVE', 'high', 'advisory'],
];

describe('deriveAuthority', () => {
  it('is blocking iff NOT_SATISFIED + high', () => {
    expect(deriveAuthority('NOT_SATISFIED', 'high')).toBe('blocking');
  });

  it.each(AUTHORITY_TABLE)(
    'maps (%s, %s) to %s — full 9-pair table against a literal oracle',
    (verdict, confidence, expected) => {
      expect(deriveAuthority(verdict, confidence)).toBe(expected);
    }
  );

  it('INCONCLUSIVE is always advisory regardless of confidence (Criterion 3)', () => {
    for (const c of CONFIDENCES) {
      expect(deriveAuthority('INCONCLUSIVE', c)).toBe('advisory');
    }
  });

  it('SATISFIED is always advisory regardless of confidence', () => {
    for (const c of CONFIDENCES) {
      expect(deriveAuthority('SATISFIED', c)).toBe('advisory');
    }
  });
});
