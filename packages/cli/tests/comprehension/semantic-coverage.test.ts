import { describe, it, expect } from 'vitest';
import {
  formatSemanticCoverage,
  assessSemanticCoverage,
} from '../../src/comprehension/semantic-coverage';

// #2063 — the semantic present/absent ratio must be VISIBLE. Pure helpers: the
// formatting of the coverage line and the advisory/threshold verdict per context.

const cov = (present: number, absent: number) => ({
  total: present + absent,
  present,
  absent,
  absentRatio: present + absent > 0 ? absent / (present + absent) : 0,
});

describe('formatSemanticCoverage', () => {
  it('names present, absent, total and the absent percentage', () => {
    const line = formatSemanticCoverage(cov(572, 178));
    expect(line).toContain('572 present');
    expect(line).toContain('178 absent');
    expect(line).toContain('750');
    expect(line).toContain('23.7%');
  });
});

describe('assessSemanticCoverage', () => {
  it('is silent for an empty substrate', () => {
    expect(assessSemanticCoverage(cov(0, 0), 'main').level).toBe('none');
  });

  it('is info when every unit carries semantic', () => {
    expect(assessSemanticCoverage(cov(5, 0), 'main').level).toBe('info');
  });

  it('warns on main when any unit is absent and no threshold is configured', () => {
    const a = assessSemanticCoverage(cov(3, 1), 'main');
    expect(a.level).toBe('warn');
    expect(a.message).toContain('25.0%');
    expect(a.message).toContain('harness comprehend --all');
  });

  it('is info (never a warning) on the pr path — absent is the designed PR outcome', () => {
    expect(assessSemanticCoverage(cov(3, 1), 'pr').level).toBe('info');
    expect(assessSemanticCoverage(cov(3, 1), 'pr', 0).level).toBe('info');
  });

  it('errors on main only when the ratio strictly exceeds the configured threshold', () => {
    expect(assessSemanticCoverage(cov(3, 1), 'main', 0.2).level).toBe('error');
    expect(assessSemanticCoverage(cov(3, 1), 'main', 0.25).level).toBe('warn');
    expect(assessSemanticCoverage(cov(4, 0), 'main', 0).level).toBe('info');
  });
});
