// packages/cli/tests/design-craft/award-bar.test.ts
//
// Unit tests for computeAwardBar — the machine award-tier verdict derived
// from a BENCHMARK radar + the cited exemplars' reference scores.

import { describe, it, expect } from 'vitest';
import {
  computeAwardBar,
  resolveAwardBarConfig,
  DEFAULT_AWARD_BAR_CONFIG,
} from '../../src/design-craft/phases/award-bar.js';
import type { AwardBarConfig } from '../../src/design-craft/phases/award-bar.js';
import type {
  BenchmarkScore,
  Confidence,
  RadarDimensionName,
} from '../../src/design-craft/findings/schema.js';
import { linearEmptyListExemplar } from '../../src/design-craft/catalog/exemplars/linear-empty-list.js';
import type {
  ExemplarDefinition,
  RadarReference,
} from '../../src/design-craft/catalog/exemplars/linear-empty-list.js';

const DIMS: RadarDimensionName[] = [
  'philosophicalCoherence',
  'hierarchy',
  'craftExecution',
  'function',
  'innovation',
];

/** Build a radar where every dimension has the same score/confidence, with optional per-dim overrides. */
function radar(
  score: number,
  confidence: Confidence = 'high',
  overrides: Partial<Record<RadarDimensionName, { score?: number; confidence?: Confidence }>> = {}
): BenchmarkScore['radar'] {
  const out = {} as BenchmarkScore['radar'];
  for (const dim of DIMS) {
    const o = overrides[dim] ?? {};
    out[dim] = {
      score: o.score ?? score,
      confidence: o.confidence ?? confidence,
      notes: 'test',
    };
  }
  return out;
}

/** An exemplar whose radarReference is uniform (or overridden per dimension). */
function exemplar(ref: number, overrides: Partial<RadarReference> = {}): ExemplarDefinition {
  const radarReference: RadarReference = {
    philosophicalCoherence: ref,
    hierarchy: ref,
    craftExecution: ref,
    function: ref,
    innovation: ref,
    ...overrides,
  };
  return { ...linearEmptyListExemplar, radarReference };
}

describe('resolveAwardBarConfig', () => {
  it('returns the defaults when no partial is given', () => {
    expect(resolveAwardBarConfig()).toEqual(DEFAULT_AWARD_BAR_CONFIG);
    expect(DEFAULT_AWARD_BAR_CONFIG).toEqual({
      dimensionFloor: 80,
      fraction: 0.95,
      confidenceFloor: 'medium',
    });
  });

  it('merges a partial over the defaults', () => {
    expect(resolveAwardBarConfig({ dimensionFloor: 90 })).toEqual({
      dimensionFloor: 90,
      fraction: 0.95,
      confidenceFloor: 'medium',
    });
  });
});

describe('computeAwardBar', () => {
  it('clears when every dimension meets its floor and confidence is high', () => {
    // exemplar ref 80 → floor = max(80, round(0.95×80)=76) = 80; target 85 clears all.
    const result = computeAwardBar(radar(85, 'high'), [exemplar(80)]);
    expect(result.verdict).toBe('cleared');
    expect(result.shortfalls).toEqual([]);
    expect(result.reason).toBeUndefined();
    for (const dim of DIMS) {
      expect(result.dimensions[dim]).toEqual({ score: 85, floor: 80, cleared: true });
    }
  });

  it('is not-cleared and lists exactly the shortfall dimensions', () => {
    const result = computeAwardBar(
      radar(85, 'high', { innovation: { score: 70 }, hierarchy: { score: 60 } }),
      [exemplar(80)]
    );
    expect(result.verdict).toBe('not-cleared');
    expect(result.shortfalls.sort()).toEqual(['hierarchy', 'innovation']);
    expect(result.dimensions.innovation.cleared).toBe(false);
    expect(result.dimensions.function.cleared).toBe(true);
  });

  it('forces indeterminate when any dimension confidence is below the floor, regardless of scores', () => {
    const result = computeAwardBar(radar(99, 'high', { craftExecution: { confidence: 'low' } }), [
      exemplar(80),
    ]);
    expect(result.verdict).toBe('indeterminate');
    expect(result.reason).toBe('low-confidence');
    // Dimensions are still populated for legibility; all scores did clear.
    expect(result.shortfalls).toEqual([]);
  });

  it('uses the MEDIAN of exemplar references (robust to one low outlier)', () => {
    // hierarchy refs [95, 90, 40] → median 90 → floor = max(80, round(0.95×90)=86) = 86.
    // A mean would give 75→71 (clamped to 80); the median keeps the bar at 86.
    const exemplars = [
      exemplar(90, { hierarchy: 95 }),
      exemplar(90, { hierarchy: 90 }),
      exemplar(90, { hierarchy: 40 }),
    ];
    const result = computeAwardBar(radar(88, 'high'), exemplars);
    expect(result.dimensions.hierarchy.floor).toBe(86);
    // 88 ≥ 86 → that dimension clears despite the outlier.
    expect(result.dimensions.hierarchy.cleared).toBe(true);
  });

  it('averages the two middle references for an even-length exemplar set', () => {
    // refs [80, 90] → median 85 → floor = max(80, round(0.95×85)=81) = 81.
    const result = computeAwardBar(radar(82, 'high'), [
      exemplar(80, { hierarchy: 80 }),
      exemplar(80, { hierarchy: 90 }),
    ]);
    expect(result.dimensions.hierarchy.floor).toBe(81);
  });

  it('never sinks below the config safety floor even when exemplars score low', () => {
    // exemplar ref 50 → round(0.95×50)=48, but the safety floor 80 wins.
    const result = computeAwardBar(radar(82, 'high'), [exemplar(50)]);
    for (const dim of DIMS) {
      expect(result.dimensions[dim].floor).toBe(80);
    }
    expect(result.verdict).toBe('cleared');
  });

  it('honors a config override of confidenceFloor', () => {
    // With confidenceFloor 'low', a single 'low'-confidence dimension no
    // longer forces indeterminate.
    const cfg: Partial<AwardBarConfig> = { confidenceFloor: 'low' };
    const result = computeAwardBar(
      radar(85, 'high', { innovation: { confidence: 'low' } }),
      [exemplar(80)],
      cfg
    );
    expect(result.verdict).toBe('cleared');
  });

  it('honors a config override of dimensionFloor', () => {
    // dimensionFloor 90 raises every floor to 90; target 85 clears nothing.
    const result = computeAwardBar(radar(85, 'high'), [exemplar(80)], { dimensionFloor: 90 });
    expect(result.verdict).toBe('not-cleared');
    expect(result.shortfalls.length).toBe(DIMS.length);
    for (const dim of DIMS) {
      expect(result.dimensions[dim].floor).toBe(90);
    }
  });

  it('indeterminate overrides not-cleared when a dimension is both sub-floor and low-confidence', () => {
    // Every score (60) is below the floor (80) AND innovation is low-confidence.
    // The confidence gate must win: verdict `indeterminate`, not `not-cleared`.
    const result = computeAwardBar(radar(60, 'high', { innovation: { confidence: 'low' } }), [
      exemplar(80),
    ]);
    expect(result.verdict).toBe('indeterminate');
    expect(result.reason).toBe('low-confidence');
    // shortfalls are still recorded for legibility even when indeterminate.
    expect(result.shortfalls.length).toBeGreaterThan(0);
  });

  it('falls back to the config safety floor when no exemplars are cited', () => {
    const result = computeAwardBar(radar(85, 'high'), []);
    for (const dim of DIMS) {
      expect(result.dimensions[dim].floor).toBe(DEFAULT_AWARD_BAR_CONFIG.dimensionFloor);
    }
    expect(result.verdict).toBe('cleared');
  });
});
