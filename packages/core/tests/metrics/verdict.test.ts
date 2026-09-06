/**
 * The pass / abstain / unknown decision (issue #1530).
 *
 * The property under test throughout: **nothing that measured nothing may
 * converge.** Every case below is a way a reporting path can end up having
 * examined an empty population while still looking like it succeeded.
 */
import { describe, it, expect } from 'vitest';

import { denominate, unknownPopulation, verdictForMetrics } from '../../src/metrics';

const pop = (definition: string) => ({ definition });

const measured = (metric: string) =>
  denominate({ metric, numerator: 3, denominator: 4, population: pop(`${metric} population`) });

const abstained = (metric: string) =>
  denominate({ metric, numerator: 0, denominator: 0, population: pop(`${metric} population`) });

describe('verdictForMetrics — the empty set is itself a zero denominator', () => {
  it('does not converge on an empty metric set', () => {
    const verdict = verdictForMetrics([]);
    expect(verdict.ok).toBe(false);
    expect(verdict.outcome).toBe('abstained');
  });

  it('says ZERO DENOMINATOR so the string is greppable in a log', () => {
    expect(verdictForMetrics([]).message).toMatch(/^ZERO DENOMINATOR:/);
  });

  it('names the subject when the caller supplied one', () => {
    const verdict = verdictForMetrics([], { subject: 'the documentation coverage check' });
    expect(verdict.message).toMatch(/the documentation coverage check/);
  });
});

describe('verdictForMetrics — an abstention never reads as a pass', () => {
  it('refuses to converge when any metric abstained', () => {
    const verdict = verdictForMetrics([measured('a'), abstained('b'), measured('c')]);
    expect(verdict.ok).toBe(false);
    expect(verdict.outcome).toBe('abstained');
  });

  it('names exactly the offending metrics', () => {
    const verdict = verdictForMetrics([measured('a'), abstained('b'), abstained('c')]);
    expect(verdict.offenders.map((m) => m.metric)).toEqual(['b', 'c']);
  });

  it('explains that an empty population usually means a wrong selector', () => {
    const verdict = verdictForMetrics([abstained('b')]);
    expect(verdict.message).toMatch(/ZERO DENOMINATOR/);
    expect(verdict.message).toMatch(/not a pass/);
    expect(verdict.message).toMatch(/selector matched nothing/);
  });

  it('converges only when every metric was measured', () => {
    const verdict = verdictForMetrics([measured('a'), measured('b')]);
    expect(verdict.ok).toBe(true);
    expect(verdict.outcome).toBe('converged');
    expect(verdict.message).toBeNull();
    expect(verdict.offenders).toEqual([]);
  });
});

describe('verdictForMetrics — unknown is reported as unknown, not as zero', () => {
  it('reports "unknown" when a population size could not be established', () => {
    const verdict = verdictForMetrics([measured('a'), unknownPopulation('b', pop('b population'))]);
    expect(verdict.outcome).toBe('unknown');
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toMatch(/^UNKNOWN DENOMINATOR:/);
  });

  it('prefers the abstention when both are present — it is the more misleading one', () => {
    const verdict = verdictForMetrics([
      unknownPopulation('a', pop('a population')),
      abstained('b'),
    ]);
    expect(verdict.outcome).toBe('abstained');
    expect(verdict.offenders.map((m) => m.metric)).toEqual(['b']);
  });
});

describe('verdictForMetrics — required metrics', () => {
  it('considers only the required metrics when the caller names them', () => {
    const verdict = verdictForMetrics([measured('a'), abstained('optional')], {
      required: ['a'],
    });
    expect(verdict.ok).toBe(true);
  });

  it('treats a required metric that was never emitted as an abstention', () => {
    const verdict = verdictForMetrics([measured('a')], { required: ['a', 'b'] });
    expect(verdict.ok).toBe(false);
    expect(verdict.outcome).toBe('abstained');
    expect(verdict.message).toMatch(/never emitted: b/);
  });

  it('does not let a missing required metric slip through as converged', () => {
    // The shape that makes this necessary: a loop that ran zero times emits no
    // metric at all, and a naive "all emitted metrics are fine" check passes.
    const verdict = verdictForMetrics([], { required: ['coverage'] });
    expect(verdict.ok).toBe(false);
  });
});

describe('verdictForMetrics — the check does not have its own denominator bug', () => {
  it('detects a missing required id even when a duplicate makes the counts line up', () => {
    // Two `a`s and no `b`: a length comparison would see 2 === 2 and conclude
    // that both required metrics were present.
    const verdict = verdictForMetrics([measured('a'), measured('a')], { required: ['a', 'b'] });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toMatch(/never emitted: b/);
  });
});
