import { describe, it, expect } from 'vitest';
import { serializeSignals } from './signals.js';

describe('serializeSignals', () => {
  it('drops undefined pre-diff fields and keeps text-only signals', () => {
    const out = serializeSignals({
      descriptionLength: 120,
      specExists: true,
      acceptanceMeasurable: false,
    });
    expect(out).toEqual({
      descriptionLength: 120,
      specExists: true,
      acceptanceMeasurable: false,
    });
    expect('blastRadius' in out).toBe(false);
  });
  it('includes diff-based fields post-diff', () => {
    const out = serializeSignals({
      filesTouched: 3,
      layersTouched: 1,
      blastRadius: 7,
      hotspotChurn: 0.4,
      descriptionLength: 40,
      specExists: false,
      acceptanceMeasurable: true,
    });
    expect(out.blastRadius).toBe(7);
    expect(out.filesTouched).toBe(3);
  });
});
