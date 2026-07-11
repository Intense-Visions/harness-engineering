import { describe, it, expect } from 'vitest';
import { runStaticPass, STATIC_WEIGHTS } from './static-pass.js';
import type { ComplexitySignals } from './types.js';

describe('runStaticPass', () => {
  it('exports documented seed weights', () => {
    expect(STATIC_WEIGHTS).toBeDefined();
    expect(typeof STATIC_WEIGHTS.blastRadius).toBe('number');
  });

  it('post-diff tiny change → trivial, high confidence', () => {
    const signals: ComplexitySignals = {
      filesTouched: 1,
      layersTouched: 1,
      blastRadius: 1,
      hotspotChurn: 0,
      descriptionLength: 30,
      specExists: true,
      acceptanceMeasurable: true,
    };
    const v = runStaticPass(signals, 'post-diff');
    expect(v.level).toBe('trivial');
    expect(v.confidence).toBe('high');
  });

  it('post-diff large fan-out → complex, high confidence', () => {
    const signals: ComplexitySignals = {
      filesTouched: 20,
      layersTouched: 4,
      blastRadius: 40,
      hotspotChurn: 0.9,
      descriptionLength: 400,
      specExists: false,
      acceptanceMeasurable: false,
    };
    const v = runStaticPass(signals, 'post-diff');
    expect(v.level).toBe('complex');
    expect(v.confidence).toBe('high');
  });

  it('post-diff ambiguous mid-range → low confidence (drives tie-break)', () => {
    const signals: ComplexitySignals = {
      filesTouched: 6,
      layersTouched: 2,
      blastRadius: 12,
      hotspotChurn: 0.5,
      descriptionLength: 150,
      specExists: false,
      acceptanceMeasurable: false,
    };
    const v = runStaticPass(signals, 'post-diff');
    expect(v.confidence).toBe('low');
  });

  it('pre-diff caps confidence at medium even when text score is decisive', () => {
    const signals: ComplexitySignals = {
      // diff fields undefined — pre-diff
      descriptionLength: 500,
      specExists: true,
      acceptanceMeasurable: true,
    };
    const v = runStaticPass(signals, 'pre-diff');
    expect(v.confidence).not.toBe('high');
  });

  it('pre-diff signals map has no diff-based keys', () => {
    const signals: ComplexitySignals = {
      descriptionLength: 80,
      specExists: false,
      acceptanceMeasurable: false,
    };
    const v = runStaticPass(signals, 'pre-diff');
    expect('blastRadius' in v.signals).toBe(false);
    expect('filesTouched' in v.signals).toBe(false);
    expect(v.signals.descriptionLength).toBe(80);
  });
});
