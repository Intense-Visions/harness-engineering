import { describe, it, expect } from 'vitest';
import {
  SIGNAL_REGISTRY,
  CHECK_SIGNAL_MAP,
  SIGNAL_CATEGORY_MAP,
  HEALTH_SIGNAL_NAMES,
  reconcilePassed,
} from './index';

describe('SIGNAL_REGISTRY', () => {
  it('declares the real signal vocabulary with check mappings', () => {
    const names = SIGNAL_REGISTRY.map((s) => s.name).sort();
    expect(names).toEqual(
      [
        'anomaly-outlier',
        'articulation-point',
        'circular-deps',
        'dead-code',
        'doc-gaps',
        'drift',
        'high-complexity',
        'high-coupling',
        'layer-violations',
        'low-coverage',
        'perf-regression',
        'security-findings',
      ].sort()
    );
  });

  it('marks metrics-only signals with check: null', () => {
    const metricsOnly = SIGNAL_REGISTRY.filter((s) => s.check === null).map((s) => s.name);
    expect(metricsOnly.sort()).toEqual(
      [
        'anomaly-outlier',
        'articulation-point',
        'high-complexity',
        'high-coupling',
        'low-coverage',
      ].sort()
    );
  });
});

describe('CHECK_SIGNAL_MAP (derived, SC4)', () => {
  it('groups signal names by check, skipping null, many-to-one', () => {
    expect(CHECK_SIGNAL_MAP.deps.sort()).toEqual(['circular-deps', 'layer-violations'].sort());
    expect(CHECK_SIGNAL_MAP.entropy.sort()).toEqual(['dead-code', 'drift'].sort());
    expect(CHECK_SIGNAL_MAP.security).toEqual(['security-findings']);
    expect(CHECK_SIGNAL_MAP.docs).toEqual(['doc-gaps']);
    expect(CHECK_SIGNAL_MAP.perf).toEqual(['perf-regression']);
  });

  it('has lint with no signals (governed by assess alone, SC2)', () => {
    expect(CHECK_SIGNAL_MAP.lint).toEqual([]);
  });

  it('never includes a metrics-only signal in any check bucket (SC3)', () => {
    const all = Object.values(CHECK_SIGNAL_MAP).flat();
    for (const s of [
      'anomaly-outlier',
      'articulation-point',
      'high-coupling',
      'high-complexity',
      'low-coverage',
    ]) {
      expect(all).not.toContain(s);
    }
  });
});

describe('SIGNAL_CATEGORY_MAP (derived, SC4 — single-sources parallel-safety categories)', () => {
  it('maps exactly the categorized signals to their category, omitting null', () => {
    expect(SIGNAL_CATEGORY_MAP).toEqual({
      'circular-deps': 'structure',
      'layer-violations': 'structure',
      'high-coupling': 'structure',
      'low-coverage': 'coverage',
      'dead-code': 'quality',
      drift: 'quality',
      'security-findings': 'security',
      'doc-gaps': 'quality',
      'perf-regression': 'performance',
    });
  });

  it('reproduces the legacy structure/quality/security/performance/coverage grouping exactly', () => {
    const byCategory = (cat: string) =>
      Object.entries(SIGNAL_CATEGORY_MAP)
        .filter(([, c]) => c === cat)
        .map(([name]) => name)
        .sort();
    expect(byCategory('structure')).toEqual(
      ['circular-deps', 'layer-violations', 'high-coupling'].sort()
    );
    expect(byCategory('quality')).toEqual(['dead-code', 'drift', 'doc-gaps'].sort());
    expect(byCategory('security')).toEqual(['security-findings']);
    expect(byCategory('performance')).toEqual(['perf-regression']);
    expect(byCategory('coverage')).toEqual(['low-coverage']);
  });

  it('excludes every uncategorized (category: null) signal — metrics-only stay null', () => {
    for (const name of ['high-complexity', 'anomaly-outlier', 'articulation-point']) {
      expect(SIGNAL_CATEGORY_MAP).not.toHaveProperty(name);
    }
  });

  it('only ever contains the five known categories as values', () => {
    const valid = new Set(['structure', 'quality', 'security', 'performance', 'coverage']);
    for (const c of Object.values(SIGNAL_CATEGORY_MAP)) {
      expect(valid.has(c)).toBe(true);
    }
  });
});

describe('HEALTH_SIGNAL_NAMES (derived, SC4 — single source for cli HEALTH_SIGNALS)', () => {
  it('lists all 12 registry signal names in registry order', () => {
    expect([...HEALTH_SIGNAL_NAMES]).toEqual([
      'circular-deps',
      'layer-violations',
      'high-coupling',
      'high-complexity',
      'low-coverage',
      'dead-code',
      'drift',
      'security-findings',
      'doc-gaps',
      'perf-regression',
      'anomaly-outlier',
      'articulation-point',
    ]);
  });

  it('is exactly the registry name list (no drift between the two)', () => {
    expect([...HEALTH_SIGNAL_NAMES]).toEqual(SIGNAL_REGISTRY.map((s) => s.name));
  });
});

describe('reconcilePassed (conjunction, monotonic toward fail)', () => {
  it('demotes a dishonest pass when a contradicting signal is present (SC1)', () => {
    const out = reconcilePassed({ security: { passed: true, issueCount: 0 } }, [
      'security-findings',
    ]);
    expect(out.security.passed).toBe(false);
    expect(out.security.issueCount).toBe(0); // other fields preserved
  });

  it('demotes deps on any of its many signals (SC1, many-to-one)', () => {
    expect(reconcilePassed({ deps: { passed: true } }, ['layer-violations']).deps.passed).toBe(
      false
    );
    expect(reconcilePassed({ deps: { passed: true } }, ['circular-deps']).deps.passed).toBe(false);
  });

  it('preserves an assess failure that has no signal — lint conjunction (SC2)', () => {
    expect(reconcilePassed({ lint: { passed: false } }, []).lint.passed).toBe(false);
  });

  it('never flips false -> true even if no signal is present (monotonic)', () => {
    expect(reconcilePassed({ docs: { passed: false } }, []).docs.passed).toBe(false);
  });

  it('leaves passed true when no contradicting signal is present', () => {
    expect(reconcilePassed({ docs: { passed: true } }, []).docs.passed).toBe(true);
  });

  it('ignores metrics-only signals — they change nothing (SC3)', () => {
    const out = reconcilePassed({ deps: { passed: true }, entropy: { passed: true } }, [
      'high-coupling',
      'low-coverage',
      'anomaly-outlier',
    ]);
    expect(out.deps.passed).toBe(true);
    expect(out.entropy.passed).toBe(true);
  });

  it('is pure — does not mutate the input checks', () => {
    const input = { security: { passed: true } };
    reconcilePassed(input, ['security-findings']);
    expect(input.security.passed).toBe(true);
  });
});
