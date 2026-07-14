// packages/intelligence/src/triage/rank.test.ts
//
// Roadmap Auto-Triage — Phase 1, Task 4 (TDD): the triage ranking spec (SC7 / SC-F3).
//
// Ranking reuses the roadmap-pilot score `(impact × confidence) ÷ effort`, with IMPACT
// as the DETERMINISTIC secondary sort so that among equal-score items the higher-impact
// work is always ordered first. Pure + total (no throws on zero/edge inputs).

import { describe, it, expect } from 'vitest';
import { pilotScore, rankTriageCandidates, type RankableCandidate } from './rank.js';

function cand(overrides: Partial<RankableCandidate>): RankableCandidate {
  return {
    externalId: 'X',
    impact: 3,
    confidence: 3,
    effort: 1,
    ...overrides,
  };
}

describe('pilotScore — (impact × confidence) ÷ effort', () => {
  it('computes the pilot formula', () => {
    expect(pilotScore(cand({ impact: 4, confidence: 3, effort: 2 }))).toBeCloseTo(6);
  });

  it('is total: zero effort does not throw or produce NaN (degrades to a finite score)', () => {
    const s = pilotScore(cand({ impact: 2, confidence: 2, effort: 0 }));
    expect(Number.isFinite(s)).toBe(true);
  });
});

describe('rankTriageCandidates — SC7 impact as secondary sort', () => {
  it('orders by pilot score descending', () => {
    const ranked = rankTriageCandidates([
      cand({ externalId: 'low', impact: 1, confidence: 1, effort: 2 }), // 0.5
      cand({ externalId: 'high', impact: 5, confidence: 4, effort: 1 }), // 20
      cand({ externalId: 'mid', impact: 2, confidence: 3, effort: 2 }), // 3
    ]);
    expect(ranked.map((c) => c.externalId)).toEqual(['high', 'mid', 'low']);
  });

  it('breaks a score tie by IMPACT descending (the deterministic tiebreak)', () => {
    // Both score 6, but different impact — higher impact must come first.
    const ranked = rankTriageCandidates([
      cand({ externalId: 'lowImpact', impact: 2, confidence: 6, effort: 2 }), // (2*6)/2 = 6
      cand({ externalId: 'highImpact', impact: 6, confidence: 2, effort: 2 }), // (6*2)/2 = 6
    ]);
    expect(ranked.map((c) => c.externalId)).toEqual(['highImpact', 'lowImpact']);
  });

  it('is deterministic and stable when score AND impact tie (falls back to externalId)', () => {
    const a = rankTriageCandidates([
      cand({ externalId: 'b', impact: 3, confidence: 2, effort: 1 }),
      cand({ externalId: 'a', impact: 3, confidence: 2, effort: 1 }),
    ]);
    const b = rankTriageCandidates([
      cand({ externalId: 'a', impact: 3, confidence: 2, effort: 1 }),
      cand({ externalId: 'b', impact: 3, confidence: 2, effort: 1 }),
    ]);
    expect(a.map((c) => c.externalId)).toEqual(b.map((c) => c.externalId));
  });

  it('does not mutate the input array', () => {
    const input = [
      cand({ externalId: 'x', impact: 1, confidence: 1, effort: 1 }),
      cand({ externalId: 'y', impact: 9, confidence: 1, effort: 1 }),
    ];
    const before = input.map((c) => c.externalId);
    rankTriageCandidates(input);
    expect(input.map((c) => c.externalId)).toEqual(before);
  });
});
