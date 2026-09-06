/**
 * The census constructor (`census`).
 *
 * A census is the shape behind every `0/0 checks passed`, `0 files scanned`
 * line: the population *is* the measurement, so there is no numerator subtlety
 * to argue about and the bug class is at its cheapest to catch. Three sizes
 * have to stay apart, and collapsing any pair of them is the failure:
 *
 *   N > 0  — measured; we examined N of the N there were.
 *   0      — an abstention; we looked and there was nothing. Not a pass.
 *   null   — unknown; we could not look at all. Points at the fetch, not the
 *            selector, and so must not be reported as the empty case.
 *
 * `denominate` and its siblings are covered next door in `denominate.test.ts`.
 * What is asserted here is only what `census` itself decides: the numerator and
 * denominator it derives from a single size, and that it inherits rather than
 * bypasses the population contract.
 */
import { describe, it, expect } from 'vitest';

import {
  ABSTENTION_PLACEHOLDER,
  census,
  formatMetricValue,
  MetricContractError,
} from '../../src/metrics';

const scanned = { definition: 'source files under packages/, excluding generated output' };

describe('census — a non-empty population is fully measured', () => {
  const examined = census('scan.files', 12, scanned);

  it('records the population size as the denominator', () => {
    expect(examined.denominator).toBe(12);
  });

  it('counts every member of the population as examined', () => {
    expect(examined.numerator).toBe(12);
  });

  it('is measured, so a reader may act on it', () => {
    expect(examined.basis).toBe('measured');
  });

  it('is complete by construction — the value is 1, not a fraction', () => {
    // The value carries no information in a census; the point is that it is
    // never a partial ratio, which would invite "88% scanned" readings.
    expect(examined.value).toBe(1);
  });

  it('carries its denominator in the note, so a copied figure keeps its population', () => {
    expect(examined.note).toBe('12 of 12 source files under packages/, excluding generated output');
  });

  it('records a single-member population as measured rather than rounding it away', () => {
    expect(census('scan.files', 1, scanned).basis).toBe('measured');
  });
});

describe('census — a census of zero is an abstention, not a pass', () => {
  const nothing = census('scan.files', 0, scanned);

  it('records basis "abstained"', () => {
    expect(nothing.basis).toBe('abstained');
  });

  it('carries no value, so nothing downstream can render it as a figure', () => {
    // The bug this exists to catch: `0 of 0` reported as fully covered because
    // the value was derived as 1 (or 100%) over an empty population. A null
    // value is the only shape a renderer structurally cannot print as a figure.
    expect(nothing.value).toBeNull();
  });

  it('renders as the abstention placeholder rather than a number', () => {
    expect(formatMetricValue(nothing)).toBe(ABSTENTION_PLACEHOLDER);
  });

  it('keeps the zero denominator visible instead of erasing the population', () => {
    expect(nothing.denominator).toBe(0);
  });
});

describe('census — an unknown size stays distinct from an empty one', () => {
  const unknown = census('scan.files', null, scanned);

  it('records basis "unknown"', () => {
    expect(unknown.basis).toBe('unknown');
  });

  it('keeps the denominator null rather than substituting zero', () => {
    expect(unknown.denominator).toBeNull();
  });

  it('does not make the caller invent a numerator for a size it never learned', () => {
    expect(unknown.numerator).toBe(0);
  });

  it('is not renderable as a figure either', () => {
    expect(unknown.value).toBeNull();
  });
});

describe('census — the population contract is inherited, not bypassed', () => {
  it('refuses a census with no population definition', () => {
    expect(() =>
      // @ts-expect-error — the type forbids it, but a JS caller or an `any`-typed
      // boundary can still reach the runtime check, which is the one that counts.
      census('scan.files', 12, {})
    ).toThrow(MetricContractError);
  });

  it('refuses a blank population definition rather than accepting the whitespace', () => {
    expect(() => census('scan.files', 12, { definition: '   ' })).toThrow(/missing-population/);
  });

  it('names the offending metric and violation, so the emit site is findable', () => {
    try {
      census('scan.files', 0, { definition: '' });
      expect.unreachable('a census with no stated population must not be emittable');
    } catch (error) {
      const contract = error as MetricContractError;
      expect(contract.metric).toBe('scan.files');
      expect(contract.violation).toBe('missing-population');
    }
  });

  it('refuses a negative size — a census counts, it does not subtract', () => {
    expect(() => census('scan.files', -1, scanned)).toThrow(/negative-denominator/);
  });
});
