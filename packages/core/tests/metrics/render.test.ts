/**
 * Rendering (issue #1530).
 *
 * The property: **no rendered figure is ever separated from its population, and
 * an abstention is never rendered as a number.** The second half is what the
 * bug class actually needs — every observed instance was a zero denominator
 * printed as `0%`, `100%`, `0.0`, or an empty bar, all of which read as
 * measurements.
 */
import { describe, it, expect } from 'vitest';

import {
  ABSTENTION_PLACEHOLDER,
  denominate,
  formatMetric,
  formatMetricBlock,
  formatMetricValue,
  formatPopulation,
  unknownPopulation,
} from '../../src/metrics';

const coverage = denominate({
  metric: 'docs.coverage',
  numerator: 312,
  denominator: 332,
  population: { definition: 'markdown files under docs/' },
  unit: 'percent',
});

const empty = denominate({
  metric: 'docs.coverage',
  numerator: 0,
  denominator: 0,
  population: { definition: 'markdown files under docs/' },
  unit: 'percent',
});

describe('formatMetricValue', () => {
  it('renders a measured percent with its sign', () => {
    expect(formatMetricValue(coverage)).toBe('94.0%');
  });

  it('renders an abstention as a dash, never as a number', () => {
    expect(formatMetricValue(empty)).toBe(ABSTENTION_PLACEHOLDER);
  });

  it('renders an unknown population as a dash too', () => {
    const unknown = unknownPopulation('tracker.tickets', { definition: 'tickets' });
    expect(formatMetricValue(unknown)).toBe(ABSTENTION_PLACEHOLDER);
  });

  it('never renders 0 or 100 for an empty population', () => {
    // The two specific fabrications found in the codebase: `? 0 :` and `? 100 :`.
    const rendered = formatMetricValue(empty);
    expect(rendered).not.toBe('0.0%');
    expect(rendered).not.toBe('100.0%');
  });

  it('honors the requested precision', () => {
    expect(formatMetricValue(coverage, { precision: 3 })).toBe('93.976%');
  });
});

describe('formatMetric — the value cannot be printed without the population', () => {
  it('puts the denominator next to a measured figure', () => {
    expect(formatMetric(coverage)).toBe(
      'docs.coverage: 94.0% (312 of 332 markdown files under docs/)'
    );
  });

  it('makes an abstention harder to skim past than a green figure would be', () => {
    const line = formatMetric(empty);
    expect(line).toContain(ABSTENTION_PLACEHOLDER);
    expect(line).toMatch(/not a pass/);
  });
});

describe('formatMetricBlock', () => {
  it('abstains loudly rather than printing an empty block', () => {
    expect(formatMetricBlock([])).toMatch(/nothing was measured/);
    expect(formatMetricBlock([])).toMatch(/not a pass/);
  });

  it('trails abstentions so they land where a reader stops', () => {
    const lines = formatMetricBlock([empty, coverage]).split('\n');
    expect(lines[0]).toContain('94.0%');
    expect(lines[1]).toContain(ABSTENTION_PLACEHOLDER);
  });
});

describe('formatPopulation', () => {
  it('exposes the population clause on its own for a dedicated column', () => {
    expect(formatPopulation(coverage)).toBe('markdown files under docs/');
  });
});
