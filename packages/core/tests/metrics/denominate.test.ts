/**
 * The emit contract (issue #1530).
 *
 * Three properties are load-bearing and each has its own describe block:
 *   1. A metric with no stated population fails the emit. Loudly, by throwing.
 *   2. A ZERO denominator produces an abstention with NO value — it is
 *      structurally impossible to render it as a number, let alone a green one.
 *   3. An UNKNOWN denominator (`null`) stays distinguishable from a zero one,
 *      because "we looked and found nothing" and "we could not look" call for
 *      different operator responses.
 */
import { describe, it, expect } from 'vitest';

import {
  denominate,
  unknownPopulation,
  describePopulation,
  MetricContractError,
} from '../../src/metrics';

const files = { definition: 'markdown files under docs/' };

describe('denominate — the population is mandatory', () => {
  it('throws when the population definition is missing entirely', () => {
    expect(() =>
      // @ts-expect-error — deliberately violating the contract the type enforces,
      // because JS callers and `any`-typed boundaries can still do this at runtime.
      denominate({ metric: 'docs.coverage', numerator: 3, denominator: 4, population: {} })
    ).toThrow(MetricContractError);
  });

  it('throws when the population definition is blank or whitespace', () => {
    for (const definition of ['', '   ', '\n\t']) {
      expect(() =>
        denominate({
          metric: 'docs.coverage',
          numerator: 3,
          denominator: 4,
          population: { definition },
        })
      ).toThrow(/missing-population/);
    }
  });

  it('names the offending metric and the violation on the error', () => {
    try {
      denominate({
        metric: 'docs.coverage',
        numerator: 3,
        denominator: 4,
        population: { definition: '' },
      });
      expect.unreachable('a blank population must not be emittable');
    } catch (error) {
      const contract = error as MetricContractError;
      expect(contract.metric).toBe('docs.coverage');
      expect(contract.violation).toBe('missing-population');
      // The message has to tell the author what to write, not just that they failed.
      expect(contract.message).toMatch(/selection rule/);
    }
  });

  it('throws on a blank metric id', () => {
    expect(() =>
      denominate({ metric: '  ', numerator: 1, denominator: 2, population: files })
    ).toThrow(/missing-metric-id/);
  });

  it('rejects a non-finite numerator rather than emitting NaN', () => {
    for (const numerator of [Number.NaN, Infinity, -Infinity]) {
      expect(() =>
        denominate({ metric: 'm', numerator, denominator: 4, population: files })
      ).toThrow(/non-finite-numerator/);
    }
  });

  it('rejects a negative denominator — a population size is a count', () => {
    expect(() =>
      denominate({ metric: 'm', numerator: 1, denominator: -3, population: files })
    ).toThrow(/negative-denominator/);
  });
});

describe('denominate — a zero denominator is an abstention, not a pass', () => {
  const abstained = denominate({
    metric: 'docs.coverage',
    numerator: 0,
    denominator: 0,
    population: files,
    unit: 'percent',
  });

  it('records basis "abstained"', () => {
    expect(abstained.basis).toBe('abstained');
  });

  it('carries NO value, so no renderer can print it as a number', () => {
    expect(abstained.value).toBeNull();
  });

  it('keeps the zero denominator visible rather than erasing it', () => {
    expect(abstained.denominator).toBe(0);
  });

  it('says in words that this is not a pass', () => {
    expect(abstained.note).toMatch(/not a pass/);
    expect(abstained.note).toMatch(/abstained/);
  });

  it('never describes an abstention with a word that reads as a verdict', () => {
    // The failure mode is a well-meaning "0 problems found" phrasing.
    expect(abstained.note).not.toMatch(/\b(clean|passing|healthy|ok|success)\b/i);
  });

  it('abstains even when the caller supplied a value', () => {
    // A caller that pre-computed `100` over an empty population — the exact
    // `totalRequired === 0 ? 100 : ...` shape found in validation/file-structure.
    const forced = denominate({
      metric: 'structure.conformance',
      numerator: 0,
      denominator: 0,
      population: { definition: 'required file-structure conventions' },
      unit: 'percent',
      value: 100,
    });
    expect(forced.value).toBeNull();
    expect(forced.basis).toBe('abstained');
  });
});

describe('denominate — an unknown denominator stays distinct from a zero one', () => {
  const unknown = unknownPopulation('tracker.tickets', {
    definition: 'tickets matching the configured selector labels',
    source: 'the GitHub tracker',
  });

  it('records basis "unknown", not "abstained"', () => {
    expect(unknown.basis).toBe('unknown');
    expect(unknown.denominator).toBeNull();
  });

  it('carries no value either', () => {
    expect(unknown.value).toBeNull();
  });

  it('points the operator at the source rather than at the selector', () => {
    expect(unknown.note).toMatch(/could not be established/);
    expect(unknown.note).toMatch(/the GitHub tracker/);
    expect(unknown.note).toMatch(/not a pass/);
  });

  it('is not equal to the zero case — the two must never be collapsed', () => {
    const zero = denominate({
      metric: 'tracker.tickets',
      numerator: 0,
      denominator: 0,
      population: { definition: 'tickets matching the configured selector labels' },
    });
    expect(zero.basis).not.toBe(unknown.basis);
    expect(zero.denominator).not.toBe(unknown.denominator);
  });
});

describe('denominate — measured values', () => {
  it('derives a ratio by default', () => {
    const m = denominate({ metric: 'm', numerator: 3, denominator: 4, population: files });
    expect(m.basis).toBe('measured');
    expect(m.value).toBe(0.75);
    expect(m.unit).toBe('ratio');
  });

  it('scales a percent unit to [0, 100]', () => {
    const m = denominate({
      metric: 'm',
      numerator: 3,
      denominator: 4,
      population: files,
      unit: 'percent',
    });
    expect(m.value).toBe(75);
  });

  it('rounds to the requested precision', () => {
    const m = denominate({
      metric: 'm',
      numerator: 1,
      denominator: 3,
      population: files,
      unit: 'percent',
      precision: 2,
    });
    expect(m.value).toBe(33.33);
  });

  it('carries the denominator in the note even when measured', () => {
    const m = denominate({ metric: 'm', numerator: 3, denominator: 4, population: files });
    expect(m.note).toBe('3 of 4 markdown files under docs/');
  });

  it('requires an explicit value for a composite score', () => {
    expect(() =>
      denominate({ metric: 'm', numerator: 1, denominator: 5, population: files, unit: 'score' })
    ).toThrow(/missing-value/);
  });

  it('accepts an explicit value for a composite score, still denominated', () => {
    const m = denominate({
      metric: 'strength.score',
      numerator: 7,
      denominator: 12,
      population: { definition: 'applicable strength rules' },
      unit: 'score',
      value: 82,
    });
    expect(m.value).toBe(82);
    expect(m.note).toBe('7 of 12 applicable strength rules');
  });

  it('rejects a per-item rate that would divide to a non-finite value', () => {
    expect(() =>
      denominate({
        metric: 'm',
        numerator: 1,
        denominator: 2,
        population: files,
        unit: 'per-item',
        value: Number.NaN,
      })
    ).toThrow(/non-finite-value/);
  });
});

describe('describePopulation — the qualifiers that are invisible in the number', () => {
  it('renders the definition alone when unqualified', () => {
    expect(describePopulation({ definition: 'merged PRs' })).toBe('merged PRs');
  });

  it('appends the window, source and exclusions', () => {
    const described = describePopulation({
      definition: 'merged PRs',
      window: 'last 90 days',
      source: 'the git log',
      exclusions: ['bot authors', 'docs-only changes'],
    });
    expect(described).toBe(
      'merged PRs (last 90 days, from the git log, excluding bot authors; docs-only changes)'
    );
  });
});
