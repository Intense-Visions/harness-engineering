// packages/intelligence/src/triage/retrospective.test.ts
//
// Roadmap Auto-Triage — Phase 4, Task 1: the pure prediction-vs-actual comparator.
// SC1–SC2 (numeric "exceeded" definition), SC3/SC7 (mismatch/error ⇒ block-escalate).

import { describe, it, expect } from 'vitest';
import type { ComplexityVerdict } from '@harness-engineering/types';
import { compareToPrediction, LEVEL_RANK } from './retrospective.js';
import type { TriagePrediction } from './record.js';

/** A minimal prediction fixture: predicted level + predicted blast-radius (scopeEstimate). */
function prediction(
  level: ComplexityVerdict['level'],
  scopeEstimate: number,
  overrides: Partial<TriagePrediction> = {}
): TriagePrediction {
  return {
    verdict: { level, confidence: 'medium', signals: {}, source: 'static' },
    levers: {},
    scopeEstimate,
    ratchetStage: 2,
    ...overrides,
  };
}

/** A minimal post-diff actual verdict: actual level + actual blast-radius signal. */
function actual(
  level: ComplexityVerdict['level'],
  blastRadius: number,
  confidence: ComplexityVerdict['confidence'] = 'high'
): ComplexityVerdict {
  return { level, confidence, signals: { blastRadius }, source: 'static' };
}

describe('compareToPrediction', () => {
  it('matches when actual level == predicted and blast-radius within scope', () => {
    const r = compareToPrediction(prediction('simple', 5), actual('simple', 4));
    expect(r.matched).toBe(true);
    expect(r.exceededBy).toBe(0);
    expect(r.action).toBe('verify');
  });

  it('matches when the diff came in SIMPLER than predicted (under-scope is not a mispredict)', () => {
    // Predicted moderate, diff was trivial — the item was easier than feared. Not a violation.
    const r = compareToPrediction(prediction('moderate', 10), actual('trivial', 1));
    expect(r.matched).toBe(true);
    expect(r.exceededBy).toBe(0);
    expect(r.action).toBe('verify');
  });

  it('SC2: level delta ≥ 1 band over prediction ⇒ mismatch (block-escalate)', () => {
    // Predicted simple, diff classified moderate — one band over.
    const r = compareToPrediction(prediction('simple', 5), actual('moderate', 4));
    expect(r.matched).toBe(false);
    expect(r.exceededBy).toBe(LEVEL_RANK.moderate - LEVEL_RANK.simple);
    expect(r.action).toBe('block-escalate');
  });

  it('SC2: two bands over ⇒ mismatch with larger exceededBy', () => {
    const r = compareToPrediction(prediction('trivial', 2), actual('moderate', 2));
    expect(r.matched).toBe(false);
    expect(r.exceededBy).toBe(LEVEL_RANK.moderate - LEVEL_RANK.trivial);
    expect(r.action).toBe('block-escalate');
  });

  it('SC2: blast-radius over the predicted-scope threshold ⇒ mismatch even at the same level', () => {
    // Same level band, but the actual blast radius blew past the predicted scope.
    const r = compareToPrediction(prediction('simple', 3), actual('simple', 30));
    expect(r.matched).toBe(false);
    expect(r.exceededBy).toBeGreaterThan(0);
    expect(r.action).toBe('block-escalate');
  });

  it('blast-radius modestly above prediction but within tolerance stays matched', () => {
    // Small overrun within the multiplicative + additive tolerance is not a mispredict.
    const r = compareToPrediction(prediction('simple', 10), actual('simple', 11));
    expect(r.matched).toBe(true);
    expect(r.action).toBe('verify');
  });

  it('SC7: missing prediction ⇒ block-escalate (fail-safe, never a silent pass)', () => {
    const r = compareToPrediction(undefined, actual('simple', 2));
    expect(r.matched).toBe(false);
    expect(r.action).toBe('block-escalate');
  });

  it('SC7: garbled prediction (missing verdict/level) ⇒ block-escalate', () => {
    const garbled = {
      levers: {},
      scopeEstimate: 3,
      ratchetStage: 2,
    } as unknown as TriagePrediction;
    const r = compareToPrediction(garbled, actual('simple', 2));
    expect(r.matched).toBe(false);
    expect(r.action).toBe('block-escalate');
  });

  it('SC7: garbled actual (missing level) ⇒ block-escalate', () => {
    const garbled = {
      confidence: 'high',
      signals: {},
      source: 'static',
    } as unknown as ComplexityVerdict;
    const r = compareToPrediction(prediction('simple', 3), garbled);
    expect(r.matched).toBe(false);
    expect(r.action).toBe('block-escalate');
  });

  it('SC7: an unknown/invalid level string ⇒ block-escalate (never trusted as a pass)', () => {
    const weird = {
      level: 'nonsense',
      confidence: 'high',
      signals: {},
      source: 'static',
    } as unknown as ComplexityVerdict;
    const r = compareToPrediction(prediction('simple', 3), weird);
    expect(r.matched).toBe(false);
    expect(r.action).toBe('block-escalate');
  });

  it('missing blast-radius signal on the actual falls back to level-only comparison (matched)', () => {
    const noBlast = {
      level: 'simple',
      confidence: 'high',
      signals: {},
      source: 'static',
    } as ComplexityVerdict;
    const r = compareToPrediction(prediction('simple', 5), noBlast);
    expect(r.matched).toBe(true);
    expect(r.action).toBe('verify');
  });
});
