import { describe, it, expect } from 'vitest';
import { deriveAcceptanceAuthority } from '../../src/acceptance-eval/authority.js';
import type { Measurability, Confidence, Authority } from '../../src/acceptance-eval/types.js';

const CONFIDENCES: Confidence[] = ['low', 'medium', 'high'];

/** Hand-written oracle: all 9 (measurability, confidence) pairs as literals. */
const AUTHORITY_TABLE: ReadonlyArray<[Measurability, Confidence, Authority]> = [
  ['MEASURABLE', 'low', 'advisory'],
  ['MEASURABLE', 'medium', 'advisory'],
  ['MEASURABLE', 'high', 'advisory'],
  ['NOT_MEASURABLE', 'low', 'advisory'],
  ['NOT_MEASURABLE', 'medium', 'advisory'],
  ['NOT_MEASURABLE', 'high', 'blocking'],
  ['INCONCLUSIVE', 'low', 'advisory'],
  ['INCONCLUSIVE', 'medium', 'advisory'],
  ['INCONCLUSIVE', 'high', 'advisory'],
];

describe('deriveAcceptanceAuthority', () => {
  it('is blocking iff NOT_MEASURABLE + high', () => {
    expect(deriveAcceptanceAuthority('NOT_MEASURABLE', 'high')).toBe('blocking');
  });

  it.each(AUTHORITY_TABLE)(
    'maps (%s, %s) to %s — full 9-pair table against a literal oracle',
    (measurability, confidence, expected) => {
      expect(deriveAcceptanceAuthority(measurability, confidence)).toBe(expected);
    }
  );

  it('INCONCLUSIVE is always advisory regardless of confidence', () => {
    for (const c of CONFIDENCES) {
      expect(deriveAcceptanceAuthority('INCONCLUSIVE', c)).toBe('advisory');
    }
  });

  it('MEASURABLE is always advisory regardless of confidence', () => {
    for (const c of CONFIDENCES) {
      expect(deriveAcceptanceAuthority('MEASURABLE', c)).toBe('advisory');
    }
  });
});
